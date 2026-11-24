import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from contextlib import closing

import pytest


def test_new_workspace_has_no_portfolio_preference(local_workspace):
    assert local_workspace.preferences_get()["portfolio_preference"] is None


def test_preferences_work_before_profile_and_new_applications_inherit(local_workspace):
    w = local_workspace
    initial = w.preferences_get()
    assert initial["resume_template"] == "classic"
    assert initial["tracking_connection"] is None
    assert initial["calendar_connections"] == []
    saved = w.preferences_update({"resume_template": "sidebar", "tracking_connection": {"provider": "notion"}}, initial["revision"])
    assert saved["workspace_uuid"] == initial["workspace_uuid"]
    assert saved["tracking_connection"] == {"provider": "notion", "config_path": None}
    assert w.application_add({"company_name": "Example", "job_title": "Engineer"})["template_id"] == "sidebar"
    assert w.application_add({"company_name": "Example", "job_title": "Other", "template_id": "modern"})["template_id"] == "modern"
    assert w.context_export()["preferences"] == saved


def test_partial_changes_preserve_other_choices_and_detect_conflicts(local_workspace, tmp_path):
    w = local_workspace
    config_path = str(tmp_path / "connection.json")
    saved = w.preferences_update({"tracking_connection": {"provider": "obsidian", "config_path": config_path}}, 1)
    updated = w.preferences_update({"resume_template": "technical"}, saved["revision"])
    assert updated["tracking_connection"] == saved["tracking_connection"]
    with pytest.raises(w.WorkspaceError, match="Refresh"):
        w.preferences_update({"resume_template": "compact"}, saved["revision"])
    disconnected = w.preferences_update({"tracking_connection": None}, updated["revision"])
    assert disconnected["resume_template"] == "technical"
    assert disconnected["tracking_connection"] is None


def test_portfolio_preference_changes_are_revisioned_and_preserve_other_preferences(local_workspace, tmp_path):
    w = local_workspace
    previous = w.preferences_update({
        "resume_template": "modern",
        "tracking_connection": {"provider": "notion"},
        "calendar_connections": [{"provider": "outlook"}],
    }, 1)
    expected_defaults = {"design": "editorial", "stack": "nextjs", "deploy_provider": None, "project_dir": None}
    saved = w.preferences_update({"portfolio_preference": {}}, previous["revision"])
    assert saved["portfolio_preference"] == expected_defaults

    choice = {"design": "bento", "stack": "vite-react", "deploy_provider": "cloudflare", "project_dir": str(tmp_path / "portfolio")}
    updated = w.preferences_update({"portfolio_preference": choice}, saved["revision"])
    assert updated == {**previous, "portfolio_preference": choice, "revision": saved["revision"] + 1}
    assert w.preferences_get() == updated
    with pytest.raises(w.WorkspaceError, match="Refresh"):
        w.preferences_update({"portfolio_preference": None}, saved["revision"])
    renamed = w.preferences_update({"resume_template": "classic"}, updated["revision"])
    assert renamed["portfolio_preference"] == choice
    cleared = w.preferences_update({"portfolio_preference": None}, renamed["revision"])
    assert cleared == {**renamed, "portfolio_preference": None, "revision": renamed["revision"] + 1}


def test_profile_and_default_template_stay_compatible_without_overwriting_applications(local_workspace, profile_payload):
    w = local_workspace
    w.preferences_update({"resume_template": "executive"}, 1)
    profile_without_choice = {key: value for key, value in profile_payload.items() if key != "preferred_template"}
    profile = w.profile_save(profile_without_choice)
    assert profile["preferred_template"] == "executive"
    application = w.application_add({"company_name": "Example", "job_title": "Engineer"})
    preferences = w.preferences_get()
    w.preferences_update({"resume_template": "minimal"}, preferences["revision"])
    assert w.profile_get()["preferred_template"] == "minimal"
    with pytest.raises(w.WorkspaceError, match="Refresh"):
        w.profile_save({**profile, "first_name": "Changed"})
    assert w.application_get(application["id"])["template_id"] == "executive"
    profile = w.profile_get()
    w.profile_save({**profile, "preferred_template": "serif"})
    assert w.preferences_get()["resume_template"] == "serif"
    with pytest.raises(w.WorkspaceError, match="Refresh"):
        w.preferences_update({"resume_template": "classic"}, preferences["revision"] + 1)


