#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# incy-demo.sh — Chaos demo script for Incy + Grafana integration
#
# Usage:
#   ./incy-demo.sh setup              Deploy MongoDB, start ngrok, configure Grafana
#   ./incy-demo.sh trigger [N]        Trigger failure scenarios (all or 1-4)
#   ./incy-demo.sh reset [N]          Reset failure scenarios (alerts auto-resolve via Grafana)
#   ./incy-demo.sh teardown           Remove k8s resources (preserves Grafana config + ngrok)
#   ./incy-demo.sh teardown-grafana   Full cleanup: remove alert rules, contact point, policy, stop ngrok
#   ./incy-demo.sh status             Show current state
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.demo-state.json"
NAMESPACE="demo-sre"

# Grafana config
GRAFANA_URL="${GRAFANA_URL:-http://134.199.138.52}"
GRAFANA_USER="${GRAFANA_USER:-admin}"
GRAFANA_PASS="${GRAFANA_PASS:-}"
GRAFANA_FOLDER_UID="doks-alerts-folder"
GRAFANA_RULE_GROUP="incy-alerts"
GRAFANA_DATASOURCE_UID="PBFA97CFB590B2093"

# Incy config
INCY_API="${INCY_API:-http://localhost:8000}"
INTEGRATION_KEY="int_043aaf39c58eff171bf88e4181e26f92"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[incy-demo]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

grafana_api() {
    local method="$1" path="$2"
    shift 2
    curl -sf -X "$method" \
        -u "$GRAFANA_USER:$GRAFANA_PASS" \
        -H "Content-Type: application/json" \
        "$GRAFANA_URL$path" "$@"
}

save_state() {
    echo "$1" > "$STATE_FILE"
}

load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    else
        echo '{}'
    fi
}

