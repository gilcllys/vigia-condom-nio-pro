import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> bool:
    """Send one email via Resend. Returns True on success."""
    resp = requests.post(
        RESEND_API_URL,
        json={
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        },
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )

    if not resp.ok:
        logger.error("Resend failed for %s (%s): %s", to, resp.status_code, resp.text)
        return False

    return True