@pytest.mark.parametrize("payload", [
    {"resume_template": "unknown"}, {"resume_template": None},
    {"token": "fictional-private-value"},
    {"tracking_connection": {"provider": "notion", "token": "fictional-private-value"}},
    {"tracking_connection": {"provider": "unknown"}},
    {"tracking_connection": {"provider": "notion", "config_path": ".env.integrations"}},
    {"tracking_connection": {"provider": "notion", "config_path": "https://example.com/config.json"}},
    {"calendar_connections": None},
    {"calendar_connections": [{"provider": "unknown"}]},
    {"calendar_connections": [{"provider": "googlecalendar", "token": "fictional-private-value"}]},
    {"calendar_connections": [{"provider": "outlook", "config_path": ".env.integrations"}]},
    {"calendar_connections": [{"provider": "outlook", "config_path": "https://example.com/config.json"}]},
    {"calendar_connections": [{"provider": "googlecalendar"}, {"provider": "googlecalendar"}]},
])
def test_preference_schema_rejects_credentials_and_invalid_values(local_workspace, payload):
    w = local_workspace
    before = w.preferences_get()
    with pytest.raises(w.WorkspaceError) as error:
        w.preferences_update(payload, before["revision"])
    assert "fictional-private-value" not in str(error.value)
    assert w.preferences_get() == before


@pytest.mark.parametrize("choice", [
    {"design": "unknown"}, {"stack": "unknown"}, {"deploy_provider": "unknown"},
    {"project_dir": "relative/path"}, {"project_dir": "https://example.com/portfolio"},
    {"token": "fictional-private-value"}, {"vercel_token": "fictional-private-value"},
    {"api_key": "fictional-private-value"},
])
def test_invalid_portfolio_preference_does_not_echo_input_or_change_preferences(local_workspace, choice):
    w = local_workspace
    before = w.preferences_get()
    with pytest.raises(w.WorkspaceError, match="portfolio_preference") as error:
        w.preferences_update({"portfolio_preference": choice}, before["revision"])
    assert "fictional-private-value" not in str(error.value)
    assert w.preferences_get() == before


def test_portfolio_project_path_rejects_environment_file_segments(local_workspace, tmp_path):
    w = local_workspace
    with pytest.raises(w.WorkspaceError, match="portfolio_preference"):
        w.preferences_update({"portfolio_preference": {"project_dir": str(tmp_path / ".ENV.local" / "portfolio")}}, 1)


def test_version_one_upgrade_preserves_choices_and_creates_a_backup(local_workspace, profile_payload):
    from cv_tailor import database
    from cv_tailor.schema_changes import apply_schema_changes
    w = local_workspace
    w.profile_save({**profile_payload, "preferred_template": "modern"})
    application = w.application_add({"company_name": "Example", "job_title": "Engineer", "template_id": "compact"})
    with database.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE workspace_preferences")
        connection.exec_driver_sql("PRAGMA user_version=1")
    apply_schema_changes(database.engine)
    assert w.preferences_get()["resume_template"] == "modern"
    assert w.application_get(application["id"])["template_id"] == "compact"
    database_path = Path(database.engine.url.database)
    backups = list(database_path.parent.glob(database_path.name + ".backup-*"))
    assert len(backups) == 1
    with closing(sqlite3.connect(backups[0])) as backup:
        assert backup.execute("PRAGMA user_version").fetchone()[0] == 1
    uuid = w.preferences_get()["workspace_uuid"]
    apply_schema_changes(database.engine)
    assert w.preferences_get()["workspace_uuid"] == uuid
    assert len(list(database_path.parent.glob(database_path.name + ".backup-*"))) == 1