# ---------------------------------------------------------------------------
# SETUP
# ---------------------------------------------------------------------------
cmd_setup() {
    log "Setting up Incy demo environment..."

    # 1. Deploy MongoDB
    log "Deploying MongoDB to $NAMESPACE..."
    kubectl apply -f "$SCRIPT_DIR/../k8s/mongodb.yaml"
    log "Waiting for MongoDB pod to be ready..."
    kubectl rollout status deployment/mongodb -n "$NAMESPACE" --timeout=120s
    ok "MongoDB deployed"

    # 2. Start ngrok
    log "Starting ngrok tunnel to localhost:8000..."
    if pgrep -f "ngrok http 8000" > /dev/null 2>&1; then
        warn "ngrok already running, reusing existing tunnel"
    else
        ngrok http 8000 --log=stdout --log-level=warn > /tmp/ngrok-incy.log 2>&1 &
        sleep 3
    fi

    # Get ngrok public URL
    local ngrok_url
    ngrok_url=$(curl -sf http://localhost:4040/api/tunnels | python3 -c "import sys,json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null || true)
    if [[ -z "$ngrok_url" ]]; then
        err "Could not get ngrok URL. Is ngrok running?"
        err "Start it manually: ngrok http 8000"
        return 1
    fi
    ok "ngrok tunnel: $ngrok_url"

    # 3. Create/update Grafana contact point
    local webhook_url="${ngrok_url}/v1/webhooks/grafana?integration_key=${INTEGRATION_KEY}"
    log "Creating Grafana contact point 'Incy Webhook'..."

    # Check if contact point already exists
    local existing_cp
    existing_cp=$(grafana_api GET "/api/v1/provisioning/contact-points" 2>/dev/null | python3 -c "
import sys, json
cps = json.load(sys.stdin)
for cp in cps:
    if cp.get('name') == 'Incy Webhook':
        print(cp['uid'])
        break
" 2>/dev/null || true)

    if [[ -n "$existing_cp" ]]; then
        # Update existing
        grafana_api PUT "/api/v1/provisioning/contact-points/$existing_cp" \
            -d "{
                \"name\": \"Incy Webhook\",
                \"type\": \"webhook\",
                \"settings\": {
                    \"url\": \"$webhook_url\",
                    \"httpMethod\": \"POST\"
                }
            }" > /dev/null
        ok "Updated contact point (uid: $existing_cp)"
    else
        # Create new
        local cp_response
        cp_response=$(grafana_api POST "/api/v1/provisioning/contact-points" \
            -d "{
                \"name\": \"Incy Webhook\",
                \"type\": \"webhook\",
                \"settings\": {
                    \"url\": \"$webhook_url\",
                    \"httpMethod\": \"POST\"
                }
            }")
        existing_cp=$(echo "$cp_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uid',''))" 2>/dev/null || true)
        ok "Created contact point (uid: $existing_cp)"
    fi

    # 4. Update notification policy to route incy=true to our contact point
    log "Updating notification policy..."
    local current_policy
    current_policy=$(grafana_api GET "/api/v1/provisioning/policies")

    # Add a child route for incy=true if not already present
    local updated_policy
    updated_policy=$(echo "$current_policy" | python3 -c "
import sys, json
policy = json.load(sys.stdin)
routes = policy.get('routes', []) or []

# Remove existing incy route if present
routes = [r for r in routes if not (r.get('object_matchers') and any(m == ['incy', '=', 'true'] for m in r.get('object_matchers', [])))]

# Add incy route at the top
routes.insert(0, {
    'receiver': 'Incy Webhook',
    'object_matchers': [['incy', '=', 'true']],
    'continue': False
})

policy['routes'] = routes
print(json.dumps(policy))
")
    grafana_api PUT "/api/v1/provisioning/policies" -d "$updated_policy" > /dev/null
    ok "Notification policy updated"

    # 5. Create alert rules
    log "Creating Grafana alert rules..."
    _create_alert_rules
    ok "Alert rules created"

    # Save state
    save_state "$(NGROK_URL_VAL="$ngrok_url" CP_UID_VAL="$existing_cp" WH_URL_VAL="$webhook_url" python3 -c "
import os, json
print(json.dumps({
    'ngrok_url': os.environ['NGROK_URL_VAL'],
    'contact_point_uid': os.environ['CP_UID_VAL'],
    'webhook_url': os.environ['WH_URL_VAL'],
    'setup_complete': True
}))
")"

    echo ""
    ok "Setup complete!"
    log "  ngrok URL:    $ngrok_url"
    log "  Webhook URL:  $webhook_url"
    log "  Grafana:      $GRAFANA_URL"
    echo ""
    log "Next: ./incy-demo.sh trigger"
}

