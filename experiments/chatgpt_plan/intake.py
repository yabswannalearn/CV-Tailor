"""Validate OnlineJobs exports and establish posting identity without fetching URLs."""

import re
from urllib.parse import urlsplit, urlunsplit


MAX_IMPORT_BYTES = 10 * 1024 * 1024
MAX_IMPORT_RECORDS = 10000
TEXT_FIELDS = ("employerName", "employmentType", "salary", "datePosted", "dateUpdated",
               "descriptionSnippet", "fullDescription")


class ImportValidationError(ValueError):
    def __init__(self, field, message):
        super().__init__(message)
        self.field = field


def validate_posting(record):
    if not isinstance(record, dict):
        raise ImportValidationError("record", "Expected a job object.")
    title = record.get("jobTitle")
    if not isinstance(title, str) or not title.strip() or len(title) > 1000:
        raise ImportValidationError("jobTitle", "Provide a non-empty job title of at most 1,000 characters.")
    url = record.get("jobUrl")
    if not isinstance(url, str) or len(url) > 4000:
        raise ImportValidationError("jobUrl", "Provide an OnlineJobs.ph job URL.")
    try:
        parsed = urlsplit(url.strip())
        match = re.fullmatch(r"/jobseekers/job/([A-Za-z0-9_-]*-)?([0-9]+)/?", parsed.path)
        allowed = (parsed.scheme.lower() in {"http", "https"}
                   and parsed.hostname in {"onlinejobs.ph", "www.onlinejobs.ph"}
                   and parsed.port in {None, 80, 443} and not parsed.username and not parsed.password)
    except ValueError:
        allowed, match = False, None
    if not allowed or not match:
        raise ImportValidationError("jobUrl", "Use an OnlineJobs.ph /jobseekers/job/ URL ending in a posting ID.")
    for field in TEXT_FIELDS:
        value = record.get(field)
        if value is not None and not isinstance(value, str):
            raise ImportValidationError(field, "Expected text or null; the original text is preserved.")
    skills = record.get("skills")
    if skills is not None and (not isinstance(skills, list) or any(not isinstance(skill, str) for skill in skills)):
        raise ImportValidationError("skills", "Expected an array of skill names or null.")
    canonical_url = urlunsplit(("https", "www.onlinejobs.ph", parsed.path.rstrip("/"), "", ""))
    return {"source": "onlinejobs", "source_key": str(int(match[2])), "source_url": canonical_url,
            "title": title.strip(), "employer": record.get("employerName"), "posting": record}


def export_records(value):
    if isinstance(value, dict) and "jobUrl" in value:
        value = [value]
    if not isinstance(value, list):
        raise ImportValidationError("file", "Choose a JSON array exported by the scraper, or one job object.")
    if len(value) > MAX_IMPORT_RECORDS:
        raise ImportValidationError("file", "Import at most 10,000 records per file. Split larger exports into batches.")
    return value
