import { Page } from "@playwright/test";

// --- Mock data ---

interface MockIncident {
  id: string;
  service_id: string;
  title: string;
  status: string;
  severity: string;
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

const INCIDENT_TRIGGERED: MockIncident = {
  id: "50000000-0000-0000-0000-000000000001",
  service_id: "30000000-0000-0000-0000-000000000001",
  title: "CPU usage above 90% on payment-api",
  status: "triggered",
  severity: "critical",
  incident_number: 1,
  assigned_to: "20000000-0000-0000-0000-000000000001",
  acknowledged_by: null,
  resolved_by: null,
  escalation_level: 1,
  current_escalation_rule_index: 0,
  next_escalation_at: null,
  created_at: "2026-02-14T10:00:00+00:00",
  acknowledged_at: null,
  resolved_at: null,
  updated_at: "2026-02-14T10:00:00+00:00",
};

const INCIDENT_ACKNOWLEDGED = {
  id: "50000000-0000-0000-0000-000000000002",
  service_id: "30000000-0000-0000-0000-000000000001",
  title: "P99 latency above 2s on payment-api",
  status: "acknowledged",
  severity: "warning",
  incident_number: 2,
  assigned_to: "20000000-0000-0000-0000-000000000001",
  acknowledged_by: "20000000-0000-0000-0000-000000000001",
  resolved_by: null,
  escalation_level: 1,
  current_escalation_rule_index: 0,
  next_escalation_at: null,
  created_at: "2026-02-14T08:00:00+00:00",
  acknowledged_at: "2026-02-14T09:30:00+00:00",
  resolved_at: null,
  updated_at: "2026-02-14T09:30:00+00:00",
};

const INCIDENT_RESOLVED = {
  id: "50000000-0000-0000-0000-000000000003",
  service_id: "30000000-0000-0000-0000-000000000001",
  title: "Disk usage above 95% on payment-api",
  status: "resolved",
  severity: "critical",
  incident_number: 3,
  assigned_to: "20000000-0000-0000-0000-000000000002",
  acknowledged_by: "20000000-0000-0000-0000-000000000002",
  resolved_by: "20000000-0000-0000-0000-000000000002",
  escalation_level: 1,
  current_escalation_rule_index: 0,
  next_escalation_at: null,
  created_at: "2026-02-14T04:00:00+00:00",
  acknowledged_at: "2026-02-14T05:00:00+00:00",
  resolved_at: "2026-02-14T06:00:00+00:00",
  updated_at: "2026-02-14T06:00:00+00:00",
};

const ALL_INCIDENTS = [INCIDENT_TRIGGERED, INCIDENT_ACKNOWLEDGED, INCIDENT_RESOLVED];

const TIMELINE_ENTRIES = [
  {
    id: "60000000-0000-0000-0000-000000000001",
    incident_id: "50000000-0000-0000-0000-000000000001",
    actor_id: null,
    action: "triggered",
    details: '{"source": "datadog", "severity": "critical"}',
    created_at: "2026-02-14T10:00:00+00:00",
  },
];

interface MockService {
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

interface MockIntegration {
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

interface MockTeam {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface MockUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

const TEAM_1: MockTeam = {
  id: "10000000-0000-0000-0000-000000000001",
  name: "Platform Team",
  slug: "platform-team",
  created_at: "2026-02-14T00:00:00+00:00",
};

const USER_1: MockUser = {
  id: "20000000-0000-0000-0000-000000000001",
  name: "Alice Engineer",
  email: "alice@example.com",
  phone: "+1234567890",
  created_at: "2026-02-14T00:00:00+00:00",
};

const USER_2: MockUser = {
  id: "20000000-0000-0000-0000-000000000002",
  name: "Bob Oncall",
  email: "bob@example.com",
  phone: "+0987654321",
  created_at: "2026-02-14T00:00:00+00:00",
};

const SERVICE_1: MockService = {
  id: "30000000-0000-0000-0000-000000000001",
  name: "Payment API",
  slug: "payment-api",
  team_id: "10000000-0000-0000-0000-000000000001",
  primary_oncall_user_id: "20000000-0000-0000-0000-000000000001",
  secondary_oncall_user_id: "20000000-0000-0000-0000-000000000002",
  escalation_policy_id: "80000000-0000-0000-0000-000000000001",
  escalation_policy_name: "Platform Default",
  created_at: "2026-02-14T00:00:00+00:00",
};

const INTEGRATION_1: MockIntegration = {
  id: "40000000-0000-0000-0000-000000000001",
  service_id: "30000000-0000-0000-0000-000000000001",
  name: "Datadog Webhook",
  type: "webhook",
  integration_key: "int_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  description: "Datadog monitoring alerts",
  route_by_label: null,
  last_event_at: "2026-02-14T07:00:00+00:00",
  event_count_24h: 42,
  created_at: "2026-02-14T00:00:00+00:00",
};

// --- Mock setup functions ---

export async function mockTeamsAPI(page: Page) {
  await page.route("**/v1/teams", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ teams: [TEAM_1], total: 1 }),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockUsersAPI(page: Page) {
  await page.route("**/v1/users", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ users: [USER_1, USER_2], total: 2 }),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockIncidentsAPI(page: Page) {
  // Also mock services and users so the list page can resolve names
  await mockServicesListOnly(page);
  await mockUsersAPI(page);

  // List incidents (with optional status filter)
  await page.route("**/v1/incidents?**", async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const filtered = status
      ? ALL_INCIDENTS.filter((i) => i.status === status)
      : ALL_INCIDENTS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ incidents: filtered, total: filtered.length }),
    });
  });

  await page.route("**/v1/incidents", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ incidents: ALL_INCIDENTS, total: ALL_INCIDENTS.length }),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockIncidentDetailAPI(page: Page, incidentId?: string) {
  const id = incidentId || INCIDENT_TRIGGERED.id;
  let currentIncident: MockIncident = { ...INCIDENT_TRIGGERED };

  // Get incident detail
  await page.route(`**/v1/incidents/${id}`, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentIncident),
      });
    } else {
      await route.continue();
    }
  });

  // Timeline
  await page.route(`**/v1/incidents/${id}/timeline`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: TIMELINE_ENTRIES }),
    });
  });

  // Acknowledge
  await page.route(`**/v1/incidents/${id}/acknowledge`, async (route) => {
    currentIncident = {
      ...currentIncident,
      status: "acknowledged",
      acknowledged_by: "20000000-0000-0000-0000-000000000001",
      acknowledged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: currentIncident.id,
        status: "acknowledged",
        message: "Incident acknowledged",
      }),
    });
  });

  // Resolve
  await page.route(`**/v1/incidents/${id}/resolve`, async (route) => {
    currentIncident = {
      ...currentIncident,
      status: "resolved",
      resolved_by: "20000000-0000-0000-0000-000000000001",
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: currentIncident.id,
        status: "resolved",
        message: "Incident resolved",
      }),
    });
  });
}