_create_alert_rules() {
    # Create all 4 alert rules in a single rule group
    grafana_api POST "/api/v1/provisioning/alert-rules" \
        -d "$(cat <<'RULE1'
{
    "title": "Pod CrashLoop",
    "ruleGroup": "incy-alerts",
    "folderUID": "doks-alerts-folder",
    "for": "1m",
    "condition": "C",
    "labels": {
        "incy": "true"
    },
    "annotations": {
        "summary": "{{ $labels.container }} is crash-looping ({{ $value }} restarts in 5m)",
        "description": "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is restart-looping"
    },
    "data": [
        {
            "refId": "A",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "PBFA97CFB590B2093",
            "model": {
                "expr": "increase(kube_pod_container_status_restarts_total{namespace=\"demo-sre\", container=~\"catalog-api|payments-api\"}[5m])",
                "refId": "A"
            }
        },
        {
            "refId": "B",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "reduce",
                "expression": "A",
                "reducer": "last",
                "refId": "B"
            }
        },
        {
            "refId": "C",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "threshold",
                "expression": "B",
                "conditions": [{
                    "evaluator": { "type": "gt", "params": [2] }
                }],
                "refId": "C"
            }
        }
    ]
}
RULE1
)" > /dev/null && ok "  Alert 1: Pod CrashLoop" || warn "  Alert 1 may already exist"

    grafana_api POST "/api/v1/provisioning/alert-rules" \
        -d "$(cat <<'RULE2'
{
    "title": "Service Degradation - catalog-api",
    "ruleGroup": "incy-alerts",
    "folderUID": "doks-alerts-folder",
    "for": "30s",
    "condition": "C",
    "labels": {
        "severity": "critical",
        "service": "catalog-api",
        "incy": "true"
    },
    "annotations": {
        "summary": "catalog-api has zero available replicas",
        "description": "All pods for catalog-api are unavailable — service is fully degraded"
    },
    "data": [
        {
            "refId": "A",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "PBFA97CFB590B2093",
            "model": {
                "expr": "kube_deployment_status_replicas_available{namespace=\"demo-sre\", deployment=\"catalog-api\"}",
                "refId": "A"
            }
        },
        {
            "refId": "B",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "reduce",
                "expression": "A",
                "reducer": "last",
                "refId": "B"
            }
        },
        {
            "refId": "C",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "threshold",
                "expression": "B",
                "conditions": [{
                    "evaluator": { "type": "lt", "params": [1] }
                }],
                "refId": "C"
            }
        }
    ]
}
RULE2
)" > /dev/null && ok "  Alert 2: Service Degradation" || warn "  Alert 2 may already exist"

    grafana_api POST "/api/v1/provisioning/alert-rules" \
        -d "$(cat <<'RULE3'
{
    "title": "OOMKill Events",
    "ruleGroup": "incy-alerts",
    "folderUID": "doks-alerts-folder",
    "for": "0s",
    "condition": "C",
    "labels": {
        "incy": "true"
    },
    "annotations": {
        "summary": "{{ $labels.container }} OOMKilled",
        "description": "Container {{ $labels.container }} in pod {{ $labels.pod }} was OOMKilled"
    },
    "data": [
        {
            "refId": "A",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "PBFA97CFB590B2093",
            "model": {
                "expr": "increase(container_oom_events_total{namespace=\"demo-sre\", container!=\"\"}[5m])",
                "refId": "A"
            }
        },
        {
            "refId": "B",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "reduce",
                "expression": "A",
                "reducer": "last",
                "refId": "B"
            }
        },
        {
            "refId": "C",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "threshold",
                "expression": "B",
                "conditions": [{
                    "evaluator": { "type": "gt", "params": [0] }
                }],
                "refId": "C"
            }
        }
    ]
}
RULE3
)" > /dev/null && ok "  Alert 3: OOMKill Events" || warn "  Alert 3 may already exist"

    grafana_api POST "/api/v1/provisioning/alert-rules" \
        -d "$(cat <<'RULE4'
{
    "title": "MongoDB Connectivity Failure",
    "ruleGroup": "incy-alerts",
    "folderUID": "doks-alerts-folder",
    "for": "30s",
    "condition": "C",
    "labels": {
        "severity": "critical",
        "service": "mongodb",
        "incy": "true"
    },
    "annotations": {
        "summary": "MongoDB is unavailable",
        "description": "MongoDB deployment in demo-sre has zero available replicas — database connectivity lost"
    },
    "data": [
        {
            "refId": "A",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "PBFA97CFB590B2093",
            "model": {
                "expr": "kube_deployment_status_replicas_available{namespace=\"demo-sre\", deployment=\"mongodb\"}",
                "refId": "A"
            }
        },
        {
            "refId": "B",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "reduce",
                "expression": "A",
                "reducer": "last",
                "refId": "B"
            }
        },
        {
            "refId": "C",
            "relativeTimeRange": { "from": 600, "to": 0 },
            "datasourceUid": "__expr__",
            "model": {
                "type": "threshold",
                "expression": "B",
                "conditions": [{
                    "evaluator": { "type": "lt", "params": [1] }
                }],
                "refId": "C"
            }
        }
    ]
}
RULE4
)" > /dev/null && ok "  Alert 4: MongoDB Connectivity Failure" || warn "  Alert 4 may already exist"
}

# ---------------------------------------------------------------------------
# TRIGGER
# ---------------------------------------------------------------------------
cmd_trigger() {
    local scenario="${1:-all}"

    if [[ "$scenario" == "all" ]]; then
        _trigger_1
        _trigger_2
        _trigger_3
        _trigger_4
        echo ""
        ok "All scenarios triggered. Wait ~2 min for Grafana alerts to fire."
    else
        case "$scenario" in
            1) _trigger_1 ;;
            2) _trigger_2 ;;
            3) _trigger_3 ;;
            4) _trigger_4 ;;
            *) err "Unknown scenario: $scenario (use 1-4)" ; exit 1 ;;
        esac
    fi
}

