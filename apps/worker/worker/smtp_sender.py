"""SMTP email sender with timeout."""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from worker.config import worker_settings

TIMEOUT_SECONDS = 10


def send_email_notification(
    to_email: str,
    to_name: str,
    incident_title: str,
    severity: str,
    incident_id: str,
) -> None:
    """Send an incident notification email via SMTP."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[{severity.upper()}] Incident: {incident_title}"
    msg["From"] = worker_settings.smtp_from
    msg["To"] = to_email

    text_body = f"""
Hi {to_name},

An incident has been triggered and assigned to you:

Title: {incident_title}
Severity: {severity}
Incident ID: {incident_id}

Please acknowledge or resolve this incident.

-- Incy
    """.strip()

    html_body = f"""
<html>
<body>
<h2>Incident Notification</h2>
<p>Hi {to_name},</p>
<p>An incident has been triggered and assigned to you:</p>
<table>
<tr><td><strong>Title:</strong></td><td>{incident_title}</td></tr>
<tr><td><strong>Severity:</strong></td><td>{severity}</td></tr>
<tr><td><strong>Incident ID:</strong></td><td>{incident_id}</td></tr>
</table>
<p>Please acknowledge or resolve this incident.</p>
<p>&mdash; Incy</p>
</body>
</html>
    """.strip()

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(
        worker_settings.smtp_host,
        worker_settings.smtp_port,
        timeout=TIMEOUT_SECONDS,
    ) as server:
        server.send_message(msg)
