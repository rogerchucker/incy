"""Seed the database with demo data."""
import uuid
from datetime import datetime, timezone, timedelta

from app.database import SessionLocal
from app.models import (
    User, Team, Membership, Service, Integration,
    Event, Alert, Incident, AuditLog, NotificationAttempt,
    WebhookSubscription, Schedule, ScheduleLayer, ScheduleLayerUser,
    EscalationPolicy, EscalationRule,
)

# Fixed UUIDs for deterministic seeding
TEAM_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
USER1_ID = uuid.UUID("20000000-0000-0000-0000-000000000001")
USER2_ID = uuid.UUID("20000000-0000-0000-0000-000000000002")
SERVICE_ID = uuid.UUID("30000000-0000-0000-0000-000000000001")
INTEGRATION_ID = uuid.UUID("40000000-0000-0000-0000-000000000001")
INCIDENT1_ID = uuid.UUID("50000000-0000-0000-0000-000000000001")
INCIDENT2_ID = uuid.UUID("50000000-0000-0000-0000-000000000002")
INCIDENT3_ID = uuid.UUID("50000000-0000-0000-0000-000000000003")
WEBHOOK_ID = uuid.UUID("60000000-0000-0000-0000-000000000001")
SCHEDULE_ID = uuid.UUID("70000000-0000-0000-0000-000000000001")
LAYER_ID = uuid.UUID("71000000-0000-0000-0000-000000000001")
ESCALATION_POLICY_ID = uuid.UUID("80000000-0000-0000-0000-000000000001")