_trigger_1() {
    log "Scenario 1: CrashLoop — patching catalog-api & payments-api with crash command..."
    kubectl patch deployment catalog-api -n "$NAMESPACE" --type=json \
        -p='[{"op":"add","path":"/spec/template/spec/containers/0/command","value":["sh","-c","sleep 2 && exit 1"]}]'
    kubectl patch deployment payments-api -n "$NAMESPACE" --type=json \
        -p='[{"op":"add","path":"/spec/template/spec/containers/0/command","value":["sh","-c","sleep 2 && exit 1"]}]'
    ok "Scenario 1 triggered — pods will enter CrashLoopBackOff"
    log "  -> Alert: 'Pod CrashLoop' should fire within ~2-3 min"
}

_trigger_2() {
    log "Scenario 2: Service Degradation — scaling catalog-api to 0..."
    kubectl scale deployment/catalog-api -n "$NAMESPACE" --replicas=0
    ok "Scenario 2 triggered — catalog-api has 0 replicas"
    log "  -> Alert: 'Service Degradation - catalog-api' should fire within ~1 min"
}

_trigger_3() {
    log "Scenario 3: OOMKill — deploying memory stress deployment..."
    kubectl apply -n "$NAMESPACE" -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oom-stress
  labels:
    app: oom-stress
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oom-stress
  template:
    metadata:
      labels:
        app: oom-stress
    spec:
      containers:
      - name: oom-stress
        image: polinux/stress
        command: ["stress"]
        args: ["--vm", "1", "--vm-bytes", "256M", "--vm-hang", "1"]
        resources:
          limits:
            memory: 32Mi
EOF
    ok "Scenario 3 triggered — pods will OOMKill repeatedly"
    log "  -> Alert: 'OOMKill Events' should fire within ~2 min"
}

_trigger_4() {
    log "Scenario 4: MongoDB Failure — scaling mongodb to 0..."
    kubectl scale deployment/mongodb -n "$NAMESPACE" --replicas=0
    ok "Scenario 4 triggered — MongoDB has 0 replicas"
    log "  -> Alert: 'MongoDB Connectivity Failure' should fire within ~1 min"
}

# ---------------------------------------------------------------------------
# RESET
# ---------------------------------------------------------------------------
cmd_reset() {
    local scenario="${1:-all}"

    if [[ "$scenario" == "all" ]]; then
        _reset_1
        _reset_2
        _reset_3
        _reset_4
        echo ""
        ok "All scenarios reset. Wait ~2 min for Grafana alerts to resolve."
    else
        case "$scenario" in
            1) _reset_1 ;;
            2) _reset_2 ;;
            3) _reset_3 ;;
            4) _reset_4 ;;
            *) err "Unknown scenario: $scenario (use 1-4)" ; exit 1 ;;
        esac
    fi
}

_reset_1() {
    log "Resetting scenario 1: CrashLoop — rolling back catalog-api & payments-api..."
    kubectl rollout undo deployment/catalog-api -n "$NAMESPACE" 2>/dev/null || true
    kubectl rollout undo deployment/payments-api -n "$NAMESPACE" 2>/dev/null || true
    log "Waiting for rollout..."
    kubectl rollout status deployment/catalog-api -n "$NAMESPACE" --timeout=120s 2>/dev/null || true
    kubectl rollout status deployment/payments-api -n "$NAMESPACE" --timeout=120s 2>/dev/null || true
    ok "Scenario 1 reset"
}

_reset_2() {
    log "Resetting scenario 2: Service Degradation — scaling catalog-api to 1..."
    kubectl scale deployment/catalog-api -n "$NAMESPACE" --replicas=1
    kubectl rollout status deployment/catalog-api -n "$NAMESPACE" --timeout=120s
    ok "Scenario 2 reset"
}

