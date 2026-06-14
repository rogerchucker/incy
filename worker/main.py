"""Notification worker: polls for due notifications and sends them."""
import logging
import random
import signal
import sys
import time
from datetime import datetime, timezone, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from worker.config import worker_settings
from worker.smtp_sender import send_email_notification
from worker.webhook_sender import send_webhook

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

engine = create_engine(worker_settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

running = True


def signal_handler(sig, frame):
    global running
    logger.info("Shutting down worker...")
    running = False


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def claim_and_process_notifications():
    """Atomically claim and process due notifications."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Atomically claim a batch of due notifications
        result = db.execute(
            text("""
                UPDATE notification_attempts
                SET status = 'sending', updated_at = :now
                WHERE id IN (
                    SELECT id FROM notification_attempts
                    WHERE status IN ('queued', 'retrying')
                    AND next_attempt_at <= :now
                    ORDER BY next_attempt_at ASC
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, incident_id, user_id, channel, attempt_number, max_attempts, webhook_subscription_id, payload
            """),
            {"now": now},
        )
        notifications = result.fetchall()
        db.commit()

        for notif in notifications:
            process_single_notification(db, notif, now)

        return len(notifications)

    except Exception as e:
        logger.error(f"Error processing notifications: {e}")
        db.rollback()
        return 0
    finally:
        db.close()


def process_single_notification(db, notif, now):
    """Process a single notification attempt."""
    notif_id, incident_id, user_id, channel, attempt_number, max_attempts, webhook_subscription_id, payload = notif

    try:
        if channel == "webhook":
            _process_webhook(db, notif_id, incident_id, webhook_subscription_id, payload, now)
        else:
            _process_email(db, notif_id, incident_id, user_id, channel, now)
    except Exception as e:
        logger.error(f"Notification {notif_id} failed: {e}")
        handle_failure(db, notif_id, attempt_number, max_attempts, str(e))


def _process_email(db, notif_id, incident_id, user_id, channel, now):
    """Send an email notification."""
    user = db.execute(
        text("SELECT email, name FROM users WHERE id = :user_id"),
        {"user_id": user_id},
    ).fetchone()

    if not user:
        mark_dead(db, notif_id, "User not found")
        return

    incident = db.execute(
        text("SELECT title, severity, status FROM incidents WHERE id = :incident_id"),
        {"incident_id": incident_id},
    ).fetchone()

    if not incident or incident[2] in ("acknowledged", "resolved"):
        mark_sent(db, notif_id)  # No need to notify for acked/resolved
        return

    email, name = user
    title, severity, _ = incident

    send_email_notification(
        to_email=email,
        to_name=name,
        incident_title=title,
        severity=severity,
        incident_id=str(incident_id),
    )

    mark_sent(db, notif_id)
    logger.info(f"Notification {notif_id} sent to {email}")

    db.execute(
        text("""
            INSERT INTO audit_logs (id, incident_id, action, details, created_at)
            VALUES (gen_random_uuid(), :incident_id, 'notification_sent',
                    :details, :now)
        """),
        {
            "incident_id": incident_id,
            "details": f'{{"channel": "{channel}", "user": "{email}"}}',
            "now": now,
        },
    )
    db.commit()


def _process_webhook(db, notif_id, incident_id, webhook_subscription_id, payload, now):
    """Send an outbound webhook delivery."""
    if not webhook_subscription_id or not payload:
        mark_dead(db, notif_id, "Missing webhook subscription or payload")
        return

    sub = db.execute(
        text("SELECT url, secret, active FROM webhook_subscriptions WHERE id = :id"),
        {"id": webhook_subscription_id},
    ).fetchone()

    if not sub:
        mark_dead(db, notif_id, "Webhook subscription not found")
        return

    url, secret, active = sub
    if not active:
        mark_dead(db, notif_id, "Webhook subscription inactive")
        return

    send_webhook(url=url, secret=secret, payload=payload)

    mark_sent(db, notif_id)
    logger.info(f"Webhook {notif_id} delivered to {url}")

    db.execute(
        text("""
            INSERT INTO audit_logs (id, incident_id, action, details, created_at)
            VALUES (gen_random_uuid(), :incident_id, 'webhook_sent',
                    :details, :now)
        """),
        {
            "incident_id": incident_id,
            "details": f'{{"channel": "webhook", "url": "{url}"}}',
            "now": now,
        },
    )
    db.commit()


def mark_sent(db, notif_id):
    db.execute(
        text("UPDATE notification_attempts SET status = 'sent', updated_at = NOW() WHERE id = :id"),
        {"id": notif_id},
    )
    db.commit()


def mark_dead(db, notif_id, error):
    db.execute(
        text("UPDATE notification_attempts SET status = 'dead', last_error = :error, updated_at = NOW() WHERE id = :id"),
        {"id": notif_id, "error": error},
    )
    db.commit()


def handle_failure(db, notif_id, attempt_number, max_attempts, error):
    """Retry with exponential backoff + jitter, or mark dead."""
    if attempt_number >= max_attempts:
        mark_dead(db, notif_id, error)
        logger.warning(f"Notification {notif_id} dead after {max_attempts} attempts")
        return

    # Exponential backoff with jitter
    base_delay = min(2 ** attempt_number, 300)  # cap at 5 minutes
    jitter = random.uniform(0, base_delay * 0.5)
    next_attempt = datetime.now(timezone.utc) + timedelta(seconds=base_delay + jitter)

    db.execute(
        text("""
            UPDATE notification_attempts
            SET status = 'retrying', attempt_number = :next_attempt_num,
                next_attempt_at = :next_at, last_error = :error, updated_at = NOW()
            WHERE id = :id
        """),
        {
            "id": notif_id,
            "next_attempt_num": attempt_number + 1,
            "next_at": next_attempt,
            "error": error,
        },
    )
    db.commit()
    logger.info(f"Notification {notif_id} will retry at {next_attempt}")


def check_escalations():
    """Check for incidents needing escalation (snapshot-based + legacy L1->L2)."""
    db = SessionLocal()
    try:
        _check_snapshot_escalations(db)
        _check_legacy_escalations(db)
    except Exception as e:
        logger.error(f"Escalation check failed: {e}")
        db.rollback()
    finally:
        db.close()


def _check_snapshot_escalations(db):
    """Escalate incidents using the escalation_policy_snapshot stored on the incident."""
    now = datetime.now(timezone.utc)

    result = db.execute(
        text("""
            SELECT id, escalation_policy_snapshot, current_escalation_rule_index, escalation_loop_count
            FROM incidents
            WHERE status = 'triggered'
            AND next_escalation_at <= :now
            AND escalation_policy_snapshot IS NOT NULL
            FOR UPDATE SKIP LOCKED
        """),
        {"now": now},
    )
    incidents = result.fetchall()

    for inc in incidents:
        inc_id, snapshot, current_rule_idx, loop_count = inc
        if not snapshot or "rules" not in snapshot:
            continue

        rules = snapshot["rules"]
        num_loops = snapshot.get("num_loops", 1)
        next_rule_idx = current_rule_idx + 1

        if next_rule_idx >= len(rules):
            # Past last rule — check if we should loop
            new_loop_count = loop_count + 1
            if new_loop_count >= num_loops:
                # Exhausted all loops
                db.execute(
                    text("""
                        UPDATE incidents
                        SET next_escalation_at = NULL, escalation_loop_count = :loops, updated_at = NOW()
                        WHERE id = :id
                    """),
                    {"id": inc_id, "loops": new_loop_count},
                )
                db.execute(
                    text("""
                        INSERT INTO audit_logs (id, incident_id, action, details, created_at)
                        VALUES (gen_random_uuid(), :incident_id, 'escalation_exhausted',
                                :details, NOW())
                    """),
                    {
                        "incident_id": inc_id,
                        "details": f'{{"loops_completed": {new_loop_count}, "total_rules": {len(rules)}}}',
                    },
                )
                logger.info(f"Incident {inc_id} escalation exhausted after {new_loop_count} loops")
                continue
            else:
                # Loop back to rule 0
                next_rule_idx = 0
                loop_count = new_loop_count

        next_rule = rules[next_rule_idx]
        delay_minutes = next_rule.get("escalation_delay_in_minutes", 5)
        next_escalation_at = now + timedelta(minutes=delay_minutes)

        # Find user to notify from snapshot
        target_user_id = None
        for target in next_rule.get("targets", []):
            if target["type"] == "user":
                target_user_id = target.get("user_id")
            elif target["type"] == "schedule":
                target_user_id = target.get("resolved_user_id")
            if target_user_id:
                break

        # Update incident
        db.execute(
            text("""
                UPDATE incidents
                SET current_escalation_rule_index = :rule_idx,
                    escalation_loop_count = :loops,
                    escalation_level = :level,
                    next_escalation_at = :next_at,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {
                "id": inc_id,
                "rule_idx": next_rule_idx,
                "loops": loop_count,
                "level": next_rule_idx + 1,
                "next_at": next_escalation_at,
            },
        )

        # Queue notification
        if target_user_id:
            db.execute(
                text("""
                    INSERT INTO notification_attempts
                    (id, incident_id, user_id, channel, status, attempt_number, max_attempts, next_attempt_at, created_at, updated_at)
                    VALUES (gen_random_uuid(), :incident_id, :user_id, 'email', 'queued', 1, 5, NOW(), NOW(), NOW())
                """),
                {"incident_id": inc_id, "user_id": target_user_id},
            )

        # Audit log
        db.execute(
            text("""
                INSERT INTO audit_logs (id, incident_id, action, details, created_at)
                VALUES (gen_random_uuid(), :incident_id, 'escalated',
                        :details, NOW())
            """),
            {
                "incident_id": inc_id,
                "details": f'{{"from_rule": {current_rule_idx}, "to_rule": {next_rule_idx}, "loop": {loop_count}}}',
            },
        )
        logger.info(f"Incident {inc_id} escalated to rule {next_rule_idx} (loop {loop_count})")

    db.commit()


def _check_legacy_escalations(db):
    """Legacy L1->L2 escalation for incidents without escalation_policy_snapshot."""
    timeout = worker_settings.escalation_timeout_seconds
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout)

    result = db.execute(
        text("""
            SELECT i.id, i.service_id, i.title, i.severity
            FROM incidents i
            JOIN services s ON s.id = i.service_id
            WHERE i.status = 'triggered'
            AND i.escalation_level = 1
            AND i.created_at < :cutoff
            AND i.escalation_policy_snapshot IS NULL
            AND s.secondary_oncall_user_id IS NOT NULL
            FOR UPDATE OF i SKIP LOCKED
        """),
        {"cutoff": cutoff},
    )
    incidents = result.fetchall()

    for inc in incidents:
        inc_id, service_id, title, severity = inc

        secondary = db.execute(
            text("SELECT secondary_oncall_user_id FROM services WHERE id = :sid"),
            {"sid": service_id},
        ).fetchone()

        if secondary and secondary[0]:
            db.execute(
                text("""
                    UPDATE incidents SET escalation_level = 2, updated_at = NOW()
                    WHERE id = :id
                """),
                {"id": inc_id},
            )

            db.execute(
                text("""
                    INSERT INTO notification_attempts
                    (id, incident_id, user_id, channel, status, attempt_number, max_attempts, next_attempt_at, created_at, updated_at)
                    VALUES (gen_random_uuid(), :incident_id, :user_id, 'email', 'queued', 1, 5, NOW(), NOW(), NOW())
                """),
                {"incident_id": inc_id, "user_id": secondary[0]},
            )

            db.execute(
                text("""
                    INSERT INTO audit_logs (id, incident_id, action, details, created_at)
                    VALUES (gen_random_uuid(), :incident_id, 'escalated',
                            '{"from_level": 1, "to_level": 2}', NOW())
                """),
                {"incident_id": inc_id},
            )

            logger.info(f"Incident {inc_id} escalated to L2 (legacy)")

    db.commit()


def main():
    logger.info("Worker started")
    poll_interval = worker_settings.poll_interval
    escalation_counter = 0

    while running:
        processed = claim_and_process_notifications()
        if processed > 0:
            logger.info(f"Processed {processed} notifications")

        # Check escalations every 6th cycle
        escalation_counter += 1
        if escalation_counter >= 6:
            check_escalations()
            escalation_counter = 0

        time.sleep(poll_interval)

    logger.info("Worker stopped")


if __name__ == "__main__":
    main()
