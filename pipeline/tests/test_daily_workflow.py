from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "daily.yml"


def load_workflow() -> dict:
    # BaseLoader 避免 YAML 1.1 把鍵名 `on` 解析成布林值 True。
    return yaml.load(WORKFLOW.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)


def test_daily_schedule_avoids_github_top_of_hour_peak():
    workflow = load_workflow()
    schedules = workflow["on"]["schedule"]
    assert [entry["cron"] for entry in schedules] == ["17 10 * * 1-5"]


def test_database_cache_never_falls_back_to_frozen_v1():
    workflow = load_workflow()
    steps = workflow["jobs"]["update"]["steps"]
    cache = next(step for step in steps if step.get("id") == "database_cache")

    assert "github.run_attempt" in cache["with"]["key"]
    restore_keys = cache["with"]["restore-keys"].splitlines()
    assert restore_keys == ["alpha-track-db-v3-", "alpha-track-db-v2-"]
    assert all("v1" not in key for key in restore_keys)