_reset_3() {
    log "Resetting scenario 3: OOMKill — deleting stress deployment..."
    kubectl delete deployment oom-stress -n "$NAMESPACE" --ignore-not-found
    ok "Scenario 3 reset"
}

_reset_4() {
    log "Resetting scenario 4: MongoDB Failure — scaling mongodb to 1..."
    kubectl scale deployment/mongodb -n "$NAMESPACE" --replicas=1
    kubectl rollout status deployment/mongodb -n "$NAMESPACE" --timeout=120s
    ok "Scenario 4 reset"
}

# ---------------------------------------------------------------------------
# TEARDOWN
# ---------------------------------------------------------------------------
cmd_teardown() {
    log "Tearing down Incy demo k8s resources..."
    log "Note: Grafana config (alert rules, contact point, notification policy) and ngrok are preserved."

    # Reset all scenarios first
    log "Resetting all scenarios..."
    _reset_1 2>/dev/null || true
    _reset_2 2>/dev/null || true
    _reset_3 2>/dev/null || true
    _reset_4 2>/dev/null || true

    # Delete MongoDB deployment
    log "Removing MongoDB..."
    kubectl delete -f "$SCRIPT_DIR/../k8s/mongodb.yaml" --ignore-not-found
    ok "MongoDB removed"

    echo ""
    ok "Teardown complete!"
    log "Grafana alert rules, contact point, notification policy, and ngrok are still active."
    log "To fully clean up Grafana, run: $0 teardown-grafana"
}

