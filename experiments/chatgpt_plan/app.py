"""Standalone loopback UI with SQLite; independent of the legacy backend and its .env."""

import argparse
import asyncio
import hmac
import logging
import json
import secrets
import sqlite3
import webbrowser
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import date

import httpx2 as httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from fastapi import Query
from typing import Literal
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .auth import ChatGPTAuth, CredentialStore, PlanError
from .database import DraftConflict, ExperimentDatabase
from .crm_models import DraftEditRequest, DraftRequest, FreelancerProfile, UserStateRequest
from .drafting import draft_application
from .intake import ImportValidationError, MAX_IMPORT_BYTES
from .qualification import context_with_facts, list_models, qualify, sample_context
from .scraping import ScrapeSettings, ScrapeWorker
from scrapers.onlinejobs_scraper import ScrapeError


class ConnectRequest(BaseModel):
    new: bool = False
    consent: bool = False


class SelectRequest(BaseModel):
    profile_id: str = Field(min_length=1, max_length=160)


class QualifyRequest(BaseModel):
    model: str = Field(min_length=1, max_length=150)
    opportunity_id: int | None = Field(default=None, gt=0)


def create_app(port=8010, *, auth=None, database=None, scraper=None):
    origin = f"http://127.0.0.1:{port}"
    auth = auth or ChatGPTAuth(CredentialStore(), f"{origin}/auth/callback")
    database = database or ExperimentDatabase()
    scraper = scraper or ScrapeWorker(database)
    csrf = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await asyncio.to_thread(scraper.close)

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1"])
    app.state.auth, app.state.run_task = auth, None
    app.state.database = database
    app.state.scraper = scraper
    app.state.notice = None

    def invalid_json_constant(value):
        raise ValueError("Invalid JSON constant")

    @app.exception_handler(PlanError)
    async def plan_error(request, error):
        return JSONResponse({"error": error.public()}, status_code=error.status)

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, error):
        return JSONResponse({"error": {"code": "database_unavailable",
                             "message": "The local database could not be accessed. Check disk space and file access."}},
                            status_code=503)

    @app.exception_handler(DraftConflict)
    async def draft_conflict(request, error):
        return JSONResponse({"error": {"code": "draft_conflict", "message": str(error)}}, status_code=409)

    @app.middleware("http")
    async def local_requests(request, call_next):
        if request.method == "POST":
            valid = hmac.compare_digest(request.headers.get("x-csrf-token", "").encode(), csrf.encode())
            if (not valid or request.headers.get("origin") != origin
                    or request.headers.get("content-type", "").split(";")[0] != "application/json"):
                return JSONResponse({"error": {"message": "Open the local interface to perform this action."}}, status_code=403)
            if app.state.run_task and request.url.path not in ("/api/cancel", "/api/scraper/cancel"):
                return JSONResponse({"error": {"message": "Wait for the current run or stop it first."}}, status_code=409)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
            "connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        return response

    @app.get("/")
    def index():
        page = Path(__file__).with_name("inbox.html").read_text(encoding="utf-8")
        return HTMLResponse(page.replace("__CSRF__", csrf))

    @app.get("/ai")
    def ai_settings():
        page = Path(__file__).with_name("index.html").read_text(encoding="utf-8")
        return HTMLResponse(page.replace("__CSRF__", csrf))

    @app.get("/api/status")
    def status():
        return {**auth.status(), "notice": app.state.notice,
                "running": app.state.run_task is not None, "signing_in": auth.pending is not None,
                "sample": sample_context(), "database": database.status(),
                "latest_assessment": database.latest_assessment(source="synthetic")}

    @app.get("/api/opportunities")
    def opportunities(stage: Literal["inbox", "shortlisted", "skipped", "all"] = "inbox",
                      q: str = Query(default="", max_length=200), page: int = Query(default=1, ge=1),
                      posted_from: date | None = None, posted_to: date | None = None):
        if posted_from and posted_to and posted_from > posted_to:
            raise PlanError("invalid_date_range", "The From date must be on or before the To date.", status=422)
        return database.opportunities(stage=stage, query=q.strip(), page=page,
                                      posted_from=posted_from.isoformat() if posted_from else None,
                                      posted_to=posted_to.isoformat() if posted_to else None)

    def selected_opportunity(opportunity_id):
        item = database.opportunity(opportunity_id)
        if item is None:
            raise PlanError("opportunity_not_found", "This opportunity was not found. Refresh the inbox.", status=404)
        return item

    @app.get("/api/opportunities/{opportunity_id}")
    def opportunity(opportunity_id: int):
        item = selected_opportunity(opportunity_id)
        item["assessment"] = database.latest_assessment(opportunity_id)
        profile = database.profile()
        item["profile_ready"] = bool(profile["skills"] or profile["experience"])
        item["draft_profile_ready"] = bool(item["profile_ready"] or profile["original_cv"])
        item["assessment_stale"] = bool(item["assessment"] and (
            item["assessment"]["context"]["opportunity"] != item["posting"]
            or item["assessment"]["context"]["profile"] != profile))
        item["drafts"] = database.drafts(opportunity_id)
        item["latest_draft"] = draft_with_status(item["drafts"][0]["id"]) if item["drafts"] else None
        return item

    def draft_with_status(draft_id):
        saved = database.draft(draft_id)
        if saved is None:
            raise PlanError("draft_not_found", "This draft was not found. Refresh the selected lead.", status=404)
        item = selected_opportunity(saved["opportunity_id"])
        saved["stale"] = (saved["context"]["profile"] != database.profile()
                          or saved["context"]["opportunity"] != item["posting"])
        return saved

    @app.get("/api/drafts/{draft_id}")
    def get_draft(draft_id: int):
        return draft_with_status(draft_id)

    @app.post("/api/drafts/{draft_id}")
    def edit_draft(draft_id: int, body: DraftEditRequest):
        draft_with_status(draft_id)
        database.edit_draft(draft_id, **body.model_dump())
        return draft_with_status(draft_id)

    @app.get("/api/drafts/{draft_id}/export")
    def export_draft(draft_id: int):
        saved = draft_with_status(draft_id)
        return Response(f"Subject: {saved['subject']}\n\n{saved['body']}\n", media_type="text/plain; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="application-{draft_id}.txt"'})

    @app.post("/api/opportunities/{opportunity_id}/state")
    def update_opportunity(opportunity_id: int, body: UserStateRequest):
        selected_opportunity(opportunity_id)
        return database.update_user_state(opportunity_id, stage=body.stage, notes=body.notes)

    @app.get("/api/profile")
    def profile():
        return database.profile()

    @app.post("/api/profile")
    def save_profile(body: FreelancerProfile):
        return database.save_profile(body.model_dump())

    @app.post("/api/import")
    async def import_jobs(request: Request):
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > MAX_IMPORT_BYTES:
                raise PlanError("import_too_large", "Use a JSON export smaller than 10 MB. Split larger exports into batches.", status=413)
        try:
            body = json.loads(raw.decode("utf-8-sig"), parse_constant=invalid_json_constant)
            if not isinstance(body, dict) or "records" not in body:
                raise ValueError("Missing records")
            return await asyncio.to_thread(database.import_jobs, body["records"])
        except ImportValidationError as error:
            raise PlanError("invalid_export", str(error), status=400) from None
        except (ValueError, UnicodeDecodeError):
            raise PlanError("invalid_json", "Choose a valid UTF-8 JSON export from the scraper.", status=400) from None

    @app.get("/api/scraper")
    def scrape_status():
        return scraper.status()

    @app.post("/api/scraper/start")
    def start_scraper(body: ScrapeSettings):
        try:
            return scraper.start(body)
        except ScrapeError as error:
            raise PlanError("search_in_progress", str(error), status=409) from None

    @app.post("/api/scraper/cancel")
    def cancel_scraper():
        return scraper.cancel()

    @app.post("/api/connect")
    def connect(body: ConnectRequest):
        try:
            authorization_url = auth.start(new=body.new, consent=body.consent)
            if not webbrowser.open(authorization_url, new=2):
                with auth.pending_lock:
                    auth.pending = None
                raise PlanError("browser_unavailable", "The system browser could not be opened. Check your default browser and try again.")
            return {"browser_opened": True}
        except httpx.HTTPError:
            raise PlanError("connection_unavailable", "Could not reach OpenAI sign-in. Try again later.", status=503) from None

    @app.get("/auth/callback")
    def callback(request: Request):
        try:
            pairs = list(request.query_params.multi_items())
            if len({key for key, _ in pairs}) != len(pairs):
                raise PlanError("invalid_callback", "Sign-in returned duplicate callback parameters.")
            auth.finish(dict(pairs))
            app.state.notice = {"message": "ChatGPT identity verified. Plan permission is shown below."}
        except PlanError as error:
            app.state.notice = error.public()
        except Exception:
            app.state.notice = {"message": "Sign-in could not be completed. Retry using the saved registration."}
        return RedirectResponse("/", status_code=303)

    @app.post("/api/select")
    def select(body: SelectRequest):
        auth.select(body.profile_id)
        app.state.notice = None
        return auth.status()

    @app.post("/api/acknowledge")
    def acknowledge():
        auth.acknowledge()
        return auth.status()

    @app.post("/api/disconnect")
    def disconnect():
        profile_id = auth.status()["active"]
        if not profile_id:
            raise PlanError("not_connected", "There is no selected connection.")
        confirmed = auth.sign_out(profile_id)
        app.state.notice = {"message": "Signed out." if confirmed else
                            "Signed out locally. Remote revocation was not confirmed; disconnect the app in ChatGPT settings."}
        return auth.status()

    @app.get("/api/models")
    async def models():
        profile_id = (await asyncio.to_thread(auth.status))["active"]
        if not profile_id:
            raise PlanError("not_connected", "Connect ChatGPT before loading models.")
        try:
            return {"models": await asyncio.to_thread(list_models, auth, profile_id)}
        except httpx.HTTPError:
            raise PlanError("connection_unavailable", "Model discovery could not reach OpenAI. Try again later.", status=503) from None

    @app.post("/api/qualify")
    async def assessment(body: QualifyRequest):
        if app.state.run_task:
            raise PlanError("run_in_progress", "A qualification is already running.", status=409)
        app.state.run_task = asyncio.current_task()
        try:
            connection = await asyncio.to_thread(auth.status)
            if connection["notice_required"]:
                raise PlanError("plan_notice_required", "Confirm ChatGPT plan usage before running AI.", status=409)
            if auth.pending:
                raise PlanError("sign_in_pending", "Finish or restart the pending sign-in first.", status=409)
            profile_id = connection["active"]
            catalog = await asyncio.to_thread(list_models, auth, profile_id)
            if body.model not in {model["slug"] for model in catalog}:
                raise PlanError("unknown_model", "Choose a model available to this ChatGPT connection.")

            async def credential():
                return await asyncio.to_thread(auth.access_token, profile_id)

            if body.opportunity_id is None:
                context = sample_context()
            else:
                item = selected_opportunity(body.opportunity_id)
                profile = database.profile()
                if not (profile["skills"] or profile["experience"]):
                    raise PlanError("profile_required", "Save your skills or relevant experience in Your profile before qualifying a listing.", status=409)
                posting = item["posting"]
                contract = posting.get("employmentType")
                preferred = profile["preferred_contract_types"]
                checks = []
                if contract and contract != "Any" and preferred and contract not in preferred:
                    checks.append(f"Contract type {contract} does not match the saved preferences: {', '.join(preferred)}.")
                if not (posting.get("fullDescription") or "").strip():
                    checks.append("Only a listing snippet is available; full requirements are unknown.")
                if posting.get("fullDescriptionFromPreviousFetch"):
                    checks.append("The full description was retained from an earlier fetch and may be stale. Check the original posting.")
                if not posting.get("salary"):
                    checks.append("Compensation has not been provided.")
                context = context_with_facts({"profile": profile, "opportunity": posting,
                                              "preference_checks": checks,
                                              "source_notice": "OnlineJobs.ph source evidence. Availability may have changed since collection."})
            result = await asyncio.wait_for(qualify(body.model, credential, context=context), timeout=180)
            # Commit synchronously after inference: cancellation cannot leave a background write running.
            return database.save_assessment(context, result, opportunity_id=body.opportunity_id)
        except asyncio.CancelledError:
            raise PlanError("run_cancelled", "The run was stopped. No partial assessment was accepted.", status=409) from None
        except TimeoutError:
            raise PlanError("run_timeout", "The qualification timed out. No partial assessment was accepted.", status=504) from None
        except PlanError:
            raise
        except sqlite3.Error:
            raise PlanError("assessment_not_saved", "The agent completed, but its assessment could not be saved. Check the local database before running AI again.", status=503) from None
        except Exception:
            raise PlanError("agent_run_failed", "The agent could not finish this run. No assessment was accepted. Check connection and model compatibility.", status=502) from None
        finally:
            app.state.run_task = None

    @app.post("/api/cancel")
    async def cancel():
        if app.state.run_task:
            app.state.run_task.cancel()
        return {"cancel_requested": True}

    @app.post("/api/draft")
    async def generate_draft(body: DraftRequest):
        if app.state.run_task:
            raise PlanError("run_in_progress", "An AI run is already in progress.", status=409)
        item = selected_opportunity(body.opportunity_id)
        profile = database.profile()
        if item["stage"] != "shortlisted":
            raise PlanError("shortlist_required", "Shortlist this lead before drafting an application.", status=409)
        if not (profile["skills"] or profile["experience"] or profile["original_cv"]):
            raise PlanError("profile_required", "Save your skills, relevant experience, or original CV in Your profile before drafting.", status=409)
        if not (item["posting"].get("fullDescription") or "").strip():
            raise PlanError("full_description_required", "Run Find jobs with Fetch full descriptions enabled for this listing before drafting.", status=409)
        context = context_with_facts({"profile": profile, "opportunity": item["posting"], "draft_kind": body.kind,
                                     "source_notice": "Saved OnlineJobs.ph posting. Current availability has not been verified."})
        app.state.run_task = asyncio.current_task()
        try:
            connection = await asyncio.to_thread(auth.status)
            if connection["notice_required"]:
                raise PlanError("plan_notice_required", "Confirm ChatGPT plan usage in AI settings before running AI.", status=409)
            if auth.pending:
                raise PlanError("sign_in_pending", "Finish the pending sign-in first.", status=409)
            profile_id = connection["active"]
            if not profile_id or not connection.get("connection", {}).get("sharing"):
                raise PlanError("not_connected", "Connect your ChatGPT plan in AI settings before drafting.", status=409)
            catalog = await asyncio.to_thread(list_models, auth, profile_id)
            if body.model not in {model["slug"] for model in catalog}:
                raise PlanError("unknown_model", "Choose a model available to this ChatGPT connection.")

            async def credential():
                return await asyncio.to_thread(auth.access_token, profile_id)

            result = await asyncio.wait_for(draft_application(body.model, credential, context=context), timeout=180)
            saved = database.save_draft(body.opportunity_id, context, result)
            return draft_with_status(saved["id"])
        except asyncio.CancelledError:
            raise PlanError("run_cancelled", "The run was stopped. No partial draft was accepted.", status=409) from None
        except TimeoutError:
            raise PlanError("run_timeout", "Drafting timed out. No partial draft was accepted.", status=504) from None
        except PlanError:
            raise
        except sqlite3.Error:
            raise PlanError("draft_not_saved", "The agent completed, but its draft could not be saved. Check the local database before running AI again.", status=503) from None
        except Exception:
            raise PlanError("agent_run_failed", "The agent could not finish the draft. Check connection and model compatibility.", status=502) from None
        finally:
            app.state.run_task = None

    return app


def main():
    parser = argparse.ArgumentParser(description="Local freelancer opportunity inbox and ChatGPT plan runtime")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--data-directory", type=Path, help="CVTailor data directory containing the database and protected sign-in store")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose an unprivileged local port between 1024 and 65535.")
    logging.getLogger("httpx2").setLevel(logging.WARNING)
    print(f"Open http://127.0.0.1:{args.port} for the opportunity inbox. AI settings: /ai")
    app = create_app(args.port, auth=ChatGPTAuth(CredentialStore(args.data_directory / "chatgpt-plan-spike"),
                                              f"http://127.0.0.1:{args.port}/auth/callback") if args.data_directory else None,
                     database=ExperimentDatabase(args.data_directory / "local-crm-experiment" / "crm.sqlite3") if args.data_directory else None)
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
