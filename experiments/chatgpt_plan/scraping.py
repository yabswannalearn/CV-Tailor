"""One local scraping worker. Network waits never hold SQLite transactions."""

import copy
import logging
import sqlite3
import threading
import uuid
from typing import Literal

import requests
from pydantic import BaseModel, ConfigDict, Field

from scrapers.onlinejobs_scraper import ScrapeCancelled, ScrapeError, check_cancel, scrape
from .database import timestamp


class ScrapeSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    job_keyword: str = Field(default="", max_length=200)
    employment_type: Literal["all", "part-time", "full-time", "gig"] = "part-time"
    max_pages: int = Field(default=3, ge=1, le=50)
    max_results: int = Field(default=50, ge=1, le=1000)
    fetch_details: bool = False


class ScrapeWorker:
    def __init__(self, database, *, scrape_fn=scrape):
        self.database, self.scrape_fn = database, scrape_fn
        self.lock = threading.RLock()
        self.cancel_event = threading.Event()
        self.thread = None
        self.closing = False
        self.state = {"run_id": None, "status": "idle"}

    def status(self):
        with self.lock:
            return copy.deepcopy(self.state)

    def start(self, settings):
        with self.lock:
            if self.closing or self.state["status"] in ("running", "cancelling"):
                raise ScrapeError("A search is already running. Wait for it or cancel it first.")
            self.cancel_event = threading.Event()
            self.state = {
                "run_id": uuid.uuid4().hex, "status": "running", "settings": settings.model_dump(),
                "started_at": timestamp(), "finished_at": None,
                "pages": 0, "examined": 0, "fetched": 0, "removed": 0,
                "imported": 0, "updated": 0, "unchanged": 0, "failed_records": 0,
                "errors": [], "error_count": 0, "delay_seconds": 5,
                "message": "Starting OnlineJobs search…",
            }
            self.thread = threading.Thread(target=self._run, args=(settings, self.cancel_event),
                                           name="onlinejobs-search", daemon=True)
            self.thread.start()
            return copy.deepcopy(self.state)

    def cancel(self):
        with self.lock:
            if self.state["status"] in ("running", "cancelling"):
                self.state.update(status="cancelling", message="Stopping after the current request. Saved leads are kept.")
                self.cancel_event.set()
            return copy.deepcopy(self.state)

    def close(self):
        with self.lock:
            self.closing = True
            self.cancel()
            thread = self.thread
        if thread and thread.is_alive():
            thread.join(timeout=35)

    def _progress(self, event):
        with self.lock:
            for key in ("pages", "examined", "delay_seconds"):
                if key in event:
                    self.state[key] = event[key]
            if "message" in event and self.state["status"] != "cancelling":
                self.state["message"] = event["message"]
            self.state["removed"] += event.get("removed", 0)
            if "error" in event:
                self.state["error_count"] += 1
                if len(self.state["errors"]) < 20:
                    self.state["errors"].append(event["error"])

    def _run(self, settings, cancel):
        outcome, message = "completed", "Search complete. Results saved locally."
        try:
            for job in self.scrape_fn(**settings.model_dump(), cancel=cancel, progress=self._progress):
                check_cancel(cancel)
                report = self.database.import_jobs([job], preserve_details=True)
                with self.lock:
                    self.state["fetched"] += 1
                    for field, report_field in (("imported", "imported"), ("updated", "updated"),
                                                ("unchanged", "skipped"), ("failed_records", "failed")):
                        self.state[field] += report[report_field]
                for error in report["errors"]:
                    self._progress({"error": {"url": job.get("jobUrl", ""),
                                              "message": f"{error['field']}: {error['message']}"}})
            check_cancel(cancel)
            if self.status()["error_count"]:
                outcome, message = "partial", "Search finished with errors. Available listings were saved; review the errors below."
        except ScrapeCancelled:
            outcome, message = "cancelled", "Search cancelled. All leads saved before cancellation are kept."
        except (ScrapeError, requests.RequestException) as error:
            outcome = "partial" if self.status()["fetched"] else "failed"
            message = str(error) if isinstance(error, ScrapeError) else "The source could not be reached. Retry later."
            self._progress({"error": {"message": message}})
        except sqlite3.Error:
            outcome, message = "failed", "SQLite could not save the next lead. Earlier saved leads are kept; check disk space and file access."
            self._progress({"error": {"message": message}})
        except Exception:
            logging.getLogger(__name__).exception("Local scraper failed unexpectedly")
            outcome, message = "failed", "The scraper failed unexpectedly. Earlier saved leads are kept; check the local server output."
            self._progress({"error": {"message": message}})
        finally:
            with self.lock:
                self.state.update(status=outcome, message=message, finished_at=timestamp())
