#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE=/opt/resume-expert/shared/resume-expert.sqlite
DEST=/var/backups/resume-expert
install -d -o root -g root -m 0700 "$DEST"
if [ ! -f "$SOURCE" ]; then
  echo "No history database yet; nothing to back up."
  exit 0
fi
NAME="$DEST/history-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
python3 - "$SOURCE" "$NAME" <<'PY'
import sqlite3,sys,os
source=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True)
dest=sqlite3.connect(sys.argv[2])
try:
    source.backup(dest)
    integrity=dest.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity!="ok":raise RuntimeError("SQLite backup integrity check failed")
finally:
    dest.close();source.close()
os.chmod(sys.argv[2],0o600)
print("BACKUP_OK")
PY
find "$DEST" -maxdepth 1 -type f -name 'history-*.sqlite' -mtime +14 -delete
