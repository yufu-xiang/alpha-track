import json
from datetime import date, timedelta
from pathlib import Path

import pytest
import yaml

from alpha_track import cli
from alpha_track.cli import Settings, load_settings, run_backfill, run_export, run_update
from alpha_track.models import EtfProfile, PriceRecord
from alpha_track.storage import Database


@pytest.fixture(autouse=True)
def _no_real_sleeping(monkeypatch):
    """測試不該真的睡。

    回補對每個代號之間留 0.5 秒間隔(對免費 API 的禮貌),但在測試裡那是
    純粹的浪費 —— 加上這個 fixture 之前,整套測試從 2 秒變成 73 秒。
    專門驗證間隔的那幾個測試會自己再 monkeypatch 一次來記錄呼叫,不受影響。
    """
    monkeypatch.setattr(cli.time, "sleep", lambda _s: None)


def price_at(code: str, d: date, close: float = 100.0) -> PriceRecord:
    return PriceRecord(code=code, date=d, open=close, high=close, low=close,
                       close=close, volume=1000, adj_close=close)


def settings_for(tmp_path: Path, db_path: Path) -> Settings:
    return Settings(risk_free_rate=0.015, output_dir=str(tmp_path / "out"),
                    db_path=str(db_path), stale_warning_days=3)


# --- 設定 ------------------------------------------------------------------


def test_load_settings_reads_yaml(tmp_path: Path):
    f = tmp_path / "settings.yaml"
    f.write_text(yaml.safe_dump({
        "risk_free_rate": 0.02, "output_dir": "out",
        "db_path": "d.db", "stale_warning_days": 5,
    }), encoding="utf-8")
    s = load_settings(f)
    assert s.risk_free_rate == 0.02
    assert s.stale_warning_days == 5


def test_load_settings_applies_defaults_for_missing_keys(tmp_path: Path):
    f = tmp_path / "settings.yaml"
    f.write_text("risk_free_rate: 0.02\n", encoding="utf-8")
    s = load_settings(f)
    assert s.risk_free_rate == 0.02
    assert s.output_dir == "web/public/data"


def test_shipped_settings_file_loads():
    """真的把 repo 裡那份設定檔讀一遍 —— 手寫的 YAML 打錯字不會有人發現。"""
    root = Path(__file__).resolve().parents[2]
    s = load_settings(root / "config" / "settings.yaml")
    assert 0.0 <= s.risk_free_rate < 0.2
    assert s.output_dir and s.db_path


# --- 匯出 ------------------------------------------------------------------


def test_run_export_writes_both_json_files(tmp_path: Path):
    """匯出後 rankings.json 與 meta.json 都必須存在 —— 前端兩者都要。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_profiles([EtfProfile(code="0050", name="元大台灣50",
                                       listing_date=date(2003, 6, 30),
                                       exchange="TWSE")])
        db.upsert_prices([price_at("0050", date(2026, 8, 20), 194.0),
                          price_at("0050", date(2026, 8, 21), 195.5)])

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])

    assert (out / "rankings.json").exists()
    assert (out / "meta.json").exists()
    row = json.loads((out / "rankings.json").read_text("utf-8"))["etfs"][0]
    assert row["name"] == "元大台灣50", "名稱須來自資料庫,不得退化成代號"
    assert row["category"] == "市值型", "分類須由 classify 判定"


def test_run_export_uses_the_real_listing_date_not_a_proxy(tmp_path: Path):
    """掛牌日取自 etfs 表(來自官方 ETF 清單),不可用「最早有資料的日期」
    當代理值 —— 那會讓「成立以來」永遠看起來資料齊全(R14)。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_profiles([EtfProfile(code="0050", name="元大台灣50",
                                       listing_date=date(2003, 6, 30),
                                       exchange="TWSE")])
        db.upsert_prices([price_at("0050", date(2014, 1, 2) + timedelta(days=i),
                                   100.0 + i * 0.05) for i in range(300)])

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])
    row = json.loads((out / "rankings.json").read_text("utf-8"))["etfs"][0]
    assert row["listing_date"] == "2003-06-30"
    assert row["data_start"] == "2014-01-02"
    assert row["returns"]["INCEPTION"] is None, "歷史沒回溯到掛牌日"


