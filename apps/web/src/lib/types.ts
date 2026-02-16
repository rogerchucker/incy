export interface Incident {
  id: string;
  service_id: string;
  title: string;
  details: string | null;
  status: "triggered" | "acknowledged" | "resolved";
  severity: "critical" | "warning" | "info";
  incident_number: number;
  assigned_to: string | null;
  acknowledged_by: string | null;
  resolved_by: string | null;
  escalation_level: number;
  current_escalation_rule_index: number;
  next_escalation_at: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  updated_at: string;
}

export interface IncidentListResponse {
  incidents: Incident[];
  total: number;
}

export interface IncidentActionResponse {
  id: string;
  status: string;
  message: string;
}

export interface TimelineEntry {
  id: string;
  incident_id: string;
  actor_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export interface TimelineResponse {
  entries: TimelineEntry[];
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  team_id: string;
  primary_oncall_user_id: string | null;
  secondary_oncall_user_id: string | null;
  escalation_policy_id: string | null;
  escalation_policy_name: string | null;
  created_at: string;
}

export interface ServiceListResponse {
  services: Service[];
  total: number;
}

export interface Integration {
  id: string;
  service_id: string;
  name: string;
  type: string;
  integration_key: string;
  description: string | null;
  route_by_label: string | null;
  last_event_at: string | null;
  event_count_24h: number;
  created_at: string;
}

export interface EventResponse {
  id: string;
  integration_id: string;
  dedup_key: string;
  summary: string;
  severity: string;
  source: string | null;
  idempotency_key: string;
  created_at: string;
}

export interface IntegrationListResponse {
  integrations: Integration[];
  total: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

export interface UserListResponse {
  users: User[];
  total: number;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface TeamListResponse {
  teams: Team[];
  total: number;
}

// --- Schedules ---

export interface ScheduleLayerUser {
  id: string;
  user_id: string;
  user_name: string | null;
  position: number;
}

export interface ScheduleLayer {
  id: string;
  name: string;
  position: number;
  rotation_virtual_start: string;
  rotation_turn_length_seconds: number;
  users: ScheduleLayerUser[];
}

export interface ScheduleOverride {
  id: string;
  schedule_id: string;
  user_id: string;
  user_name: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface Schedule {
  id: string;
  name: string;
  description: string | null;
  time_zone: string;
  team_id: string;
  layers: ScheduleLayer[];
  overrides: ScheduleOverride[];
  current_oncall_user_id: string | null;
  current_oncall_user_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleListResponse {
  schedules: Schedule[];
  total: number;
}

export interface OnCallResponse {
  schedule_id: string;
  user_id: string | null;
  user_name: string | null;
  at: string;
}

// --- Escalation Policies ---

export interface EscalationRule {
  id: string;
  position: number;
  escalation_delay_in_minutes: number;
  target_type: "user" | "schedule";
  target_id: string;
  target_name: string | null;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string | null;
  team_id: string;
  num_loops: number;
  rules: EscalationRule[];
  services_count: number;
  created_at: string;
  updated_at: string;
}

export interface EscalationPolicyListResponse {
  escalation_policies: EscalationPolicy[];
  total: number;
}
