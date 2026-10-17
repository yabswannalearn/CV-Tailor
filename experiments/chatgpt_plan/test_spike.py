"""Offline protocol tests; the actual SDK runner executes against a mock SSE API."""

import asyncio
import json
import os
import re
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

import httpx2 as httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from .app import create_app
from .auth import ISSUER, PLAN_SCOPE, SCOPES, ChatGPTAuth, CredentialStore, PlanError
from .database import ExperimentDatabase
from .qualification import plan_request, qualify


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.jwk = jwt.algorithms.RSAAlgorithm.to_jwk(cls.key.public_key(), as_dict=True)
        cls.jwk["kid"] = "test-key"

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = CredentialStore(self.directory.name)
        self.token_reply = None
        self.refresh_count = 0
        self.refresh_error = None
        self.revocation_status = 200

        def provider(request):
            if request.url.path == "/.well-known/openid-configuration":
                return httpx.Response(200, json={"issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/api/accounts/authorize",
                    "token_endpoint": f"{ISSUER}/api/accounts/oauth/token",
                    "jwks_uri": f"{ISSUER}/jwks", "revocation_endpoint": f"{ISSUER}/revoke"})
            if request.url.path == "/jwks":
                return httpx.Response(200, json={"keys": [self.jwk]})
            if request.url.path == "/revoke":
                return httpx.Response(self.revocation_status)
            if request.url.path.endswith("/oauth/token"):
                fields = parse_qs(request.content.decode())
                if fields["grant_type"] == ["refresh_token"]:
                    self.refresh_count += 1
                    self.assertNotIn("scope", fields)
                    if self.refresh_error:
                        if self.refresh_error == "network":
                            raise httpx.ConnectError("Mock lost renewal response", request=request)
                        return httpx.Response(400, json={"error": self.refresh_error})
                    return httpx.Response(200, json={"access_token": "rotated-access", "refresh_token": "rotated-refresh",
                        "token_type": "Bearer", "scope": SCOPES, "expires_in": 3600})
                self.assertEqual(fields["redirect_uri"], ["http://127.0.0.1:8010/auth/callback"])
                self.assertEqual(fields["resource"], ["https://api.openai.com/v1"])
                self.assertEqual(fields["client_id"], [self.token_reply["client_id"]])
                return httpx.Response(200, json=self.token_reply)
            self.fail(f"Unexpected mock request path: {request.url.path}")

        self.client = httpx.Client(transport=httpx.MockTransport(provider))
        self.addCleanup(self.client.close)
        self.auth = ChatGPTAuth(self.store, "http://127.0.0.1:8010/auth/callback", self.client)

    def connect(self, client_id="oaiapp_first", subject="test-user", scopes=SCOPES, *, new=False, nonce=None):
        self.auth.start(new=new)
        pending = self.auth.pending
        identity = jwt.encode({"iss": ISSUER, "aud": client_id, "sub": subject,
            "iat": int(time.time()), "exp": int(time.time()) + 3600,
            "nonce": nonce or pending["nonce"], "email": "demo@example.com"}, self.key,
            algorithm="RS256", headers={"kid": "test-key"})
        self.token_reply = {"client_id": client_id, "id_token": identity, "access_token": "fixture-access",
            "refresh_token": "fixture-refresh", "scope": scopes, "expires_in": 3600, "token_type": "Bearer"}
        self.auth.finish({"state": pending["state"], "code": "fixture-code", "client_id": client_id})

    def expire(self):
        with self.store.lock:
            data = self.store.load()
            data["profiles"][data["active"]]["expires_at"] = 0
            self.store.save(data)

    def test_dynamic_registration_pkce_and_stable_host(self):
        query = parse_qs(urlsplit(self.auth.start()).query)
        self.assertEqual(query["client_id"], ["dynamic_agent_client"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertTrue(query["ext_agent_host_id"][0].startswith("urn:uuid:"))
        self.assertIn(PLAN_SCOPE, query["scope"][0].split())
        restarted = CredentialStore(self.directory.name)
        self.assertEqual(restarted.load()["host_id"], query["ext_agent_host_id"][0])

    def test_identity_only_cannot_invoke_models(self):
        self.connect(scopes="openid profile email")
        self.assertTrue(self.auth.status()["connection"]["connected"])
        self.assertFalse(self.auth.status()["connection"]["sharing"])
        with self.assertRaises(PlanError) as caught:
            self.auth.access_token("oaiapp_first")
        self.assertEqual(caught.exception.code, "plan_not_enabled")

    def test_invalid_state_does_not_consume_attempt(self):
        self.auth.start()
        pending = self.auth.pending
        with self.assertRaises(PlanError):
            self.auth.finish({"state": "attacker-state", "code": "unused"})
        self.assertIs(self.auth.pending, pending)

    def test_declined_consent_preserves_connection(self):
        self.connect()
        self.auth.start()
        with self.assertRaises(PlanError):
            self.auth.finish({"state": self.auth.pending["state"], "error": "access_denied"})
        self.assertEqual(self.auth.access_token("oaiapp_first"), "fixture-access")

    def test_invalid_nonce_does_not_replace_account(self):
        self.connect()
        with self.assertRaises(PlanError) as caught:
            self.connect(client_id="oaiapp_second", new=True, nonce="wrong-nonce")
        self.assertEqual(caught.exception.code, "invalid_identity")
        self.assertEqual(self.auth.status()["active"], "oaiapp_first")

    def test_returning_account_cannot_change_subject(self):
        self.connect()
        with self.assertRaises(PlanError) as caught:
            self.connect(subject="different-user")
        self.assertEqual(caught.exception.code, "account_mismatch")
        self.assertEqual(self.store.load()["profiles"]["oaiapp_first"]["subject"], "test-user")

    def test_same_email_registrations_remain_separate(self):
        self.connect()
        self.connect(client_id="oaiapp_second", new=True)
        profiles = self.auth.status()["profiles"]
        self.assertEqual(len(profiles), 2)
        self.assertNotEqual(profiles[0]["label"], profiles[1]["label"])
        self.auth.select("oaiapp_first")
        query = parse_qs(urlsplit(self.auth.start()).query)
        self.assertEqual(query["client_id"], ["oaiapp_first"])
        self.assertIn("id_token_hint", query)
        self.assertNotIn("agent_name_hint", query)

    def test_credentials_are_not_in_public_status_or_windows_file(self):
        self.connect()
        self.assertNotIn("fixture-access", json.dumps(self.auth.status()))
        self.assertNotIn("fixture-refresh", json.dumps(self.auth.status()))
        if os.name == "nt":
            self.assertNotIn(b"fixture-access", self.store.path.read_bytes())
            self.assertNotIn(b"fixture-refresh", self.store.path.read_bytes())
        else:
            self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)

    def test_concurrent_refresh_rotates_once(self):
        self.connect()
        self.expire()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.auth.access_token("oaiapp_first"), range(2)))
        self.assertEqual(results, ["rotated-access", "rotated-access"])
        self.assertEqual(self.refresh_count, 1)
        self.assertEqual(self.store.load()["profiles"]["oaiapp_first"]["refresh_token"], "rotated-refresh")

    def test_ambiguous_refresh_is_not_reused_or_erased(self):
        self.connect()
        self.expire()
        self.refresh_error = "network"
        for _ in range(2):
            with self.assertRaises(PlanError):
                self.auth.access_token("oaiapp_first")
        self.assertEqual(self.refresh_count, 1)
        profile = self.store.load()["profiles"]["oaiapp_first"]
        self.assertTrue(profile["refresh_uncertain"])
        self.assertEqual(profile["refresh_token"], "fixture-refresh")

    def test_terminal_refresh_clears_tokens_but_keeps_registration(self):
        self.connect()
        self.expire()
        self.refresh_error = "invalid_grant"
        with self.assertRaises(PlanError):
            self.auth.access_token("oaiapp_first")
        profile = self.store.load()["profiles"]["oaiapp_first"]
        self.assertNotIn("access_token", profile)
        self.assertEqual(profile["subject"], "test-user")

    def test_sign_out_keeps_registration_and_revokes(self):
        self.connect()
        host_id = self.store.load()["host_id"]
        self.assertTrue(self.auth.sign_out("oaiapp_first"))
        profile = self.store.load()["profiles"]["oaiapp_first"]
        self.assertNotIn("access_token", profile)
        self.assertNotIn("refresh_token", profile)
        self.assertEqual(profile["subject"], "test-user")
        self.assertEqual(self.store.load()["host_id"], host_id)

    def test_local_ui_rejects_cross_origin_and_missing_csrf(self):
        database = ExperimentDatabase(os.path.join(self.directory.name, "test.sqlite3"))
        with TestClient(create_app(auth=self.auth, database=database), base_url="http://127.0.0.1:8010") as browser:
            page = browser.get("/")
            csrf = re.search(r"const csrf='([^']+)'", page.text)[1]
            self.assertEqual(page.headers["cache-control"], "no-store")
            self.assertEqual(browser.post("/api/connect", json={}).status_code, 403)
            self.assertEqual(browser.post("/api/connect", json={}, headers={
                "Origin": "https://untrusted.example", "X-CSRF-Token": csrf}).status_code, 403)
            with patch("experiments.chatgpt_plan.app.webbrowser.open", return_value=True) as open_browser:
                accepted = browser.post("/api/connect", json={}, headers={
                    "Origin": "http://127.0.0.1:8010", "X-CSRF-Token": csrf})
            self.assertEqual(accepted.status_code, 200)
            self.assertTrue(accepted.json()["browser_opened"])
            self.assertNotIn("authorization_url", accepted.json())
            self.assertTrue(open_browser.call_args.args[0].startswith(ISSUER + "/api/accounts/authorize?"))
            self.assertEqual(browser.get("/", headers={"Host": "untrusted.example"}).status_code, 400)

    def test_plan_usage_requires_first_use_acknowledgment(self):
        self.connect()
        self.assertTrue(self.auth.status()["notice_required"])
        self.auth.acknowledge()
        self.assertFalse(self.auth.status()["notice_required"])