def test_new_cli_processes_reload_preferences_and_isolate_workspaces(tmp_path):
    def run(directory, *args, payload=None, success=True):
        result = subprocess.run([sys.executable, "-m", "cv_tailor", "--data-dir", str(directory), "--json", *args],
            input=json.dumps(payload) if payload is not None else None, capture_output=True, text=True,
            env={**os.environ, "AI_MODE": "external"})
        assert result.returncode == (0 if success else 1), result.stdout + result.stderr
        return json.loads(result.stdout)
    first = tmp_path / "first"
    second = tmp_path / "second"
    assert run(first, "status")["preferences"] is None
    initial = run(first, "preferences", "get")
    saved = run(first, "preferences", "set", "--revision", str(initial["revision"]), "--input", "-",
        payload={"resume_template": "minimal", "tracking_connection": {"provider": "airtable"},
                 "calendar_connections": [{"provider": "googlecalendar"}, {"provider": "outlook"}],
                 "portfolio_preference": {"design": "technical", "deploy_provider": "vercel"}})
    assert run(first, "status")["preferences"] == saved
    assert run(first, "preferences", "get") == saved
    assert saved["calendar_connections"] == [
        {"provider": "googlecalendar", "config_path": None}, {"provider": "outlook", "config_path": None}]
    assert saved["portfolio_preference"] == {"design": "technical", "stack": "nextjs", "deploy_provider": "vercel", "project_dir": None}
    other = run(second, "preferences", "get")
    assert other["resume_template"] == "classic"
    assert other["calendar_connections"] == []
    assert other["workspace_uuid"] != saved["workspace_uuid"]
    invalid = run(first, "preferences", "set", "--revision", str(saved["revision"]), "--input", "-",
        payload={"portfolio_preference": {"vercel_token": "fictional-private-value"}}, success=False)
    assert "fictional-private-value" not in json.dumps(invalid)


def test_http_and_cli_share_revisioned_preferences(local_workspace):
    from fastapi.testclient import TestClient
    from cv_tailor.main import app
    w = local_workspace
    with TestClient(app) as client:
        initial = client.get("/api/preferences").json()
        response = client.patch("/api/preferences", json={"revision": initial["revision"], "resume_template": "compact",
                                                        "calendar_connections": [{"provider": "outlook"}],
                                                        "portfolio_preference": {"design": "executive"}})
        assert response.status_code == 200, response.text
        assert w.preferences_get() == response.json()
        assert response.json()["calendar_connections"] == [{"provider": "outlook", "config_path": None}]
        assert client.get("/api/workspace").json()["preferences"] == response.json()
        assert client.get("/api/workspace/status").json()["preferences"]["portfolio_preference"] == {
            "design": "executive", "stack": "nextjs", "deploy_provider": None, "project_dir": None,
        }
        assert client.patch("/api/preferences", json={"revision": initial["revision"], "resume_template": "modern"}).status_code == 409
        rejected = client.patch("/api/preferences", json={"revision": response.json()["revision"], "token": "fictional-private-value"})
        assert rejected.status_code == 422
        assert "fictional-private-value" not in rejected.text