def seed():
    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(User).filter_by(id=USER1_ID).first():
            print("Database already seeded.")
            return

        now = datetime.now(timezone.utc)

        # Team
        team = Team(id=TEAM_ID, name="Platform Team", slug="platform-team")
        db.add(team)

        # Users
        user1 = User(id=USER1_ID, name="Alice Engineer", email="alice@example.com", phone="+1234567890")
        user2 = User(id=USER2_ID, name="Bob Oncall", email="bob@example.com", phone="+0987654321")
        db.add_all([user1, user2])
        db.flush()

        # Memberships
        db.add(Membership(user_id=USER1_ID, team_id=TEAM_ID, role="admin"))
        db.add(Membership(user_id=USER2_ID, team_id=TEAM_ID, role="member"))

        # Service
        service = Service(
            id=SERVICE_ID,
            name="Payment API",
            slug="payment-api",
            team_id=TEAM_ID,
            primary_oncall_user_id=USER1_ID,
            secondary_oncall_user_id=USER2_ID,
        )
        db.add(service)
        db.flush()

        # Integration
        integration = Integration(
            id=INTEGRATION_ID,
            service_id=SERVICE_ID,
            name="Datadog Webhook",
            type="webhook",
            integration_key="int_" + "a" * 32,
            description="Datadog monitoring alerts",
        )
        db.add(integration)
        db.flush()

        # Events + Alerts + Incidents
        # Incident 1: triggered
        event1_id = uuid.uuid4()
        db.add(Event(
            id=event1_id,
            integration_id=INTEGRATION_ID,
            dedup_key="high-cpu-payment-api",
            summary="CPU usage above 90% on payment-api",
            severity="critical",
            source="datadog",
            idempotency_key="evt-001",
        ))
        incident1 = Incident(
            id=INCIDENT1_ID,
            service_id=SERVICE_ID,
            title="CPU usage above 90% on payment-api",
            status="triggered",
            severity="critical",
            incident_number=1,
            assigned_to=USER1_ID,
            created_at=now - timedelta(hours=1),
        )
        db.add(incident1)
        db.flush()
        db.add(Alert(
            service_id=SERVICE_ID,
            dedup_key="high-cpu-payment-api",
            summary="CPU usage above 90% on payment-api",
            severity="critical",
            status="open",
            incident_id=INCIDENT1_ID,
            first_event_id=event1_id,
        ))
        db.add(AuditLog(
            incident_id=INCIDENT1_ID,
            action="triggered",
            details='{"source": "datadog", "severity": "critical"}',
            created_at=now - timedelta(hours=1),
        ))

        # Incident 2: acknowledged
        event2_id = uuid.uuid4()
        db.add(Event(
            id=event2_id,
            integration_id=INTEGRATION_ID,
            dedup_key="high-latency-payment-api",
            summary="P99 latency above 2s on payment-api",
            severity="warning",
            source="datadog",
            idempotency_key="evt-002",
        ))
        incident2 = Incident(
            id=INCIDENT2_ID,
            service_id=SERVICE_ID,
            title="P99 latency above 2s on payment-api",
            status="acknowledged",
            severity="warning",
            incident_number=2,
            assigned_to=USER1_ID,
            acknowledged_by=USER1_ID,
            acknowledged_at=now - timedelta(minutes=30),
            created_at=now - timedelta(hours=2),
        )
        db.add(incident2)
        db.flush()
        db.add(Alert(
            service_id=SERVICE_ID,
            dedup_key="high-latency-payment-api",
            summary="P99 latency above 2s on payment-api",
            severity="warning",
            status="open",
            incident_id=INCIDENT2_ID,
            first_event_id=event2_id,
        ))
        db.add(AuditLog(
            incident_id=INCIDENT2_ID,
            action="triggered",
            details='{"source": "datadog", "severity": "warning"}',
            created_at=now - timedelta(hours=2),
        ))
        db.add(AuditLog(
            incident_id=INCIDENT2_ID,
            actor_id=USER1_ID,
            action="acknowledged",
            details='{"acknowledged_by": "Alice Engineer"}',
            created_at=now - timedelta(minutes=30),
        ))

        # Incident 3: resolved
        event3_id = uuid.uuid4()
        db.add(Event(
            id=event3_id,
            integration_id=INTEGRATION_ID,
            dedup_key="disk-full-payment-api",
            summary="Disk usage above 95% on payment-api",
            severity="critical",
            source="datadog",
            idempotency_key="evt-003",
        ))
        incident3 = Incident(
            id=INCIDENT3_ID,
            service_id=SERVICE_ID,
            title="Disk usage above 95% on payment-api",
            status="resolved",
            severity="critical",
            incident_number=3,
            assigned_to=USER2_ID,
            acknowledged_by=USER2_ID,
            acknowledged_at=now - timedelta(hours=5),
            resolved_by=USER2_ID,
            resolved_at=now - timedelta(hours=4),
            created_at=now - timedelta(hours=6),
        )
        db.add(incident3)
        db.flush()
        db.add(Alert(
            service_id=SERVICE_ID,
            dedup_key="disk-full-payment-api",
            summary="Disk usage above 95% on payment-api",
            severity="critical",
            status="resolved",
            incident_id=INCIDENT3_ID,
            first_event_id=event3_id,
        ))
        db.add(AuditLog(
            incident_id=INCIDENT3_ID,
            action="triggered",
            details='{"source": "datadog", "severity": "critical"}',
            created_at=now - timedelta(hours=6),
        ))
        db.add(AuditLog(
            incident_id=INCIDENT3_ID,
            actor_id=USER2_ID,
            action="acknowledged",
            details='{"acknowledged_by": "Bob Oncall"}',
            created_at=now - timedelta(hours=5),
        ))
        db.add(AuditLog(
            incident_id=INCIDENT3_ID,
            actor_id=USER2_ID,
            action="resolved",
            details='{"resolved_by": "Bob Oncall"}',
            created_at=now - timedelta(hours=4),
        ))

        # Notification attempts
        db.add(NotificationAttempt(
            incident_id=INCIDENT1_ID,
            user_id=USER1_ID,
            channel="email",
            status="sent",
            attempt_number=1,
        ))

        # Schedule: Primary On-Call Rotation
        schedule = Schedule(
            id=SCHEDULE_ID,
            name="Primary On-Call Rotation",
            description="Weekly rotation for platform team",
            time_zone="UTC",
            team_id=TEAM_ID,
        )
        db.add(schedule)
        db.flush()

        # Layer: weekly rotation, Alice -> Bob, starting Feb 1 2026
        layer = ScheduleLayer(
            id=LAYER_ID,
            schedule_id=SCHEDULE_ID,
            name="Layer 1",
            position=0,
            rotation_virtual_start=datetime(2026, 2, 1, tzinfo=timezone.utc),
            rotation_turn_length_seconds=7 * 24 * 3600,  # 1 week
        )
        db.add(layer)
        db.flush()

        db.add(ScheduleLayerUser(layer_id=LAYER_ID, user_id=USER1_ID, position=0))
        db.add(ScheduleLayerUser(layer_id=LAYER_ID, user_id=USER2_ID, position=1))

        # Escalation Policy: Platform Default
        policy = EscalationPolicy(
            id=ESCALATION_POLICY_ID,
            name="Platform Default",
            description="Default escalation for platform services",
            team_id=TEAM_ID,
            num_loops=2,
        )
        db.add(policy)
        db.flush()

        # Rule 0: page on-call from schedule (5 min delay)
        db.add(EscalationRule(
            escalation_policy_id=ESCALATION_POLICY_ID,
            position=0,
            escalation_delay_in_minutes=5,
            target_type="schedule",
            target_id=SCHEDULE_ID,
        ))
        # Rule 1: page Bob directly (10 min delay)
        db.add(EscalationRule(
            escalation_policy_id=ESCALATION_POLICY_ID,
            position=1,
            escalation_delay_in_minutes=10,
            target_type="user",
            target_id=USER2_ID,
        ))

        # Link service to escalation policy
        service.escalation_policy_id = ESCALATION_POLICY_ID

        # Webhook subscription
        db.add(WebhookSubscription(
            id=WEBHOOK_ID,
            service_id=SERVICE_ID,
            url="http://localhost:8025/webhook",
            secret="devsecret" + "0" * 55,
            events="incident.triggered,incident.acknowledged,incident.resolved",
            active=True,
            description="Sample webhook for local dev",
        ))

        db.commit()
        print("Database seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
