#!/usr/bin/env bash
set -Eeuo pipefail

# Install once as /usr/local/sbin/resume-expert-release-deploy, root:root 0755.
# Invoked as a forced command from authorized_keys, so this script does all its
# own input validation: the caller cannot choose an argument.
#
# Protocol: the first line of stdin is a JSON header
#   {"revision":"<40 hex>","sha256":"<64 hex>","size":<bytes>}
# followed by exactly that many bytes of the release tarball. The artifact is
# staged in a root-owned directory, never left in /tmp for the caller to write.

STATE=/var/lib/resume-expert-deploy
MAX_BYTES=220000000

fail() { echo "$*" >&2; exit 2; }

[[ "$(id -u)" -eq 0 ]] || fail "Root deployment privileges required"

install -d -m 0700 -o root -g root "$STATE"
cleanup() { rm -f "$STATE/artifact.tar.gz" "$STATE/header.json"; }
trap cleanup EXIT

# read, not "$(sed 1p)": command substitution drains stdin to EOF and would
# leave nothing for the artifact that follows the header line.
IFS= read -r header || fail "Missing protocol header"
[[ -n "$header" ]] || fail "Missing protocol header"

SHA="$(printf '%s' "$header" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("revision",""))' 2>/dev/null)" || fail "Malformed header"
DIGEST="$(printf '%s' "$header" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha256",""))' 2>/dev/null)" || fail "Malformed header"
DECLARED="$(printf '%s' "$header" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("size",0))' 2>/dev/null)" || fail "Malformed header"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Invalid release SHA"
[[ "$DIGEST" =~ ^[0-9a-f]{64}$ ]] || fail "Invalid digest"
[[ "$DECLARED" =~ ^[0-9]+$ ]] || fail "Invalid size"
[[ "$DECLARED" -gt 0 && "$DECLARED" -le "$MAX_BYTES" ]] || fail "Release size out of range"

ARTIFACT="$STATE/artifact.tar.gz"
head -c "$DECLARED" > "$ARTIFACT"
# Reject a stream longer than declared, so a caller cannot append to the archive.
if [[ -n "$(head -c 1)" ]]; then fail "Trailing bytes after artifact"; fi

actual_size="$(stat -c %s "$ARTIFACT")"
[[ "$actual_size" -eq "$DECLARED" ]] || fail "Truncated artifact ($actual_size of $DECLARED bytes)"
actual_digest="$(sha256sum "$ARTIFACT" | cut -d' ' -f1)"
[[ "$actual_digest" == "$DIGEST" ]] || fail "Digest mismatch"

PREFIX="${SHA:0:12}"
APP=/opt/resume-expert
RELEASE="$APP/releases/git-${PREFIX}"
TARGET="$RELEASE/standalone"
CURRENT="$APP/current"
ENV_FILE=/etc/resume-expert.env
BACKUP="/etc/resume-expert.env.before-${PREFIX}"

PREVIOUS="$(readlink -f "$CURRENT")"
[[ "$PREVIOUS" == "$APP/releases/"*/standalone ]] || fail "Unexpected previous release"

echo "Backing up SQLite with online integrity verification"
systemctl start resume-expert-history-backup.service
test -s "$APP/shared/resume-expert.sqlite"
find /var/backups/resume-expert -maxdepth 1 -type f -name 'history-*.sqlite' -mmin -8 -size +1k | grep -q .

if [[ -d "$TARGET" ]]; then
  [[ "$(readlink -f "$CURRENT")" == "$TARGET" ]] && { echo "Already deployed"; exit 0; }
  fail "Target release exists but is not active: refuse overwrite"
fi
install -d -m 0750 -o resume-expert -g resume-expert "$TARGET"
tar --no-same-owner -xzf "$ARTIFACT" -C "$TARGET"
chown -R resume-expert:resume-expert "$RELEASE"
test -s "$TARGET/server.js"
test -d "$TARGET/node_modules"
test -d "$TARGET/.next/static"
cp -p "$ENV_FILE" "$BACKUP"
chmod 0600 "$BACKUP"
switched=0
rollback() {
  rc=$?
  if [[ "$rc" -ne 0 && "$switched" -eq 1 ]]; then
    echo "Health check failed; restoring previous code and configuration" >&2
    ln -s "$PREVIOUS" "$CURRENT.rollback-${PREFIX}"
    mv -Tf "$CURRENT.rollback-${PREFIX}" "$CURRENT"
    cp -p "$BACKUP" "$ENV_FILE"
    systemctl restart resume-expert || true
  fi
  exit "$rc"
}
trap rollback EXIT
if grep -q '^RESUME_COMMIT=' "$ENV_FILE"; then
  sed -i "s/^RESUME_COMMIT=.*/RESUME_COMMIT=$SHA/" "$ENV_FILE"
else
  printf 'RESUME_COMMIT=%s\n' "$SHA" >> "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"
ln -s "$TARGET" "$CURRENT.next-${PREFIX}"
mv -Tf "$CURRENT.next-${PREFIX}" "$CURRENT"
switched=1
systemctl restart resume-expert
for i in $(seq 1 35); do
  response="$(curl -fsS --connect-timeout 2 --max-time 4 http://127.0.0.1:3101/api/health 2>/dev/null || true)"
  if [[ "$response" == *"$SHA"* ]]; then
    echo "DEPLOY_OK $SHA"
    echo "PREVIOUS $PREVIOUS"
    exit 0
  fi
  sleep 2
done
echo "DEPLOY_FAILED: no matching health response" >&2
exit 1