async function mockServicesListOnly(page: Page) {
  await page.route("**/v1/services", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ services: [SERVICE_1], total: 1 }),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockServicesAPI(page: Page) {
  // Also mock teams and users so the service creation form works
  await mockTeamsAPI(page);
  await mockUsersAPI(page);

  let services: MockService[] = [SERVICE_1];

  // List services
  await page.route("**/v1/services", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ services, total: services.length }),
      });
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      const newService = {
        id: "30000000-0000-0000-0000-000000000099",
        name: body.name,
        slug: body.slug,
        team_id: body.team_id,
        primary_oncall_user_id: body.primary_oncall_user_id || null,
        secondary_oncall_user_id: body.secondary_oncall_user_id || null,
        escalation_policy_id: body.escalation_policy_id || null,
        escalation_policy_name: null,
        created_at: new Date().toISOString(),
      };
      services = [...services, newService];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newService),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockServiceDetailAPI(page: Page, serviceId?: string) {
  const id = serviceId || SERVICE_1.id;
  let integrations: MockIntegration[] = [INTEGRATION_1];

  // Get service detail
  await page.route(`**/v1/services/${id}`, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SERVICE_1),
      });
    } else {
      await route.continue();
    }
  });

  // Test integration - must be registered BEFORE the general integrations route
  await page.route(`**/v1/services/${id}/integrations/*/test`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "70000000-0000-0000-0000-000000000001",
        integration_id: "40000000-0000-0000-0000-000000000001",
        dedup_key: "_test_40000000-0000-0000-0000-000000000001_1707900000000",
        summary: "[Test] Integration test for Datadog Webhook",
        severity: "info",
        source: "incy_test",
        idempotency_key: "test_40000000-0000-0000-0000-000000000001_aaaaaaaa",
        created_at: new Date().toISOString(),
      }),
    });
  });

  // Rotate key - must be registered BEFORE the general integrations route
  await page.route(`**/v1/services/${id}/integrations/*/rotate-key`, async (route) => {
    const url = route.request().url();
    // Extract integration ID from URL
    const match = url.match(/integrations\/([^/]+)\/rotate-key/);
    const integrationId = match?.[1];
    const integration = integrations.find((i) => i.id === integrationId);
    if (integration) {
      integration.integration_key = "int_" + "r".repeat(32);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(integration),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "not_found", message: "Integration not found" } }),
      });
    }
  });

  // List integrations / Create integration
  await page.route(`**/v1/services/${id}/integrations`, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ integrations, total: integrations.length }),
      });
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      const newIntegration = {
        id: "40000000-0000-0000-0000-000000000099",
        service_id: id,
        name: body.name,
        type: body.type || "webhook",
        integration_key: "int_" + "b".repeat(32),
        description: body.description || null,
        route_by_label: body.route_by_label || null,
        last_event_at: null,
        event_count_24h: 0,
        created_at: new Date().toISOString(),
      };
      integrations = [...integrations, newIntegration];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newIntegration),
      });
    } else {
      await route.continue();
    }
  });
}

