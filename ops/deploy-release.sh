#!/usr/bin/env bash
set -Eeuo pipefail

# Install once as /usr/local/sbin/resume-expert-release-deploy, root:root 0755.
# Only an explicitly authorized sudo rule should permit invoking this script.
SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release SHA" >&2; exit 2; }
PREFIX="${SHA:0:12}"
APP=/opt/resume-expert
ARTIFACT="/tmp/resume-expert-release-${SHA}.tar.gz"
RELEASE="$APP/releases/git-${PREFIX}"
TARGET="$RELEASE/standalone"
CURRENT="$APP/current"
ENV_FILE=/etc/resume-expert.env
BACKUP="/etc/resume-expert.env.before-${PREFIX}"
[[ "$(id -u)" -eq 0 ]] || { echo "Root deployment privileges required" >&2; exit 2; }
[[ -f "$ARTIFACT" && -s "$ARTIFACT" ]] || { echo "Release artifact missing" >&2; exit 2; }
[[ "$(stat -c %s "$ARTIFACT")" -lt 220000000 ]] || { echo "Release too large" >&2; exit 2; }
PREVIOUS="$(readlink -f "$CURRENT")"
[[ "$PREVIOUS" == "$APP/releases/"*/standalone ]] || { echo "Unexpected previous release" >&2; exit 2; }

echo "Backing up SQLite with online integrity verification"
systemctl start resume-expert-history-backup.service
test -s "$APP/shared/resume-expert.sqlite"
find /var/backups/resume-expert -maxdepth 1 -type f -name 'history-*.sqlite' -mmin -8 -size +1k | grep -q .

if [[ -d "$TARGET" ]]; then
  [[ "$(readlink -f "$CURRENT")" == "$TARGET" ]] && { echo "Already deployed"; exit 0; }
  echo "Target release exists but is not active: refuse overwrite" >&2
  exit 2
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
    rm -f "$ARTIFACT"
    exit 0
  fi
  sleep 2
done
echo "DEPLOY_FAILED: no matching health response" >&2
exit 1
