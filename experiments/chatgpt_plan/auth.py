"""Documented SIWC OAuth flow; credentials never enter the browser or CRM DB."""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import httpx2 as httpx
import jwt
from filelock import FileLock

ISSUER = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
PLAN_SCOPE = "chatgpt.tokens.use.direct"
SCOPES = f"openid profile email offline_access resource.invoke {PLAN_SCOPE}"
APP_NAME = "CV Tailor Local CRM"
TERMINAL_REFRESH = {
    "invalid_grant", "invalid_refresh_token", "token_expired",
    "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused",
}


class PlanError(Exception):
    def __init__(self, code, message, *, status=400, request_id=None, param=None, shape=None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
        self.request_id, self.param, self.shape = request_id, param, shape

    def public(self):
        return {"code": self.code, "message": self.message, "status": self.status,
                "request_id": self.request_id, "param": self.param, "body_shape": self.shape,
                "manage_usage": "https://chatgpt.com/settings/usage"}


def safe_identifier(value):
    return value if isinstance(value, str) and re.fullmatch(r"[\w.\[\]-]{1,160}", value) else None


def provider_error(body, status=400, request_id=None):
    body = body if isinstance(body, dict) else {}
    error = body.get("error", body)
    error = error if isinstance(error, dict) else {"code": error}
    code = safe_identifier(error.get("code")) or "provider_request_failed"
    messages = {
        "subscription_sharing_usage_limit_exceeded": "Usage limit reached. Open Manage usage to review your app and plan limits.",
        "subscription_sharing_usage_unavailable": "Plan usage could not be checked. Try again later.",
        "subscription_sharing_user_unavailable": "The selected account is temporarily unavailable. Try again later.",
        "subscription_sharing_user_not_eligible": "Plan usage is unavailable for this account, workspace, or policy.",
        "subscription_sharing_unsupported_capability": "The selected model or request capability is unsupported for plan usage.",
        "subscription_sharing_route_not_supported": "This request route is unsupported for plan usage.",
    }
    message = messages.get(code, "OpenAI could not complete this request. Check the diagnostic code and selected connection.")
    return PlanError(code, message, status=status, request_id=safe_identifier(request_id),
                     param=safe_identifier(error.get("param")),
                     shape="detail" if "detail" in body else "error" if "error" in body else "other")


def check_response(response):
    if response.is_error:
        try:
            body = response.json()
        except ValueError:
            body = {}
        raise provider_error(body, response.status_code, response.headers.get("x-request-id"))
    return response.json()


class CredentialStore:
    """One encrypted, atomic record protected by a cross-process refresh lock."""

    def __init__(self, root=None):
        base = Path(os.getenv("LOCALAPPDATA", Path.home() / ".local" / "share"))
        self.root = Path(root) if root else base / "CVTailor" / "chatgpt-plan-spike"
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.root.is_symlink():
            raise PlanError("unsafe_storage", "Credential storage must not be a symbolic link.")
        if os.name != "nt":
            self.root.chmod(0o700)
        self.path = self.root / "connection.dat"
        self.lock = FileLock(str(self.root / "connection.lock"), timeout=20)
        with self.lock:
            if not self.path.exists():
                self.save({"host_id": f"urn:uuid:{uuid.uuid4()}", "active": None,
                           "last_registration": None, "profiles": {}, "plan_notice_ack": False})

    def load(self):
        if self.path.is_symlink():
            raise PlanError("unsafe_storage", "Credential files must not be symbolic links.")
        try:
            payload = self.path.read_bytes()
            if os.name == "nt":
                import win32crypt
                payload = win32crypt.CryptUnprotectData(payload, None, None, None, 1)[1]
            return json.loads(payload)
        except Exception:
            raise PlanError("storage_unavailable", "Could not read protected local credentials. The saved file was preserved.") from None

    def save(self, data):
        payload = json.dumps(data).encode("utf-8")
        if os.name == "nt":
            import win32crypt
            payload = win32crypt.CryptProtectData(payload, APP_NAME, None, None, None, 1)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.root, delete=False) as file:
                temporary = Path(file.name)
                file.write(payload)
                file.flush()
                os.fsync(file.fileno())
            if os.name != "nt":
                temporary.chmod(0o600)
            os.replace(temporary, self.path)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()


