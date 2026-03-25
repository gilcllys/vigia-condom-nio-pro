import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def get_user_email(auth_user_id: str) -> str | None:
    """Resolve a Supabase auth user ID to their email via the Admin API."""
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}"
    resp = requests.get(
        url,
        headers={
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        },
        timeout=10,
    )

    if not resp.ok:
        logger.warning("Could not resolve auth user %s: %s", auth_user_id, resp.status_code)
        return None

    data = resp.json()
    return data.get("email")