def test_run_export_on_empty_database_still_writes_meta(tmp_path: Path):
    """空資料庫不得讓匯出崩潰 —— 前端需要 meta 才能顯示錯誤狀態。"""
    db_path = tmp_path / "empty.db"
    with Database(db_path) as db:
        db.init_schema()

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=True, anomalies=[])

    assert (out / "meta.json").exists()
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    assert meta["is_stale"] is True
    assert meta["etf_count"] == 0


def test_run_export_passes_the_benchmark_through_for_beta(tmp_path: Path):
    """benchmarks 表建了卻沒人讀,Beta 就永遠是 null(R2)。"""
    db_path = tmp_path / "t.db"
    days = [date(2024, 1, 1) + timedelta(days=i) for i in range(400)]
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", d, 100.0 + i * 0.1)
                          for i, d in enumerate(days)])
        db.upsert_benchmark("TAIEX_TR",
                            [(d, 1000.0 + i * 1.0) for i, d in enumerate(days)])

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])
    row = json.loads((out / "rankings.json").read_text("utf-8"))["etfs"][0]
    assert row["risk"]["beta"] is not None


# --- 每日更新 --------------------------------------------------------------


def test_update_skips_write_and_marks_stale_when_batch_rejected(tmp_path: Path):
    """規格 §8.1:整批被拒時保留前一日資料並標記 stale。"""
    db_path = tmp_path / "t.db"
    yesterday = [price_at(f"00{i:03d}", date(2026, 8, 20), 10.0)
                 for i in range(100)]
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices(yesterday)

    out = tmp_path / "out"

    # 今日只回傳 1 檔 —— 檔數暴跌,應觸發整批拒絕
    def fake_fetch(_settings):
        return [price_at("0050", date(2026, 8, 21), 10.0)], [], [], []

    run_update(settings_for(tmp_path, db_path), fetch_all=fake_fetch,
               fetch_history=lambda code, exchange: [],
               fetch_benchmark=None, fetch_dividends=None)

    with Database(db_path) as db:
        assert db.latest_price_date() == date(2026, 8, 20), "壞資料不得覆蓋好資料"

    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["is_stale"] is True
    assert meta["anomalies"], "拒絕的理由必須傳達到前端"


def test_update_writes_and_exports_when_batch_is_clean(tmp_path: Path):
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    out = tmp_path / "out"

    def fake_fetch(_settings):
        return ([price_at("0050", date(2026, 8, 21), 195.5)],
                [EtfProfile(code="0050", name="元大台灣50",
                            listing_date=date(2003, 6, 30), exchange="TWSE")],
                [], [])

    run_update(settings_for(tmp_path, db_path), fetch_all=fake_fetch,
               fetch_history=lambda code, exchange: [],
               fetch_benchmark=None, fetch_dividends=None)

    with Database(db_path) as db:
        assert db.latest_price_date() == date(2026, 8, 21)
        assert db.get_profiles()["0050"].name == "元大台灣50"

    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["is_stale"] is False


