"""Send outbound webhook deliveries with HMAC-SHA256 signature."""
import hashlib
import hmac
import logging

import httpx

from worker.config import worker_settings

logger = logging.getLogger(__name__)


def send_webhook(url: str, secret: str, payload: str) -> None:
    """POST payload to url with HMAC-SHA256 signature header.

    Raises on non-2xx response or timeout.
    """
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-Incy-Signature-256": f"sha256={signature}",
        "User-Agent": "Incy-Webhook/1.0",
    }

    response = httpx.post(
        url,
        content=payload,
        headers=headers,
        timeout=worker_settings.webhook_timeout,
    )
    response.raise_for_status()
    logger.info(f"Webhook delivered to {url} — HTTP {response.status_code}")