// --- Schedule mock data ---

const SCHEDULE_1 = {
  id: "70000000-0000-0000-0000-000000000001",
  name: "Primary On-Call Rotation",
  description: "Weekly rotation for platform team",
  time_zone: "UTC",
  team_id: "10000000-0000-0000-0000-000000000001",
  layers: [
    {
      id: "71000000-0000-0000-0000-000000000001",
      name: "Layer 1",
      position: 0,
      rotation_virtual_start: "2026-02-01T00:00:00+00:00",
      rotation_turn_length_seconds: 604800,
      users: [
        { id: "72000000-0000-0000-0000-000000000001", user_id: USER_1.id, user_name: USER_1.name, position: 0 },
        { id: "72000000-0000-0000-0000-000000000002", user_id: USER_2.id, user_name: USER_2.name, position: 1 },
      ],
    },
  ],
  overrides: [] as Array<{
    id: string;
    schedule_id: string;
    user_id: string;
    user_name: string;
    start_time: string;
    end_time: string;
    created_at: string;
  }>,
  current_oncall_user_id: USER_1.id as string | null,
  current_oncall_user_name: USER_1.name as string | null,
  created_at: "2026-02-14T00:00:00+00:00",
  updated_at: "2026-02-14T00:00:00+00:00",
};

const ESCALATION_POLICY_1 = {
  id: "80000000-0000-0000-0000-000000000001",
  name: "Platform Default",
  description: "Default escalation for platform services",
  team_id: "10000000-0000-0000-0000-000000000001",
  num_loops: 2,
  rules: [
    {
      id: "81000000-0000-0000-0000-000000000001",
      position: 0,
      escalation_delay_in_minutes: 5,
      target_type: "schedule",
      target_id: "70000000-0000-0000-0000-000000000001",
      target_name: "Primary On-Call Rotation",
    },
    {
      id: "81000000-0000-0000-0000-000000000002",
      position: 1,
      escalation_delay_in_minutes: 10,
      target_type: "user",
      target_id: USER_2.id,
      target_name: USER_2.name,
    },
  ],
  services_count: 1,
  created_at: "2026-02-14T00:00:00+00:00",
  updated_at: "2026-02-14T00:00:00+00:00",
};