def test_update_reports_unclassified_codes(tmp_path: Path):
    """未分類清單是維護者補 etf_categories.yaml 的唯一提示。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_fetch(_settings):
        return [price_at("00999", date(2026, 8, 21), 15.0)], [], [], []

    run_update(settings_for(tmp_path, db_path), fetch_all=fake_fetch,
               fetch_history=lambda code, exchange: [],
               fetch_benchmark=None, fetch_dividends=None)
    meta = json.loads(((tmp_path / "out") / "meta.json").read_text("utf-8"))
    assert "00999" in meta["unclassified"]


# --- 回補 ------------------------------------------------------------------


def test_backfill_fetches_history_only_for_codes_that_lack_it(tmp_path: Path):
    """TWSE 每日行情一次只給一天。沒有回補,所有多期間報酬都會是 null。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", date(2026, 8, 21))])          # 缺歷史
        db.upsert_prices([price_at("0056", date(2026, 8, 1) + timedelta(days=i))
                          for i in range(80)])                            # 歷史充足

    requested: list[str] = []

    def fake_history(code: str, exchange: str) -> list[PriceRecord]:
        requested.append(code)
        return [price_at(code, date(2024, 1, 1) + timedelta(days=i))
                for i in range(400)]

    run_backfill(settings_for(tmp_path, db_path), fetch_history=fake_history,
                 fetch_benchmark=None, fetch_dividends=None)

    assert requested == ["0050"], "歷史已足夠的代號不該重抓"
    with Database(db_path) as db:
        # 回補的 400 筆 + 原本就有的當日那 1 筆
        assert len(db.get_prices("0050")) == 401


def test_backfill_passes_the_exchange_so_the_yahoo_suffix_is_right(tmp_path: Path):
    """上市 .TW、上櫃 .TWO。後綴錯會乾淨地 404,盲試兩個則每檔上櫃都先浪費一次。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_profiles([EtfProfile(code="00679B", name="元大美債20年",
                                       listing_date=None, exchange="TPEX")])
        db.upsert_prices([price_at("00679B", date(2026, 8, 21))])

    seen: list[tuple[str, str]] = []

    def fake_history(code: str, exchange: str) -> list[PriceRecord]:
        seen.append((code, exchange))
        return []

    run_backfill(settings_for(tmp_path, db_path), fetch_history=fake_history,
                 fetch_benchmark=None, fetch_dividends=None)
    assert seen == [("00679B", "TPEX")]


def test_backfill_survives_one_code_failing(tmp_path: Path):
    """單一代號抓取失敗不得中斷整批回補(規格 §8.1 來源獨立失敗)。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", date(2026, 8, 21)),
                          price_at("0056", date(2026, 8, 21))])

    def flaky(code: str, exchange: str) -> list[PriceRecord]:
        if code == "0050":
            raise RuntimeError("Yahoo 沒回應")
        return [price_at(code, date(2024, 1, 1) + timedelta(days=i))
                for i in range(400)]

    run_backfill(settings_for(tmp_path, db_path), fetch_history=flaky,
                 fetch_benchmark=None, fetch_dividends=None)

    with Database(db_path) as db:
        assert len(db.get_prices("0056")) == 401, "另一檔仍應完成回補"


def test_backfill_stores_the_benchmark_when_it_is_missing(tmp_path: Path):
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_bench(start: date, end: date) -> list[tuple[date, float]]:
        return [(date(2024, 1, 1) + timedelta(days=i), 1000.0 + i)
                for i in range(400)]

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda code, exchange: [],
                 fetch_benchmark=fake_bench, fetch_dividends=None)

    with Database(db_path) as db:
        assert len(db.get_benchmark("TAIEX_TR")) == 400


def test_update_triggers_backfill_for_newly_seen_codes(tmp_path: Path):
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_fetch(_settings):
        return [price_at("0050", date(2026, 8, 21))], [], [], []

    def fake_history(code: str, exchange: str) -> list[PriceRecord]:
        return [price_at(code, date(2024, 1, 1) + timedelta(days=i))
                for i in range(400)]

    run_update(settings_for(tmp_path, db_path), fetch_all=fake_fetch,
               fetch_history=fake_history, fetch_benchmark=None, fetch_dividends=None)

    with Database(db_path) as db:
        assert len(db.get_prices("0050")) > 1, "新代號應自動回補歷史"


