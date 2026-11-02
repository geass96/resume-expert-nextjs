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
SOURCE=sys.argv[1]; TARGET=sys.argv[2]

# Checkpoint before copying. The application keeps the database in WAL mode and
# may run for weeks without restarting, so committed data can sit only in the
# -wal file. A reader cannot checkpoint, which is why this script runs as root
# and does the checkpoint itself with a read-write connection.
# TRUNCATE, not PASSIVE: PASSIVE copies frames back but leaves the -wal file at
# its high-water size, and a file that never shrinks is what grew to 1.9 MB over
# twelve days here. TRUNCATE also resets it, and returns busy=1 instead of
# waiting when a reader holds a snapshot, so it never blocks the application;
# a busy result just means this run leaves the file for the next one.
try:
    admin=sqlite3.connect(SOURCE,timeout=30)
    try:
        busy,log_frames,checkpointed=admin.execute("PRAGMA wal_checkpoint(TRUNCATE);").fetchone()
    finally:
        admin.close()
    print("CHECKPOINT busy=%s frames=%s done=%s" % (busy,log_frames,checkpointed))
except sqlite3.Error as error:
    # A failed checkpoint must not cost us the backup; the copy below still
    # reads the WAL and therefore still sees every committed row.
    print("CHECKPOINT_SKIPPED %s" % error)

source=sqlite3.connect("file:"+SOURCE+"?mode=ro",uri=True)
dest=sqlite3.connect(TARGET)
try:
    source.backup(dest)
    integrity=dest.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity!="ok":raise RuntimeError("SQLite backup integrity check failed")
finally:
    dest.close();source.close()
os.chmod(TARGET,0o600)
print("BACKUP_OK")
PY
find "$DEST" -maxdepth 1 -type f -name 'history-*.sqlite' -mtime +14 -delete