export async function mockSchedulesAPI(page: Page) {
  await mockTeamsAPI(page);
  await mockUsersAPI(page);

  let schedules = [SCHEDULE_1];

  await page.route("**/v1/schedules", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schedules, total: schedules.length }),
      });
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      const newSchedule = {
        id: "70000000-0000-0000-0000-000000000099",
        name: body.name,
        description: body.description || null,
        time_zone: body.time_zone || "UTC",
        team_id: body.team_id,
        layers: [],
        overrides: [],
        current_oncall_user_id: null,
        current_oncall_user_name: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      schedules = [...schedules, newSchedule];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newSchedule),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockScheduleDetailAPI(page: Page, scheduleId?: string) {
  await mockUsersAPI(page);
  const id = scheduleId || SCHEDULE_1.id;
  let schedule = { ...SCHEDULE_1, overrides: [...SCHEDULE_1.overrides] };

  await page.route(`**/v1/schedules/${id}/overrides/*`, async (route, request) => {
    if (request.method() === "DELETE") {
      const url = route.request().url();
      const match = url.match(/overrides\/([^/]+)$/);
      const overrideId = match?.[1];
      schedule.overrides = schedule.overrides.filter((o) => o.id !== overrideId);
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });

  await page.route(`**/v1/schedules/${id}/overrides`, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ overrides: schedule.overrides, total: schedule.overrides.length }),
      });
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      const newOverride = {
        id: "73000000-0000-0000-0000-000000000099",
        schedule_id: id,
        user_id: body.user_id,
        user_name: body.user_id === USER_1.id ? USER_1.name : USER_2.name,
        start_time: body.start_time,
        end_time: body.end_time,
        created_at: new Date().toISOString(),
      };
      schedule.overrides = [...schedule.overrides, newOverride];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newOverride),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`**/v1/schedules/${id}/oncall**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schedule_id: id,
        user_id: USER_1.id,
        user_name: USER_1.name,
        at: new Date().toISOString(),
      }),
    });
  });

  await page.route(`**/v1/schedules/${id}`, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(schedule),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockEscalationPoliciesAPI(page: Page) {
  await mockTeamsAPI(page);
  await mockUsersAPI(page);

  // Also mock schedules for the create form
  await page.route("**/v1/schedules", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schedules: [SCHEDULE_1], total: 1 }),
      });
    } else {
      await route.continue();
    }
  });

  let policies = [ESCALATION_POLICY_1];

  await page.route("**/v1/escalation-policies", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ escalation_policies: policies, total: policies.length }),
      });
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      const newPolicy = {
        id: "80000000-0000-0000-0000-000000000099",
        name: body.name,
        description: body.description || null,
        team_id: body.team_id,
        num_loops: body.num_loops || 1,
        rules: (body.rules || []).map((r: { escalation_delay_in_minutes: number; target_type: string; target_id: string }, i: number) => ({
          id: `81000000-0000-0000-0000-0000000000${(i + 10).toString().padStart(2, "0")}`,
          position: i,
          escalation_delay_in_minutes: r.escalation_delay_in_minutes,
          target_type: r.target_type,
          target_id: r.target_id,
          target_name: r.target_type === "user" ? "Alice Engineer" : "Primary On-Call Rotation",
        })),
        services_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      policies = [...policies, newPolicy];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newPolicy),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockEscalationPolicyDetailAPI(page: Page, policyId?: string) {
  const id = policyId || ESCALATION_POLICY_1.id;

  // Mock services for the linked services list
  await page.route("**/v1/services", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ services: [SERVICE_1], total: 1 }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`**/v1/escalation-policies/${id}`, async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ESCALATION_POLICY_1),
      });
    } else {
      await route.continue();
    }
  });
}

export const testData = {
  INCIDENT_TRIGGERED,
  INCIDENT_ACKNOWLEDGED,
  INCIDENT_RESOLVED,
  ALL_INCIDENTS,
  TIMELINE_ENTRIES,
  TEAM_1,
  USER_1,
  USER_2,
  SERVICE_1,
  INTEGRATION_1,
  SCHEDULE_1,
  ESCALATION_POLICY_1,
};