cmd_teardown_grafana() {
    log "Removing all Grafana configuration for Incy..."

    # Delete alert rules
    log "Removing Grafana alert rules..."
    local rules
    rules=$(grafana_api GET "/api/v1/provisioning/alert-rules" 2>/dev/null || echo "[]")
    echo "$rules" | python3 -c "
import sys, json
rules = json.load(sys.stdin)
for r in rules:
    if r.get('ruleGroup') == 'incy-alerts' and r.get('folderUID') == '$GRAFANA_FOLDER_UID':
        print(r['uid'])
" 2>/dev/null | while read -r uid; do
        grafana_api DELETE "/api/v1/provisioning/alert-rules/$uid" > /dev/null 2>&1 && \
            ok "  Deleted alert rule $uid" || warn "  Could not delete rule $uid"
    done

    # Remove notification policy route
    log "Cleaning notification policy..."
    local current_policy
    current_policy=$(grafana_api GET "/api/v1/provisioning/policies" 2>/dev/null || echo '{}')
    local cleaned_policy
    cleaned_policy=$(echo "$current_policy" | python3 -c "
import sys, json
policy = json.load(sys.stdin)
routes = policy.get('routes', []) or []
routes = [r for r in routes if not (r.get('object_matchers') and any(m == ['incy', '=', 'true'] for m in r.get('object_matchers', [])))]
policy['routes'] = routes
print(json.dumps(policy))
" 2>/dev/null)
    if [[ -n "$cleaned_policy" ]]; then
        grafana_api PUT "/api/v1/provisioning/policies" -d "$cleaned_policy" > /dev/null 2>&1
        ok "Notification policy cleaned"
    fi

    # Remove contact point
    local state
    state=$(load_state)
    local cp_uid
    cp_uid=$(echo "$state" | python3 -c "import sys,json; print(json.load(sys.stdin).get('contact_point_uid',''))" 2>/dev/null || true)
    if [[ -n "$cp_uid" ]]; then
        grafana_api DELETE "/api/v1/provisioning/contact-points/$cp_uid" > /dev/null 2>&1 && \
            ok "Contact point removed" || warn "Could not remove contact point"
    fi

    # Stop ngrok
    log "Stopping ngrok..."
    pkill -f "ngrok http 8000" 2>/dev/null && ok "ngrok stopped" || warn "ngrok was not running"

    # Clean state
    rm -f "$STATE_FILE"

    echo ""
    ok "Grafana teardown complete!"
}

# ---------------------------------------------------------------------------
# STATUS
# ---------------------------------------------------------------------------
cmd_status() {
    echo ""
    echo -e "${BLUE}=== Pod Status ===${NC}"
    kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || warn "Could not get pods"

    echo ""
    echo -e "${BLUE}=== Deployment Status ===${NC}"
    kubectl get deployments -n "$NAMESPACE" 2>/dev/null || warn "Could not get deployments"

    echo ""
    echo -e "${BLUE}=== Grafana Alert Rules ===${NC}"
    local rules
    rules=$(grafana_api GET "/api/v1/provisioning/alert-rules" 2>/dev/null || echo "[]")
    echo "$rules" | python3 -c "
import sys, json
rules = json.load(sys.stdin)
incy_rules = [r for r in rules if r.get('ruleGroup') == 'incy-alerts']
if not incy_rules:
    print('  No incy-alerts rules found')
else:
    for r in incy_rules:
        print(f'  {r[\"title\"]:40s}  for={r.get(\"for\",\"?\")}')
" 2>/dev/null || warn "Could not list alert rules"

    echo ""
    echo -e "${BLUE}=== Grafana Firing Alerts ===${NC}"
    local alerts
    alerts=$(grafana_api GET "/api/prometheus/grafana/api/v1/alerts" 2>/dev/null || echo '{"data":{"alerts":[]}}')
    echo "$alerts" | python3 -c "
import sys, json
data = json.load(sys.stdin)
alerts = data.get('data', {}).get('alerts', [])
incy_alerts = [a for a in alerts if a.get('labels', {}).get('incy') == 'true']
if not incy_alerts:
    print('  No firing incy alerts')
else:
    for a in incy_alerts:
        state = a.get('state', '?')
        name = a.get('labels', {}).get('alertname', '?')
        print(f'  {name:40s}  state={state}')
" 2>/dev/null || warn "Could not get alert status"

    echo ""
    echo -e "${BLUE}=== Incy Incidents (recent) ===${NC}"
    curl -sf "${INCY_API}/v1/incidents?limit=10" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
incidents = data.get('incidents', [])
if not incidents:
    print('  No incidents')
else:
    for i in incidents:
        num = i.get('incident_number', '?')
        title = i.get('title', '?')[:50]
        status = i.get('status', '?')
        print(f'  #{num:<4d} {status:15s} {title}')
" 2>/dev/null || warn "Could not reach Incy API at $INCY_API"

    echo ""
    echo -e "${BLUE}=== Demo State ===${NC}"
    if [[ -f "$STATE_FILE" ]]; then
        python3 -c "
import json
state = json.load(open('$STATE_FILE'))
for k,v in state.items():
    print(f'  {k}: {v}')
"
    else
        echo "  No state file (run ./incy-demo.sh setup first)"
    fi
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
case "${1:-}" in
    setup)              cmd_setup ;;
    trigger)            cmd_trigger "${2:-all}" ;;
    reset)              cmd_reset "${2:-all}" ;;
    teardown)           cmd_teardown ;;
    teardown-grafana)   cmd_teardown_grafana ;;
    status)             cmd_status ;;
    *)
        echo "Usage: $0 {setup|trigger [N]|reset [N]|teardown|teardown-grafana|status}"
        echo ""
        echo "Commands:"
        echo "  setup             Deploy MongoDB, start ngrok, configure Grafana"
        echo "  trigger [N]       Trigger failure scenarios (all or 1-4)"
        echo "  reset [N]         Reset failure scenarios (alerts auto-resolve)"
        echo "  teardown          Remove k8s resources only (preserves Grafana + ngrok)"
        echo "  teardown-grafana  Remove Grafana alert rules, contact point, policy, stop ngrok"
        echo "  status            Show current state"
        echo ""
        echo "Scenarios:"
        echo "  1  CrashLoop (catalog-api & payments-api)"
        echo "  2  Service Degradation (catalog-api scaled to 0)"
        echo "  3  OOMKill (stress pod with 10Mi limit)"
        echo "  4  MongoDB Failure (scaled to 0)"
        exit 1
        ;;
esac