def test_both_calendars_coexist_with_tracking_and_disconnect_independently(local_workspace, tmp_path):
    w = local_workspace
    tracking = {"provider": "notion", "config_path": str(tmp_path / "tracker.json")}
    google = {"provider": "googlecalendar", "config_path": str(tmp_path / "google.json")}
    outlook = {"provider": "outlook", "config_path": str(tmp_path / "outlook.json")}
    initial = w.preferences_update({"resume_template": "modern", "tracking_connection": tracking}, 1)
    connected = w.preferences_update({"calendar_connections": [google, outlook]}, initial["revision"])
    assert connected["tracking_connection"] == tracking
    assert connected["resume_template"] == "modern"
    assert w.context_export()["preferences"]["calendar_connections"] == [google, outlook]
    with pytest.raises(w.WorkspaceError, match="Refresh"):
        w.preferences_update({"calendar_connections": []}, initial["revision"])
    changed = w.preferences_update({"resume_template": "classic"}, connected["revision"])
    assert changed["calendar_connections"] == [google, outlook]
    disconnected = w.preferences_update({"calendar_connections": [outlook]}, changed["revision"])
    assert disconnected["calendar_connections"] == [outlook]
    assert disconnected["tracking_connection"] == tracking
    cleared = w.preferences_update({"calendar_connections": []}, disconnected["revision"])
    assert cleared["calendar_connections"] == []
    assert cleared["tracking_connection"] == tracking
    assert cleared["workspace_uuid"] == initial["workspace_uuid"]


def test_version_two_upgrade_preserves_preferences_and_backs_up_before_alter(local_workspace):
    from cv_tailor import database
    from cv_tailor.schema_changes import apply_schema_changes, SCHEMA_VERSION
    w = local_workspace
    saved = w.preferences_update({"resume_template": "modern", "tracking_connection": {"provider": "notion"}}, 1)
    application = w.application_add({"company_name": "Example", "job_title": "Engineer"})
    with database.engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE workspace_preferences DROP COLUMN calendar_connections")
        connection.exec_driver_sql("PRAGMA user_version=2")
    apply_schema_changes(database.engine)
    assert w.preferences_get() == {**saved, "calendar_connections": []}
    assert w.application_get(application["id"])["company_name"] == "Example"
    database_path = Path(database.engine.url.database)
    backups = list(database_path.parent.glob(database_path.name + ".backup-*"))
    assert len(backups) == 1
    with closing(sqlite3.connect(backups[0])) as backup:
        assert backup.execute("PRAGMA user_version").fetchone()[0] == 2
        assert "calendar_connections" not in {row[1] for row in backup.execute("PRAGMA table_info(workspace_preferences)")}
    updated = w.preferences_update({"calendar_connections": [{"provider": "googlecalendar"}]}, saved["revision"])
    apply_schema_changes(database.engine)
    assert w.preferences_get() == updated
    assert len(list(database_path.parent.glob(database_path.name + ".backup-*"))) == 1
    with database.engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA user_version").scalar_one() == SCHEMA_VERSION


def test_version_three_upgrade_adds_portfolio_preference_and_preserves_existing_choices(local_workspace):
    from cv_tailor import database
    from cv_tailor.schema_changes import apply_schema_changes

    w = local_workspace
    saved = w.preferences_update({
        "resume_template": "modern",
        "tracking_connection": {"provider": "notion"},
        "calendar_connections": [{"provider": "googlecalendar"}, {"provider": "outlook"}],
    }, 1)
    with database.engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(workspace_preferences)")}
        if "portfolio_preference" in columns:
            connection.exec_driver_sql("ALTER TABLE workspace_preferences DROP COLUMN portfolio_preference")
        connection.exec_driver_sql("PRAGMA user_version=3")

    apply_schema_changes(database.engine)

    assert w.preferences_get() == {**saved, "portfolio_preference": None}
    with database.engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA user_version").scalar_one() == 4
    database_path = Path(database.engine.url.database)
    backups = list(database_path.parent.glob(database_path.name + ".backup-*"))
    assert len(backups) == 1
    with closing(sqlite3.connect(backups[0])) as backup:
        assert backup.execute("PRAGMA user_version").fetchone()[0] == 3
        assert "portfolio_preference" not in {row[1] for row in backup.execute("PRAGMA table_info(workspace_preferences)")}
    apply_schema_changes(database.engine)
    assert list(database_path.parent.glob(database_path.name + ".backup-*")) == backups
