#!/usr/bin/env bash
# On-demand demo: trigger a SEV0 (critical) incident in Incy and watch it fire a
# signed outbound webhook. Ingests an event -> Incy creates an incident -> the worker
# delivers an HMAC-signed webhook to the subscribed receiver (incy-webhook-sink).
#
# Usage:  infra/chaos/sev0-webhook-demo.sh ["custom summary"]
# Env:    INCY_URL (default https://incy.tail353042.ts.net)
#         INCY_INTEGRATION_KEY (default seeded payment-api key)
set -euo pipefail

BASE="${INCY_URL:-https://incy.tail353042.ts.net}"
KEY="${INCY_INTEGRATION_KEY:-int_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
SUMMARY="${1:-SEV0: payment-api total outage — checkout down globally}"
STAMP="$(date +%s)"
DEDUP="sev0-demo-${STAMP}"

echo "▶ Triggering SEV0 incident via ${BASE}/v1/events"
echo "  dedup_key=${DEDUP}  severity=critical"
RESP="$(curl -s --max-time 20 -X POST "${BASE}/v1/events" \
  -H 'Content-Type: application/json' \
  -d "{\"integration_key\":\"${KEY}\",\"dedup_key\":\"${DEDUP}\",\"severity\":\"critical\",\"summary\":\"${SUMMARY}\",\"description\":\"Synthetic SEV0 raised by sev0-webhook-demo.sh\",\"source\":\"demo\",\"payload\":{\"runbook\":\"https://wiki/incident/sev0\",\"pager\":\"oncall-primary\"}}")"
echo "  event accepted:"
echo "$RESP" | python3 -m json.tool | sed 's/^/    /'

echo
echo "▶ Incident now open (filter status=triggered, newest first):"
curl -s --max-time 20 -H 'X-User-Id: 20000000-0000-0000-0000-000000000001' \
  "${BASE}/v1/incidents?status=triggered" \
  | python3 -c "import sys,json; xs=json.load(sys.stdin)['incidents']; xs=[i for i in xs if i['severity']=='critical']; i=sorted(xs,key=lambda x:x['incident_number'])[-1]; print(f\"    #{i['incident_number']}  {i['severity'].upper()}  {i['status']}  {i['title']}\")"

echo
echo "▶ Webhook delivery (sink receives an HMAC-signed POST within a few seconds):"
echo "  watch:  kubectl logs -n incy deploy/incy-webhook-sink -f"
