"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "@/lib/api";
import { Integration } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="copy-url-button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

function IntegrationHealthStatus({ integration }: { integration: Integration }) {
  const lastEvent = integration.last_event_at
    ? formatDistanceToNow(new Date(integration.last_event_at), { addSuffix: true })
    : "Never";

  return (
    <div className="flex items-center gap-2 text-sm" data-testid="integration-health">
      <span className="text-muted-foreground">
        Last event: <span data-testid="last-event-time">{lastEvent}</span>
      </span>
      <Badge variant="secondary" data-testid="event-count-badge">
        {integration.event_count_24h} events (24h)
      </Badge>
    </div>
  );
}

function SetupGuide({ integration }: { integration: Integration }) {
  const [expanded, setExpanded] = useState(false);
  const endpointUrl = `${API_BASE}/v1/events`;
  const curlExample = `curl -X POST ${endpointUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-User-Id: YOUR_USER_ID" \\
  -d '{
  "integration_key": "${integration.integration_key}",
  "dedup_key": "my-alert-key",
  "summary": "High CPU usage on web-server-1",
  "severity": "critical",
  "source": "monitoring",
  "idempotency_key": "unique-event-id"
}'`;

  return (
    <div className="mt-3" data-testid="setup-guide">
      <button
        className="text-sm font-medium text-blue-600 hover:underline"
        onClick={() => setExpanded(!expanded)}
        data-testid="setup-guide-toggle"
      >
        {expanded ? "Hide setup guide" : "Show setup guide"}
      </button>
      {expanded && (
        <div className="mt-3 space-y-4 p-4 bg-muted rounded-lg">
          <div>
            <p className="text-sm font-medium mb-1">Endpoint</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background px-2 py-1 rounded flex-1" data-testid="setup-endpoint">
                POST {endpointUrl}
              </code>
              <CopyButton text={endpointUrl} />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Required headers</p>
            <code className="text-xs block bg-background px-2 py-1 rounded">
              Content-Type: application/json
            </code>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Example curl</p>
            <pre className="text-xs overflow-x-auto bg-background p-2 rounded">
              {curlExample}
            </pre>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Tool-specific notes</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Datadog:</strong> Use Webhooks integration &mdash; set the URL to the endpoint above and include the integration_key in the payload.</li>
              <li><strong>Grafana:</strong> Add a Contact Point of type Webhook. Set the URL and map alert labels to the payload fields.</li>
              <li><strong>Prometheus Alertmanager:</strong> Configure a webhook_configs receiver pointing to this endpoint.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ServiceDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const serviceId = params.id as string;
  const [open, setOpen] = useState(false);
  const [intName, setIntName] = useState("");
  const [intDescription, setIntDescription] = useState("");
  const [intRouteByLabel, setIntRouteByLabel] = useState("");
  const [rotateConfirmId, setRotateConfirmId] = useState<string | null>(null);

  const { data: service, isLoading: serviceLoading } = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => api.getService(serviceId),
  });

  const { data: integrationsData } = useQuery({
    queryKey: ["integrations", serviceId],
    queryFn: () => api.listIntegrations(serviceId),
  });

  const createIntMutation = useMutation({
    mutationFn: () =>
      api.createIntegration(serviceId, {
        name: intName,
        description: intDescription || undefined,
        route_by_label: intRouteByLabel || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations", serviceId] });
      setOpen(false);
      setIntName("");
      setIntDescription("");
      setIntRouteByLabel("");
    },
  });

  const rotateKeyMutation = useMutation({
    mutationFn: (integrationId: string) =>
      api.rotateIntegrationKey(serviceId, integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations", serviceId] });
      setRotateConfirmId(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (integrationId: string) =>
      api.testIntegration(serviceId, integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations", serviceId] });
    },
  });

  if (serviceLoading) {
    return <p className="text-muted-foreground">Loading service...</p>;
  }

  if (!service) {
    return <p className="text-destructive">Service not found</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="service-name">
          {service.name}
        </h1>
        <p className="text-muted-foreground font-mono">{service.slug}</p>
        {service.escalation_policy_name && (
          <div className="mt-2 flex items-center gap-2" data-testid="escalation-policy-link">
            <span className="text-sm text-muted-foreground">Escalation Policy:</span>
            <Link href={`/escalation-policies/${service.escalation_policy_id}`}>
              <Badge variant="outline">{service.escalation_policy_name}</Badge>
            </Link>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Integrations</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="create-integration-button">
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Integration</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createIntMutation.mutate();
                }}
                className="space-y-4"
                data-testid="create-integration-form"
              >
                <div className="space-y-2">
                  <Label htmlFor="int-name">Name</Label>
                  <Input
                    id="int-name"
                    value={intName}
                    onChange={(e) => setIntName(e.target.value)}
                    placeholder="e.g. Datadog Webhook"
                    data-testid="integration-name-input"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="int-desc">Description (optional)</Label>
                  <Textarea
                    id="int-desc"
                    value={intDescription}
                    onChange={(e) => setIntDescription(e.target.value)}
                    placeholder="What this integration monitors"
                    data-testid="integration-description-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="int-route-label">Route by label (optional)</Label>
                  <Input
                    id="int-route-label"
                    value={intRouteByLabel}
                    onChange={(e) => setIntRouteByLabel(e.target.value)}
                    placeholder="e.g. service"
                    data-testid="integration-route-by-label-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    When set, alerts are routed to the service whose slug matches this label value. Falls back to this service if no match.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={createIntMutation.isPending}
                  data-testid="submit-integration"
                >
                  {createIntMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {integrationsData && integrationsData.integrations.length > 0 ? (
            <div className="space-y-3" data-testid="integrations-list">
              {integrationsData.integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="p-3 border rounded-lg space-y-2"
                  data-testid="integration-item"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{integration.name}</p>
                      {integration.description && (
                        <p className="text-sm text-muted-foreground">
                          {integration.description}
                        </p>
                      )}
                      {integration.route_by_label && (
                        <p className="text-sm text-muted-foreground">
                          Routes by label: <code className="bg-muted px-1 rounded">{integration.route_by_label}</code>
                        </p>
                      )}
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Integration Key
                        </p>
                        <code className="text-xs" data-testid="integration-key">
                          {integration.integration_key}
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="rotate-key-button"
                        onClick={() => setRotateConfirmId(integration.id)}
                      >
                        Rotate Key
                      </Button>
                    </div>
                  </div>

                  {/* Health status */}
                  <IntegrationHealthStatus integration={integration} />

                  {/* Webhook URL + Test button */}
                  <div className="flex items-center gap-2" data-testid="webhook-url-section">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1" data-testid="webhook-url">
                      POST {API_BASE}/v1/events
                    </code>
                    <CopyButton text={`${API_BASE}/v1/events`} />
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="test-integration-button"
                      disabled={testMutation.isPending && testMutation.variables === integration.id}
                      onClick={() => testMutation.mutate(integration.id)}
                    >
                      {testMutation.isPending && testMutation.variables === integration.id
                        ? "Sending..."
                        : testMutation.isSuccess && testMutation.variables === integration.id
                          ? "Sent!"
                          : "Send Test Event"}
                    </Button>
                  </div>

                  {/* Setup guide */}
                  <SetupGuide integration={integration} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No integrations yet. Add one to start receiving events.
            </p>
          )}

          {/* Webhook example */}
          {integrationsData && integrationsData.integrations.length > 0 && (
            <div className="mt-6 p-4 bg-muted rounded-lg" data-testid="webhook-example">
              <p className="text-sm font-medium mb-2">Example webhook payload:</p>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(
                  {
                    integration_key:
                      integrationsData.integrations[0].integration_key,
                    dedup_key: "my-alert-key",
                    summary: "High CPU usage on web-server-1",
                    severity: "critical",
                    source: "monitoring",
                    idempotency_key: "unique-event-id",
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rotate key confirmation dialog */}
      <Dialog
        open={rotateConfirmId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRotateConfirmId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate Integration Key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will generate a new integration key. The old key will stop
            working immediately. Any systems using the current key will need to
            be updated.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setRotateConfirmId(null)}
              data-testid="rotate-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rotateKeyMutation.isPending}
              onClick={() => {
                if (rotateConfirmId) {
                  rotateKeyMutation.mutate(rotateConfirmId);
                }
              }}
              data-testid="rotate-confirm"
            >
              {rotateKeyMutation.isPending ? "Rotating..." : "Rotate Key"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
