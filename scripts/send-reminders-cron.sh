#!/usr/bin/env bash
# Hourly trigger for the daily-reminder fan-out. Each student's reminder fires
# only during the local hour they chose (see /api/push/send-reminders).
# The CRON_SECRET is read at runtime from .env.local so it is never stored in
# the crontab. Installed via crontab: 0 * * * * /root/ima-coaching/scripts/send-reminders-cron.sh
set -euo pipefail
cd /root/ima-coaching

SECRET="$(grep -E '^CRON_SECRET=' .env.local | cut -d= -f2-)"
if [ -z "${SECRET}" ]; then
  echo "$(date -Is) CRON_SECRET missing in .env.local" >&2
  exit 1
fi

curl -fsS -m 60 \
  -H "Authorization: Bearer ${SECRET}" \
  http://localhost:3001/api/push/send-reminders
echo ""