class ChatGPTAuth:
    def __init__(self, store, redirect_uri, client=None):
        self.store, self.redirect_uri = store, redirect_uri
        self.client = client or httpx.Client(timeout=20, trust_env=False, follow_redirects=False)
        self.pending = None
        self.pending_lock = threading.Lock()
        self._discovery = None

    def discovery(self):
        if self._discovery is None:
            data = check_response(self.client.get(f"{ISSUER}/.well-known/openid-configuration"))
            if data.get("issuer") != ISSUER:
                raise PlanError("invalid_discovery", "OpenAI identity discovery returned an unexpected issuer.")
            for name in ("authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"):
                parsed = urlsplit(data.get(name, ""))
                if (parsed.scheme != "https" or parsed.hostname != "auth.openai.com"
                        or parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment):
                    raise PlanError("invalid_discovery", "OpenAI identity discovery returned an unexpected endpoint.")
            self._discovery = data
        return self._discovery

    def status(self):
        with self.pending_lock:
            if self.pending and time.time() - self.pending["started_at"] > 600:
                self.pending = None
        with self.store.lock:
            data = self.store.load()
        profiles = [{"id": key, "email": value.get("email"),
                     "label": f"{value.get('email') or 'ChatGPT account'} · {key[-8:]}",
                     "connected": bool(value.get("access_token")),
                     "sharing": bool(value.get("access_token")) and PLAN_SCOPE in value.get("scopes", [])
                                 and not value.get("refresh_uncertain")}
                    for key, value in data["profiles"].items() if value.get("subject")]
        selected = next((p for p in profiles if p["id"] == data["active"]), None)
        return {"profiles": profiles, "active": data["active"], "connection": selected,
                "notice_required": bool(selected and selected["sharing"] and not data["plan_notice_ack"])}

    def select(self, profile_id):
        with self.store.lock:
            data = self.store.load()
            if profile_id not in data["profiles"] or not data["profiles"][profile_id].get("subject"):
                raise PlanError("unknown_profile", "Choose a saved ChatGPT account.")
            data["active"] = profile_id
            self.store.save(data)

    def acknowledge(self):
        with self.store.lock:
            data = self.store.load()
            profile = data["profiles"].get(data["active"], {})
            if PLAN_SCOPE not in profile.get("scopes", []) or not profile.get("access_token"):
                raise PlanError("plan_not_enabled", "Authorize ChatGPT plan usage first.")
            data["plan_notice_ack"] = True
            self.store.save(data)

    def start(self, *, new=False, consent=False):
        discovery = self.discovery()
        with self.pending_lock, self.store.lock:
            data = self.store.load()
            selected = None if new else data["active"] or data["last_registration"]
            profile = data["profiles"].get(selected, {})
            state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
            self.pending = {"state": state, "nonce": nonce, "verifier": verifier,
                            "client_id": selected, "subject": profile.get("subject"),
                            "started_at": time.time()}
            params = {"client_id": selected or "dynamic_agent_client", "ext_agent_host_id": data["host_id"],
                      "response_type": "code", "redirect_uri": self.redirect_uri, "scope": SCOPES,
                      "resource": RESOURCE, "state": state, "nonce": nonce, "code_challenge_method": "S256",
                      "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")}
            if selected:
                if profile.get("id_token"):
                    params["id_token_hint"] = profile["id_token"]
                if profile.get("email"):
                    params["login_hint"] = profile["email"]
            else:
                params["agent_name_hint"] = APP_NAME
            if consent:
                params["prompt"] = "consent"
            return discovery["authorization_endpoint"] + "?" + urlencode(params)

    def verify_identity(self, token, client_id, nonce=None):
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in ("RS256", "ES256"):
                raise ValueError("Unsupported signature")
            jwks = check_response(self.client.get(self.discovery()["jwks_uri"]))
            keys = [key for key in jwks["keys"] if key.get("kid") == header.get("kid")]
            if len(keys) != 1:
                raise ValueError("Unknown signing key")
            claims = jwt.decode(token, jwt.PyJWK.from_dict(keys[0]).key,
                                algorithms=[header["alg"]], issuer=ISSUER, audience=client_id,
                                options={"require": ["iss", "aud", "sub", "exp", "iat"]})
            if not isinstance(claims["sub"], str) or not claims["sub"]:
                raise ValueError("Invalid subject")
            if nonce is not None and not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
                raise ValueError("Nonce mismatch")
            return claims
        except PlanError:
            raise
        except Exception:
            raise PlanError("invalid_identity", "The returned ChatGPT identity could not be verified. Sign in again.") from None

    def finish(self, params):
        with self.pending_lock:
            pending = self.pending
            if not pending or not hmac.compare_digest(params.get("state", "").encode(), pending["state"].encode()):
                raise PlanError("invalid_state", "This sign-in callback does not match the pending attempt.")
            self.pending = None
        if time.time() - pending["started_at"] > 600:
            raise PlanError("expired_sign_in", "The sign-in attempt expired. Start again.")
        if params.get("error"):
            raise PlanError("consent_declined", "Sign-in was not authorized. Your existing connection was preserved.")
        if params.get("iss", ISSUER) != ISSUER:
            raise PlanError("invalid_identity", "The sign-in callback returned an unexpected issuer.")
        client_id = params.get("client_id") or pending["client_id"]
        if (not safe_identifier(client_id) or client_id == "dynamic_agent_client"
                or (pending["client_id"] and client_id != pending["client_id"])):
            raise PlanError("invalid_registration", "The returned ChatGPT registration could not be verified.")
        if not params.get("code"):
            raise PlanError("missing_code", "Sign-in returned no authorization code.")
        with self.store.lock:
            data = self.store.load()
            data["profiles"].setdefault(client_id, {})
            data["last_registration"] = client_id
            self.store.save(data)  # Retain the issued registration even if code exchange fails.
            tokens = check_response(self.client.post(self.discovery()["token_endpoint"], data={
                "grant_type": "authorization_code", "client_id": client_id, "code": params["code"],
                "code_verifier": pending["verifier"], "redirect_uri": self.redirect_uri, "resource": RESOURCE}))
            identity = self.verify_identity(tokens.get("id_token", ""), client_id, pending["nonce"])
            expected = pending["subject"] or data["profiles"][client_id].get("subject")
            if expected and identity["sub"] != expected:
                raise PlanError("account_mismatch", "The returned account differs from the selected registration.")
            record = self.token_record(tokens)
            record.update({"subject": identity["sub"], "email": identity.get("email"), "issuer": ISSUER})
            data["profiles"][client_id] = record
            data["active"] = client_id
            self.store.save(data)

    @staticmethod
    def token_record(tokens):
        if (not isinstance(tokens.get("access_token"), str) or not tokens["access_token"]
                or str(tokens.get("token_type", "")).lower() != "bearer"
                or not isinstance(tokens.get("expires_in"), (int, float)) or tokens["expires_in"] <= 0):
            raise PlanError("invalid_tokens", "OpenAI returned an incomplete credential response.")
        return {"access_token": tokens["access_token"], "refresh_token": tokens.get("refresh_token"),
                "id_token": tokens.get("id_token"), "scopes": tokens.get("scope", "").split(),
                "expires_at": time.time() + tokens["expires_in"], "refresh_uncertain": False}

    def access_token(self, profile_id):
        with self.store.lock:
            data = self.store.load()
            profile = data["profiles"].get(profile_id, {})
            if profile.get("refresh_uncertain"):
                raise PlanError("reconnect_required", "A token renewal was interrupted. Sign in again to safely restore access.")
            if not profile.get("access_token") or PLAN_SCOPE not in profile.get("scopes", []):
                raise PlanError("plan_not_enabled", "Sign in and authorize ChatGPT plan usage before running AI.")
            if profile.get("expires_at", 0) > time.time() + 60:
                return profile["access_token"]
            if not profile.get("refresh_token"):
                raise PlanError("reconnect_required", "The saved connection needs a new sign-in.")
            profile["refresh_uncertain"] = True
            self.store.save(data)  # A lost response must never cause reuse of a rotating token.
            try:
                response = self.client.post(self.discovery()["token_endpoint"], data={
                    "grant_type": "refresh_token", "client_id": profile_id,
                    "refresh_token": profile["refresh_token"], "resource": RESOURCE})
                tokens = check_response(response)
                if not tokens.get("refresh_token"):
                    raise PlanError("invalid_tokens", "Token renewal returned no replacement refresh token. Sign in again.")
                updated = self.token_record(tokens)
                if tokens.get("id_token"):
                    identity = self.verify_identity(tokens["id_token"], profile_id)
                    if identity["sub"] != profile["subject"]:
                        raise PlanError("account_mismatch", "Token renewal returned a different account.")
                else:
                    updated["id_token"] = profile.get("id_token")
                profile.update(updated)
                self.store.save(data)
            except PlanError as error:
                if error.code in TERMINAL_REFRESH:
                    for key in ("access_token", "refresh_token", "id_token"):
                        profile.pop(key, None)
                    self.store.save(data)
                raise
            except httpx.HTTPError:
                raise PlanError("reconnect_required", "Token renewal could not be confirmed. Sign in again; saved credentials were preserved.") from None
            if PLAN_SCOPE not in profile["scopes"]:
                raise PlanError("plan_not_enabled", "ChatGPT plan permission is no longer granted.")
            return profile["access_token"]

    def sign_out(self, profile_id):
        confirmed = False
        with self.store.lock:
            data = self.store.load()
            profile = data["profiles"].get(profile_id, {})
            refresh = profile.get("refresh_token")
            try:
                if refresh:
                    for attempt in range(3):
                        try:
                            response = self.client.post(self.discovery()["revocation_endpoint"], data={
                                "token": refresh, "token_type_hint": "refresh_token", "client_id": profile_id})
                            confirmed = response.status_code == 200
                            if confirmed or response.status_code < 500:
                                break
                        except httpx.HTTPError:
                            pass
                        time.sleep(0.2 * 2 ** attempt)
                else:
                    confirmed = True
            except (PlanError, httpx.HTTPError):
                pass
            for key in ("access_token", "refresh_token", "id_token"):
                profile.pop(key, None)
            self.store.save(data)
        return confirmed
