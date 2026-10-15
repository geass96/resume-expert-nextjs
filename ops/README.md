# 简历专家历史库每日备份

脚本：ops/backup-history.sh。生产安装路径：/usr/local/sbin/resume-expert-backup；systemd 服务和 Timer 见本目录。

- 数据源：/opt/resume-expert/shared/resume-expert.sqlite
- 备份路径：/var/backups/resume-expert，仅 root 可访问
- 在线 SQLite backup API 快照，检查 PRAGMA integrity_check
- 每日触发，并保留约 14 天，定时器错过触发时补执行
- 首次尚未创建 DB 时安全跳过，不触碰其他 VPS 服务
- 生产数据恢复前必须先停止应用、额外备份当前数据并验证回滚；不能由定时备份自动覆盖生产库

这份本机快照不是异地灾难恢复；异地 R2 加密备份仍是后续独立任务。