def test_update_is_idempotent(tmp_path: Path):
    """完成標準:連續執行兩次,資料庫列數不變。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_fetch(_settings):
        return [price_at("0050", date(2026, 8, 21), 195.5)], [], [], []

    def fake_history(code: str, exchange: str) -> list[PriceRecord]:
        return [price_at(code, date(2024, 1, 1) + timedelta(days=i))
                for i in range(400)]

    s = settings_for(tmp_path, db_path)
    run_update(s, fetch_all=fake_fetch, fetch_history=fake_history,
               fetch_benchmark=None, fetch_dividends=None)
    with Database(db_path) as db:
        first = len(db.get_prices("0050"))
    run_update(s, fetch_all=fake_fetch, fetch_history=fake_history,
               fetch_benchmark=None, fetch_dividends=None)
    with Database(db_path) as db:
        assert len(db.get_prices("0050")) == first


def test_update_survives_a_source_that_raises(tmp_path: Path):
    """規格 §8.1:單一來源失敗不得中斷其餘流程。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_fetch(_settings):
        return [price_at("0050", date(2026, 8, 21))], [], [], []

    def exploding_history(code: str, exchange: str) -> list[PriceRecord]:
        raise RuntimeError("Yahoo 掛了")

    run_update(settings_for(tmp_path, db_path), fetch_all=fake_fetch,
               fetch_history=exploding_history, fetch_benchmark=None, fetch_dividends=None)
    assert ((tmp_path / "out") / "rankings.json").exists(), "仍應完成匯出"


# --- 只追蹤 ETF ------------------------------------------------------------


def test_update_ignores_securities_that_are_not_etfs(tmp_path: Path):
    """每日行情端點回傳全部上市櫃證券(實測 1376 + 1011 筆),ETF 只佔 350 檔。
    不篩就會把兩千多檔個股寫進資料庫,而且它們在排行榜上全部是「未分類」。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_fetch(_settings):
        prices = [price_at("0050", date(2026, 8, 21), 195.5),
                  price_at("2330", date(2026, 8, 21), 1180.0),   # 個股
                  price_at("01001T", date(2026, 8, 21), 18.0),   # REIT
                  price_at("020000", date(2026, 8, 21), 12.0)]   # ETN
        profiles = [EtfProfile(code=c, name=f"名稱{c}", listing_date=None,
                               exchange="TWSE")
                    for c in ("0050", "2330", "01001T", "020000")]
        return prices, profiles, [], []

    run_update(settings_for(tmp_path, db_path), fetch_all=fake_fetch,
               fetch_history=lambda code, exchange: [], fetch_benchmark=None, fetch_dividends=None)

    with Database(db_path) as db:
        assert db.all_codes() == ["0050"]
        assert set(db.get_profiles()) == {"0050"}

    r = json.loads(((tmp_path / "out") / "rankings.json").read_text("utf-8"))
    assert [e["code"] for e in r["etfs"]] == ["0050"]


# --- 大盤基準 --------------------------------------------------------------


def test_update_refreshes_the_benchmark_so_beta_is_reachable(tmp_path: Path):
    """benchmarks 若只靠手動 backfill 填,而排程只跑 update,
    Beta 在生產環境就永遠是 null —— R2 等於沒做。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    def fake_bench(start: date, end: date) -> list[tuple[date, float]]:
        return [(date(2024, 1, 1) + timedelta(days=i), 1000.0 + i)
                for i in range(400)]

    run_update(settings_for(tmp_path, db_path),
               fetch_all=lambda _s: ([price_at("0050", date(2026, 8, 21))], [], [], []),
               fetch_history=lambda code, exchange: [],
               fetch_benchmark=fake_bench, fetch_dividends=None)

    with Database(db_path) as db:
        assert len(db.get_benchmark("TAIEX_TR")) == 400


