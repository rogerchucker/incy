export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Default user ID for MVP (no auth)
const DEFAULT_USER_ID = "20000000-0000-0000-0000-000000000001";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": DEFAULT_USER_ID,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(error.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Incidents
  listIncidents: (params?: { status?: string; service_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.service_id) searchParams.set("service_id", params.service_id);
    const qs = searchParams.toString();
    return apiFetch<import("./types").IncidentListResponse>(`/v1/incidents${qs ? `?${qs}` : ""}`);
  },

  getIncident: (id: string) =>
    apiFetch<import("./types").Incident>(`/v1/incidents/${id}`),

  acknowledgeIncident: (id: string) =>
    apiFetch<import("./types").IncidentActionResponse>(`/v1/incidents/${id}/acknowledge`, {
      method: "POST",
    }),

  resolveIncident: (id: string) =>
    apiFetch<import("./types").IncidentActionResponse>(`/v1/incidents/${id}/resolve`, {
      method: "POST",
    }),

  updateIncident: (id: string, data: { title?: string; details?: string; severity?: string }) =>
    apiFetch<import("./types").Incident>(`/v1/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  addIncidentNote: (id: string, content: string) =>
    apiFetch<import("./types").TimelineEntry>(`/v1/incidents/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  getTimeline: (id: string) =>
    apiFetch<import("./types").TimelineResponse>(`/v1/incidents/${id}/timeline`),

  // Services
  listServices: () =>
    apiFetch<import("./types").ServiceListResponse>("/v1/services"),

  getService: (id: string) =>
    apiFetch<import("./types").Service>(`/v1/services/${id}`),

  createService: (data: {
    name: string;
    slug: string;
    team_id: string;
    primary_oncall_user_id?: string;
    secondary_oncall_user_id?: string;
    escalation_policy_id?: string;
  }) =>
    apiFetch<import("./types").Service>("/v1/services", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateService: (id: string, data: {
    name?: string;
    primary_oncall_user_id?: string;
    secondary_oncall_user_id?: string;
    escalation_policy_id?: string;
  }) =>
    apiFetch<import("./types").Service>(`/v1/services/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Integrations
  listIntegrations: (serviceId: string) =>
    apiFetch<import("./types").IntegrationListResponse>(`/v1/services/${serviceId}/integrations`),

  createIntegration: (serviceId: string, data: { name: string; type?: string; description?: string; route_by_label?: string }) =>
    apiFetch<import("./types").Integration>(`/v1/services/${serviceId}/integrations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Users
  listUsers: () =>
    apiFetch<import("./types").UserListResponse>("/v1/users"),

  // Teams
  listTeams: () =>
    apiFetch<import("./types").TeamListResponse>("/v1/teams"),

  // Integration key rotation
  rotateIntegrationKey: (serviceId: string, integrationId: string) =>
    apiFetch<import("./types").Integration>(
      `/v1/services/${serviceId}/integrations/${integrationId}/rotate-key`,
      { method: "POST" }
    ),

  // Test integration
  testIntegration: (serviceId: string, integrationId: string) =>
    apiFetch<import("./types").EventResponse>(
      `/v1/services/${serviceId}/integrations/${integrationId}/test`,
      { method: "POST" }
    ),

  // Schedules
  listSchedules: () =>
    apiFetch<import("./types").ScheduleListResponse>("/v1/schedules"),

  getSchedule: (id: string) =>
    apiFetch<import("./types").Schedule>(`/v1/schedules/${id}`),

  createSchedule: (data: {
    name: string;
    description?: string;
    time_zone?: string;
    team_id: string;
    layers?: Array<{
      name: string;
      rotation_virtual_start: string;
      rotation_turn_length_seconds: number;
      users: Array<{ user_id: string }>;
    }>;
  }) =>
    apiFetch<import("./types").Schedule>("/v1/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateSchedule: (id: string, data: {
    name?: string;
    description?: string;
    time_zone?: string;
    layers?: Array<{
      name: string;
      rotation_virtual_start: string;
      rotation_turn_length_seconds: number;
      users: Array<{ user_id: string }>;
    }>;
  }) =>
    apiFetch<import("./types").Schedule>(`/v1/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteSchedule: (id: string) =>
    apiFetch<void>(`/v1/schedules/${id}`, { method: "DELETE" }),

  getOnCall: (scheduleId: string, at?: string) => {
    const params = at ? `?at=${encodeURIComponent(at)}` : "";
    return apiFetch<import("./types").OnCallResponse>(`/v1/schedules/${scheduleId}/oncall${params}`);
  },

  createOverride: (scheduleId: string, data: { user_id: string; start_time: string; end_time: string }) =>
    apiFetch<import("./types").ScheduleOverride>(`/v1/schedules/${scheduleId}/overrides`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteOverride: (scheduleId: string, overrideId: string) =>
    apiFetch<void>(`/v1/schedules/${scheduleId}/overrides/${overrideId}`, { method: "DELETE" }),

  // Escalation Policies
  listEscalationPolicies: () =>
    apiFetch<import("./types").EscalationPolicyListResponse>("/v1/escalation-policies"),

  getEscalationPolicy: (id: string) =>
    apiFetch<import("./types").EscalationPolicy>(`/v1/escalation-policies/${id}`),

  createEscalationPolicy: (data: {
    name: string;
    description?: string;
    team_id: string;
    num_loops?: number;
    rules: Array<{
      escalation_delay_in_minutes: number;
      target_type: string;
      target_id: string;
    }>;
  }) =>
    apiFetch<import("./types").EscalationPolicy>("/v1/escalation-policies", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateEscalationPolicy: (id: string, data: {
    name?: string;
    description?: string;
    num_loops?: number;
    rules?: Array<{
      escalation_delay_in_minutes: number;
      target_type: string;
      target_id: string;
    }>;
  }) =>
    apiFetch<import("./types").EscalationPolicy>(`/v1/escalation-policies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteEscalationPolicy: (id: string) =>
    apiFetch<void>(`/v1/escalation-policies/${id}`, { method: "DELETE" }),
};
