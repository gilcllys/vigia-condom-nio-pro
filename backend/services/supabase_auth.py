"""Proxy for Supabase GoTrue (Auth) API.

All auth operations go through the Supabase GoTrue REST API.
The backend uses the anon key for user-facing operations and
the service-role key for admin operations.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT = 15


def _gotrue_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/auth/v1{path}"


def _anon_headers() -> dict:
    return {
        "apikey": settings.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }


def _service_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }


def _user_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "apikey": settings.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }


# ── Public auth operations (use anon key) ────────────────────────────────────


def sign_in_with_password(email: str, password: str) -> dict:
    resp = requests.post(
        _gotrue_url("/token?grant_type=password"),
        json={"email": email, "password": password},
        headers=_anon_headers(),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


def sign_up(email: str, password: str, redirect_to: str | None = None) -> dict:
    payload: dict = {"email": email, "password": password}
    if redirect_to:
        payload["options"] = {"emailRedirectTo": redirect_to}
    resp = requests.post(
        _gotrue_url("/signup"),
        json=payload,
        headers=_anon_headers(),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


def reset_password_for_email(email: str, redirect_to: str | None = None) -> dict:
    payload: dict = {"email": email}
    if redirect_to:
        payload["redirect_to"] = redirect_to
    resp = requests.post(
        _gotrue_url("/recover"),
        json=payload,
        headers=_anon_headers(),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json() if resp.content else {}}


def refresh_token(refresh_token_value: str) -> dict:
    resp = requests.post(
        _gotrue_url("/token?grant_type=refresh_token"),
        json={"refresh_token": refresh_token_value},
        headers=_anon_headers(),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


# ── Authenticated user operations (use user's access token) ──────────────────


def sign_out(access_token: str) -> dict:
    resp = requests.post(
        _gotrue_url("/logout"),
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code}


def get_user(access_token: str) -> dict:
    resp = requests.get(
        _gotrue_url("/user"),
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


def update_user(access_token: str, updates: dict) -> dict:
    resp = requests.put(
        _gotrue_url("/user"),
        json=updates,
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


# ── MFA operations ───────────────────────────────────────────────────────────


def mfa_enroll(access_token: str, factor_type: str = "totp", friendly_name: str | None = None) -> dict:
    payload: dict = {"factor_type": factor_type}
    if friendly_name:
        payload["friendly_name"] = friendly_name
    resp = requests.post(
        _gotrue_url("/factors"),
        json=payload,
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


def mfa_challenge(access_token: str, factor_id: str) -> dict:
    resp = requests.post(
        _gotrue_url(f"/factors/{factor_id}/challenge"),
        json={},
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


def mfa_verify(access_token: str, factor_id: str, challenge_id: str, code: str) -> dict:
    resp = requests.post(
        _gotrue_url(f"/factors/{factor_id}/verify"),
        json={"challenge_id": challenge_id, "code": code},
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    return {"status": resp.status_code, "data": resp.json()}


def mfa_unenroll(access_token: str, factor_id: str) -> dict:
    resp = requests.delete(
        _gotrue_url(f"/factors/{factor_id}"),
        headers=_user_headers(access_token),
        timeout=TIMEOUT,
    )
    status = resp.status_code
    data = resp.json() if resp.content else {}
    return {"status": status, "data": data}


def mfa_list_factors(access_token: str) -> dict:
    """List MFA factors via get_user (factors are embedded in user response)."""
    result = get_user(access_token)
    if result["status"] == 200:
        factors = result["data"].get("factors", [])
        totp = [f for f in factors if f.get("factor_type") == "totp"]
        return {"status": 200, "data": {"totp": totp, "all": factors}}
    return result


# ── Storage operations ───────────────────────────────────────────────────────


def storage_upload(bucket: str, path: str, file_bytes: bytes, content_type: str) -> dict:
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    resp = requests.post(
        url,
        data=file_bytes,
        headers={
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        timeout=60,
    )
    return {"status": resp.status_code, "data": resp.json() if resp.content else {}}


def storage_create_signed_url(bucket: str, path: str, expires_in: int = 3600) -> dict:
    url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}"
    resp = requests.post(
        url,
        json={"expiresIn": expires_in},
        headers=_service_headers(),
        timeout=TIMEOUT,
    )
    if resp.status_code == 200:
        data = resp.json()
        signed_url = data.get("signedURL", "")
        if signed_url and not signed_url.startswith("http"):
            signed_url = f"{settings.SUPABASE_URL}/storage/v1{signed_url}"
        return {"status": 200, "data": {"signedUrl": signed_url}}
    return {"status": resp.status_code, "data": resp.json() if resp.content else {}}