def test_benchmark_backfill_is_incremental_after_the_first_run(tmp_path: Path):
    """十年基準是 120 次逐月呼叫。每天重抓一次是在測試對方的耐性;
    但完全不再抓,基準就會停在回補當天,新的交易日永遠補不進來。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_benchmark("TAIEX_TR",
                            [(date(2026, 8, 1) + timedelta(days=i), 1000.0 + i)
                             for i in range(20)])

    asked: list[tuple[date, date]] = []

    def fake_bench(start: date, end: date) -> list[tuple[date, float]]:
        asked.append((start, end))
        return []

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda code, exchange: [],
                 fetch_benchmark=fake_bench, fetch_dividends=None)

    assert len(asked) == 1
    start, _ = asked[0]
    # 種入的是 8/1 起連續 20 天,最後一筆是 8/20
    assert start == date(2026, 8, 21), "應自最後一筆的隔天續抓,而非十年前"


def test_benchmark_backfill_goes_back_ten_years_when_empty(tmp_path: Path):
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    asked: list[tuple[date, date]] = []

    def fake_bench(start: date, end: date) -> list[tuple[date, float]]:
        asked.append((start, end))
        return []

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda code, exchange: [],
                 fetch_benchmark=fake_bench, fetch_dividends=None)

    start, end = asked[0]
    assert (end - start).days >= 3650, "空的基準表要補滿十年"


def test_backfill_paces_requests_between_codes(tmp_path: Path, monkeypatch):
    """首次執行要回補三百多個代號。連發不加間隔很可能被 Yahoo 暫時封鎖,
    而失敗形式是「部分代號悄悄補不到」—— 資料看起來有,只是少了一截。
    docs/data-sources.md 對此已有明確警告(未驗證安全上限)。"""
    from alpha_track import cli

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        for code in ("0050", "0056", "00878"):
            db.upsert_prices([price_at(code, date(2026, 8, 21))])

    slept: list[float] = []
    monkeypatch.setattr(cli.time, "sleep", lambda s: slept.append(s))

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda code, exchange: [],
                 fetch_benchmark=None, fetch_dividends=None)

    # 三個代號之間有兩個間隔;第一個不必等
    assert len(slept) == 2
    assert all(s >= cli.YAHOO_REQUEST_INTERVAL for s in slept)


def test_backfill_does_not_sleep_when_there_is_nothing_to_backfill(tmp_path: Path, monkeypatch):
    """每日執行時多半沒有代號需要回補,不該白等。"""
    from alpha_track import cli

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", date(2026, 8, 1) + timedelta(days=i))
                          for i in range(80)])

    slept: list[float] = []
    monkeypatch.setattr(cli.time, "sleep", lambda s: slept.append(s))

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda code, exchange: [],
                 fetch_benchmark=None, fetch_dividends=None)
    assert slept == []


def test_export_reports_unclassified_codes_itself(tmp_path: Path):
    """未分類清單是維護者補 etf_categories.yaml 的唯一提示。
    由呼叫端傳入的話,export 與 backfill 這兩個指令都會誠實地回報「零檔未分類」
    —— 而畫面上明明整片都是「未分類」,狀態列卻寫「全部正常」。"""
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", date(2026, 8, 21), 195.5),
                          price_at("00999", date(2026, 8, 21), 15.0)])

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])

    meta = json.loads((out / "meta.json").read_text("utf-8"))
    assert meta["unclassified"] == ["00999"], "0050 在分類表內,00999 不在"


def test_export_unclassified_is_sorted_and_deduplicated(tmp_path: Path):
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        for code in ("00997", "00999", "00998"):
            db.upsert_prices([price_at(code, date(2026, 8, 21))])

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    assert meta["unclassified"] == ["00997", "00998", "00999"]


def test_export_includes_the_benchmark_year_return(tmp_path: Path):
    """整張表的判讀基準。沒有它,使用者不知道 +99% 是厲害還是隨大盤。"""
    db_path = tmp_path / "t.db"
    days = [date(2025, 1, 1) + timedelta(days=i) for i in range(500)]
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", d, 100.0) for d in days])
        db.upsert_benchmark("TAIEX_TR",
                            [(d, 1000.0 * (1.001 ** i)) for i, d in enumerate(days)])

    out = tmp_path / "out"
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    assert meta["benchmark_return_1y"] is not None
    assert meta["benchmark_return_1y"] > 0


def test_export_benchmark_year_return_is_null_when_table_is_empty(tmp_path: Path):
    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", date(2026, 8, 21))])
    run_export(settings_for(tmp_path, db_path), is_stale=False, anomalies=[])
    meta = json.loads(((tmp_path / "out") / "meta.json").read_text("utf-8"))
    assert meta["benchmark_return_1y"] is None


def test_backfill_fetches_dividends_for_codes_that_need_them(tmp_path: Path):
    """FinMind 的配息 adapter 寫好也測過,但一直沒有呼叫端 ——
    dividends 表從頭到尾是空的,驗證閘門的除息豁免因此永遠沒有資料可用。"""
    from alpha_track.models import DividendRecord

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at(c, date(2026, 8, 25)) for c in ("0050", "0056")])

    asked: list[str] = []

    def fake_div(code: str) -> list[DividendRecord]:
        asked.append(code)
        return [DividendRecord(code=code, ex_date=date(2026, 7, 15),
                               pay_date=date(2026, 8, 15), amount=1.2)]

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda code, exchange: [],
                 fetch_benchmark=None, fetch_dividends=fake_div)

    assert asked == ["0050", "0056"]
    with Database(db_path) as db:
        assert len(db.get_dividends("0050")) == 1


def test_dividends_are_not_refetched_the_next_day(tmp_path: Path):
    """配息一年才變幾次。抓過就記下來,不必天天重抓。"""
    from alpha_track.models import DividendRecord

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at("0050", date(2026, 8, 25))])

    calls: list[str] = []

    def fake_div(code: str) -> list[DividendRecord]:
        calls.append(code)
        return []          # 這檔從不配息

    s = settings_for(tmp_path, db_path)
    for _ in range(3):
        run_backfill(s, fetch_history=lambda c, e: [], fetch_benchmark=None,
                     fetch_dividends=fake_div)
    assert calls == ["0050"], "沒有配息紀錄不等於沒抓過,不該被重抓"


def test_dividend_fetching_is_capped_per_run(tmp_path: Path):
    """首次執行有三百多檔要抓。一次抓完是對免費 API 連發,
    分批攤開才不會被擋 —— 反正配息不急。"""
    from alpha_track.models import DividendRecord

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at(f"00{i:03d}", date(2026, 8, 25))
                          for i in range(100)])

    calls: list[str] = []

    def fake_div(code: str) -> list[DividendRecord]:
        calls.append(code)
        return []

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda c, e: [], fetch_benchmark=None,
                 fetch_dividends=fake_div)
    from alpha_track import cli
    assert len(calls) == cli.DIVIDEND_FETCH_LIMIT


def test_one_failing_dividend_fetch_does_not_stop_the_rest(tmp_path: Path):
    from alpha_track.models import DividendRecord

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices([price_at(c, date(2026, 8, 25)) for c in ("0050", "0056")])

    def flaky(code: str) -> list[DividendRecord]:
        if code == "0050":
            raise RuntimeError("FinMind 沒回應")
        return [DividendRecord(code=code, ex_date=date(2026, 7, 15),
                               pay_date=None, amount=1.0)]

    run_backfill(settings_for(tmp_path, db_path),
                 fetch_history=lambda c, e: [], fetch_benchmark=None,
                 fetch_dividends=flaky)
    with Database(db_path) as db:
        assert len(db.get_dividends("0056")) == 1
        # 失敗的那檔不記錄抓取時間,下次會再試
        assert "0050" in db.codes_needing_dividends(30, today=date(2026, 8, 25))
