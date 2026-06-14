#!/usr/bin/env bash
# On-demand demo of the full loop:
#   SEV0 event -> Incy incident -> signed webhook -> Redis task queue (incy-taskq)
#   -> autonomous agent claims it -> agent writes status back to Incy
#      (POST /v1/incidents/{id}/agent: claimed -> in_progress -> completed)
#
# Usage:  infra/chaos/agent-queue-demo.sh ["custom summary"]
# Env:    INCY_URL (default https://incy.tail353042.ts.net)
#         INCY_INTEGRATION_KEY (default seeded payment-api key)
set -euo pipefail

BASE="${INCY_URL:-https://incy.tail353042.ts.net}"
KEY="${INCY_INTEGRATION_KEY:-int_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
SUMMARY="${1:-SEV0: payment-api 5xx surge — checkout failing}"
DEDUP="sev0-agentq-$(date +%s)"
HDR=(-H "X-User-Id: 20000000-0000-0000-0000-000000000001")

echo "▶ Triggering SEV0 incident  (dedup_key=${DEDUP})"
curl -s --max-time 20 -X POST "${BASE}/v1/events" -H 'Content-Type: application/json' \
  -d "{\"integration_key\":\"${KEY}\",\"dedup_key\":\"${DEDUP}\",\"severity\":\"critical\",\"summary\":\"${SUMMARY}\",\"source\":\"demo\"}" \
  | python3 -c "import sys,json;e=json.load(sys.stdin);print(f\"  event accepted: {e['severity']} :: {e['summary']}\")"

echo "▶ Resolving newest critical incident id..."
sleep 6   # let the worker deliver the webhook -> queue -> agent claim
IID=$(curl -s --max-time 15 "${HDR[@]}" "${BASE}/v1/incidents?status=triggered" \
  | python3 -c "import sys,json;xs=[i for i in json.load(sys.stdin)['incidents'] if i['severity']=='critical'];print(sorted(xs,key=lambda x:x['incident_number'])[-1]['id'])")
echo "  incident: ${IID}"

echo "▶ Watching agent writeback (queue -> agent -> Incy)..."
for i in $(seq 1 20); do
  OUT=$(curl -s --max-time 15 "${HDR[@]}" "${BASE}/v1/incidents/${IID}/agent")
  echo "$OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for u in d['updates']:
    print(f\"    [{u['created_at'][11:19]}] {u['agent_name']} ({u['agent_id']}) -> {u['status'].upper():12} {u['detail'] or ''}\")
print('---')
"
  STATUS=$(echo "$OUT" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('latest') or {}).get('status',''))")
  [ "$STATUS" = "completed" ] && { echo "✔ Agent completed the task."; break; }
  sleep 2
done
