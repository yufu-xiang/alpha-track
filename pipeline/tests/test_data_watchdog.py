from datetime import date
from io import BytesIO

from alpha_track import data_watchdog
from alpha_track.data_watchdog import validate_dates


def test_detects_deployment_lag_even_if_repo_is_current():
    issues = validate_dates(
        repo_date=date(2026, 9, 16), site_date=date(2026, 9, 11),
        twse_date=date(2026, 9, 16), tpex_date=date(2026, 9, 16),
    )
    assert len(issues) == 1
    assert "部署沒有跟上" in issues[0]


def test_detects_data_pipeline_lag_even_if_site_matches_repo():
    issues = validate_dates(
        repo_date=date(2026, 9, 15), site_date=date(2026, 9, 15),
        twse_date=date(2026, 9, 16), tpex_date=date(2026, 9, 16),
    )
    assert len(issues) == 1
    assert "官方行情已到" in issues[0]


def test_unequal_market_dates_only_require_last_common_day():
    issues = validate_dates(
        repo_date=date(2026, 9, 16), site_date=date(2026, 9, 16),
        twse_date=date(2026, 9, 17), tpex_date=date(2026, 9, 16),
    )
    assert issues == []


def test_fetch_json_bypasses_cached_site_response(monkeypatch):
    urls = []

    def fake_open(request, timeout):
        urls.append(request.full_url)
        assert timeout == 30
        return BytesIO(b'{"data_date":"2026-09-16"}')

    monkeypatch.setattr(data_watchdog.urllib.request, "urlopen", fake_open)
    assert data_watchdog.fetch_json("https://example.com/meta.json") == {
        "data_date": "2026-09-16"}
    assert "watchdog=" in urls[0]


def test_watchdog_main_checks_both_official_markets_and_live_site(monkeypatch, capsys):
    monkeypatch.setattr(data_watchdog, "load_published_date",
                        lambda _: date(2026, 9, 15))
    payloads = {
        data_watchdog.SITE_META_URL: {"data_date": "2026-09-15"},
        data_watchdog.TWSE_DAILY_URL: [{"Date": "1150916"}],
        data_watchdog.TPEX_DAILY_URL: [{"Date": "1150916"}],
    }
    monkeypatch.setattr(data_watchdog, "fetch_json", lambda url: payloads[url])
    assert data_watchdog.main() == 1
    assert "主分支停在 2026-09-15" in capsys.readouterr().out


def test_watchdog_fails_when_repo_date_is_missing(monkeypatch, capsys):
    monkeypatch.setattr(data_watchdog, "load_published_date", lambda _: None)
    assert data_watchdog.main() == 1
    assert "缺少資料日期" in capsys.readouterr().err


def test_watchdog_fails_when_live_site_cannot_be_checked(monkeypatch, capsys):
    monkeypatch.setattr(data_watchdog, "load_published_date",
                        lambda _: date(2026, 9, 16))
    monkeypatch.setattr(data_watchdog, "fetch_json",
                        lambda _: (_ for _ in ()).throw(OSError("network down")))
    assert data_watchdog.main() == 1
    assert "無法驗證網站資料" in capsys.readouterr().err