def response_payload(output, *, status="completed", error=None):
    return {"id": "resp_fixture", "object": "response", "created_at": time.time(),
            "model": "fixture-model", "status": status, "output": output, "error": error,
            "incomplete_details": None, "instructions": None, "metadata": {},
            "parallel_tool_calls": False, "temperature": 1, "top_p": 1,
            "tool_choice": "auto", "tools": [], "usage": None, "text": {"format": {"type": "text"}}}


def sse(events):
    return "".join(f"event: {event['type']}\ndata: {json.dumps({**event, 'sequence_number': index})}\n\n"
                   for index, event in enumerate(events)).encode()


class AgentTests(unittest.IsolatedAsyncioTestCase):
    async def credential(self):
        return "fixture-oauth-token"

    def final_output(self):
        return {"recommendation": "review", "summary": "Python and FastAPI fit; pay and n8n experience need clarification.",
                "fit_evidence": [{"profile_fact_id": "profile.skills[0]",
                                  "opportunity_fact_id": "opportunity.skills[0]", "reason": "Both list Python."}],
                "gaps": ["No n8n experience is documented."], "unknowns": ["The budget and minimum rate are unknown."],
                "next_action": "Ask about budget and whether n8n is essential."}

    def mock_api(self, *, failure=None, final=None):
        requests = []

        async def handler(request):
            body = json.loads(request.content)
            requests.append(body)
            self.assertEqual(str(request.url), "https://api.openai.com/v1/responses")
            self.assertEqual(request.headers["authorization"], "Bearer fixture-oauth-token")
            self.assertIs(body["store"], False)
            self.assertIs(body["stream"], True)
            self.assertNotIn("tools", body)
            self.assertEqual(body["input"][0]["type"], "additional_tools")
            self.assertNotIn("previous_response_id", body)
            created = {"type": "response.created", "response": response_payload([], status="in_progress")}
            if failure == "http":
                return httpx.Response(403, json={"detail": "Mock policy restriction"}, headers={"x-request-id": "req_denied"})
            if failure == "limit":
                failed = {"type": "response.failed", "response": response_payload([], status="failed",
                          error={"code": "subscription_sharing_usage_limit_exceeded", "message": "Mock cap reached"})}
                return httpx.Response(200, content=sse([created, failed]), headers={"Content-Type": "text/event-stream"})
            if failure == "interrupted":
                return httpx.Response(200, content=sse([created]), headers={"Content-Type": "text/event-stream"})
            if len(requests) == 1:
                output = [{"id": "fc_fixture", "type": "function_call", "call_id": "call_fixture",
                           "name": "read_opportunity_context", "arguments": "{}", "status": "completed"}]
            else:
                self.assertTrue(any(item.get("type") == "function_call_output" for item in body["input"]))
                output = [{"id": "msg_fixture", "type": "message", "role": "assistant", "status": "completed",
                           "content": [{"type": "output_text", "text": json.dumps(final or self.final_output()), "annotations": []}]}]
            completed = {"type": "response.completed", "response": response_payload(output)}
            return httpx.Response(200, content=sse([created, completed]),
                                  headers={"Content-Type": "text/event-stream", "x-request-id": f"req_fixture_{len(requests)}"})

        return httpx.MockTransport(handler), requests

    async def test_real_sdk_executes_tool_and_validates_grounded_output(self):
        transport, requests = self.mock_api()
        result = await qualify("fixture-model", self.credential, upstream=transport)
        self.assertEqual(result["tool_calls"], 1)
        self.assertEqual(result["completed_requests"], 2)
        self.assertEqual(len(requests), 2)
        self.assertEqual(result["citations"][0]["profile_text"], "Python")
        self.assertEqual(result["tracing"], "disabled")
        self.assertNotIn("fixture-oauth-token", json.dumps(result))

    async def test_usage_limit_never_returns_success_or_retries(self):
        transport, requests = self.mock_api(failure="limit")
        with self.assertRaises(PlanError) as caught:
            await qualify("fixture-model", self.credential, upstream=transport)
        self.assertEqual(caught.exception.code, "subscription_sharing_usage_limit_exceeded")
        self.assertEqual(len(requests), 1)

    async def test_interrupted_stream_is_not_a_completed_run(self):
        transport, requests = self.mock_api(failure="interrupted")
        with self.assertRaises(Exception):
            await qualify("fixture-model", self.credential, upstream=transport)
        self.assertEqual(len(requests), 1)

    async def test_admission_error_preserves_status_and_body_shape(self):
        transport, requests = self.mock_api(failure="http")
        with self.assertRaises(PlanError) as caught:
            await qualify("fixture-model", self.credential, upstream=transport)
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.shape, "detail")
        self.assertEqual(caught.exception.request_id, "req_denied")
        self.assertEqual(len(requests), 1)

    async def test_invented_citation_is_rejected(self):
        final = self.final_output()
        final["fit_evidence"][0]["profile_fact_id"] = "profile.unprovided_experience"
        transport, _ = self.mock_api(final=final)
        with self.assertRaises(PlanError) as caught:
            await qualify("fixture-model", self.credential, upstream=transport)
        self.assertEqual(caught.exception.code, "ungrounded_result")

    def test_adapter_rejects_unsupported_fields_and_hosted_tools(self):
        base = {"model": "fixture", "store": False, "stream": True, "input": []}
        for additions in ({"temperature": 0}, {"previous_response_id": "resp_old"},
                          {"store": True}, {"stream": False}, {"tools": [{"type": "file_search"}]},
                          {"input": [{"role": "system", "content": "Unsupported message"}]}):
            with self.subTest(additions=additions), self.assertRaises(PlanError):
                plan_request({**base, **additions})


if __name__ == "__main__":
    unittest.main()
