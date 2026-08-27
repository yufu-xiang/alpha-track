import json

import pytest
from datetime import date
from pathlib import Path

from alpha_track.compute import EtfMetrics
from alpha_track.export import build_meta, build_rankings, write_json
from alpha_track.models import EtfProfile, PriceRecord


def profile(code="0050", **kw) -> EtfProfile:
    base = dict(code=code, name="元大台灣50", listing_date=date(2003, 6, 30),
                exchange="TWSE", category="市值型", region="台灣")
    base.update(kw)
    return EtfProfile(**base)


def metrics(code="0050") -> EtfMetrics:
    m = EtfMetrics(code=code)
    m.returns = {"D1": 0.0052, "Y1": 0.1834, "Y10": None}
    m.annualized = {"D1": None, "Y1": None, "Y10": None}
    m.excess = {"D1": 0.0011, "Y1": 0.0421, "Y10": None}
    m.volatility = 0.1833
    m.mdd = -0.25
    m.sharpe = 0.9
    m.beta = 1.02
    m.premium_discount = 0.0012
    return m


def test_rankings_uses_exact_contract_field_names():
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    assert set(out.keys()) == {"data_date", "etfs"}
    etf = out["etfs"][0]
    assert set(etf.keys()) == {
        "code", "name", "category", "region", "is_leveraged", "is_inverse",
        "close", "listing_date", "data_start", "returns", "annualized",
        "excess", "risk", "premium_discount",
        "avg_volume", "avg_turnover", "dividend_yield",
        "premium_low", "premium_high", "premium_days_ratio", "premium_sample",
    }
    assert set(etf["risk"].keys()) == {"volatility", "mdd", "sharpe", "beta"}


def test_insufficient_data_serializes_as_json_null():
    """契約核心:null 代表資料不足,前端據此排到列表最末。"""
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    assert out["etfs"][0]["returns"]["Y10"] is None
    assert json.loads(json.dumps(out))["etfs"][0]["returns"]["Y10"] is None


def test_dates_serialize_as_iso_strings():
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    assert out["data_date"] == "2026-08-21"
    assert out["etfs"][0]["listing_date"] == "2003-06-30"


def test_data_start_reports_actual_coverage_separately_from_listing_date():
    """0050 掛牌於 2003 但實際資料只到 2014(未調整分割前的區段被捨棄)。
    兩個日期都要輸出,前端才能誠實說明「這欄空白是因為資料只到 2014」。"""
    m = metrics()
    m.data_start = date(2014, 1, 2)
    out = build_rankings(date(2026, 8, 21), [(profile(), m, 195.5)])
    assert out["etfs"][0]["listing_date"] == "2003-06-30"
    assert out["etfs"][0]["data_start"] == "2014-01-02"


def test_missing_listing_date_serializes_as_null():
    out = build_rankings(date(2026, 8, 21),
                         [(profile(listing_date=None), metrics(), 195.5)])
    assert out["etfs"][0]["listing_date"] is None


def test_excess_return_is_exported():
    """規格 §4.5b 明文要提供,先前整條漏掉了。"""
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    assert out["etfs"][0]["excess"]["Y1"] == 0.0421
    assert out["etfs"][0]["excess"]["Y10"] is None


def test_rankings_does_not_alias_the_metrics_dicts():
    """匯出後若仍與 EtfMetrics 共用同一個 dict,呼叫端改一處會改到已匯出的內容。"""
    m = metrics()
    out = build_rankings(date(2026, 8, 21), [(profile(), m, 195.5)])
    m.returns["Y1"] = 999.0
    assert out["etfs"][0]["returns"]["Y1"] == 0.1834


def test_meta_reports_health_status():
    m = build_meta(data_date=date(2026, 8, 21), etf_count=258,
                   unclassified=["00999"], anomalies=[("0056", "單日變動異常")],
                   is_stale=False, risk_free_rate=0.015)
    assert m["data_date"] == "2026-08-21"
    assert m["etf_count"] == 258
    assert m["unclassified"] == ["00999"]
    assert m["anomalies"] == [{"code": "0056", "reason": "單日變動異常"}]
    assert m["is_stale"] is False
    assert m["risk_free_rate"] == 0.015
    assert "generated_at" in m


def test_meta_keys_match_the_frontend_contract_exactly():
    """1b 的測試以 Object.keys(meta).sort() 全等斷言,多一個少一個都會失敗。"""
    m = build_meta(data_date=date(2026, 8, 21), etf_count=1, unclassified=[],
                   anomalies=[], is_stale=False, risk_free_rate=0.015)
    assert set(m.keys()) == {
        "generated_at", "data_date", "is_stale", "etf_count",
        "unclassified", "anomalies", "risk_free_rate", "benchmark_return_1y",
    }


def test_meta_marks_stale_when_batch_rejected():
    m = build_meta(data_date=date(2026, 8, 20), etf_count=258,
                   unclassified=[], anomalies=[], is_stale=True,
                   risk_free_rate=0.015)
    assert m["is_stale"] is True


def test_write_json_produces_utf8_without_ascii_escaping(tmp_path: Path):
    """中文必須以 UTF-8 原樣寫出,不轉義成 \\uXXXX —— 檔案會膨脹近三倍。"""
    p = tmp_path / "out.json"
    write_json(p, {"name": "元大台灣50"})
    assert "元大台灣50" in p.read_text(encoding="utf-8")


def test_write_json_creates_parent_directories(tmp_path: Path):
    p = tmp_path / "nested" / "deep" / "out.json"
    write_json(p, {"ok": True})
    assert p.exists()


def test_write_json_output_is_valid_json_and_round_trips(tmp_path: Path):
    p = tmp_path / "out.json"
    payload = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    write_json(p, payload)
    assert json.loads(p.read_text(encoding="utf-8")) == payload


def test_meta_carries_the_benchmark_return_for_context():
    """大盤一年漲 +91.85% 的年份,整張表的報酬與夏普值都會很誇張。
    沒有這個對照,使用者無從判斷「+99%」是這檔厲害還是全市場都在漲。"""
    m = build_meta(data_date=date(2026, 8, 25), etf_count=351, unclassified=[],
                   anomalies=[], is_stale=False, risk_free_rate=0.015,
                   benchmark_return_1y=0.9185)
    assert m["benchmark_return_1y"] == 0.9185


def test_meta_benchmark_return_is_null_without_data():
    m = build_meta(data_date=date(2026, 8, 25), etf_count=0, unclassified=[],
                   anomalies=[], is_stale=False, risk_free_rate=0.015,
                   benchmark_return_1y=None)
    assert m["benchmark_return_1y"] is None


def price_series(code: str, start: date, closes: list[float]) -> list[PriceRecord]:
    from datetime import timedelta
    return [PriceRecord(code=code, date=start + timedelta(days=i), open=c, high=c,
                        low=c, close=c, volume=1000, adj_close=c * 0.9)
            for i, c in enumerate(closes)]


def test_detail_uses_day_offsets_not_repeated_date_strings():
    """完整日期字串每點要 13 位元組。3081 點的 0050 用物件陣列是 93 KB、
    平行陣列 63 KB、日期位移 35 KB —— 差三倍,而全站有 351 檔。"""
    from alpha_track.export import build_detail
    prices = price_series("0050", date(2026, 8, 1), [100.0, 101.0, 102.0])
    out = build_detail(profile(), metrics(), prices, dividends=[])
    assert out["series"]["start"] == "2026-08-01"
    assert out["series"]["days"] == [0, 1, 2]
    assert len(out["series"]["adj"]) == 3


def test_detail_series_is_the_adjusted_price():
    """走勢圖比的是含息報酬。用原始收盤價會讓高配息 ETF 看起來一路走跌。"""
    from alpha_track.export import build_detail
    prices = price_series("0050", date(2026, 8, 1), [100.0])
    out = build_detail(profile(), metrics(), prices, dividends=[])
    assert out["series"]["adj"][0] == pytest.approx(90.0)


def test_detail_also_carries_the_unadjusted_close():
    """「配息再投入 vs 不再投入」的比較非未還原價不可。

    還原價本身就已假設配息再投入,拿它去算再投入等於把配息算兩次,
    而且兩條線會完全重疊 —— 看起來像程式壞了,實際上是資料用錯。
    """
    from alpha_track.export import build_detail
    prices = price_series("0050", date(2026, 8, 1), [100.0, 110.0])
    out = build_detail(profile(), metrics(), prices, dividends=[])
    assert out["series"]["close"] == [100.0, 110.0]
    assert out["series"]["adj"] != out["series"]["close"]


def test_detail_carries_the_profile_fields_the_page_shows():
    from alpha_track.export import build_detail
    p = profile(issuer="元大投信", tracking_index="臺灣50指數")
    out = build_detail(p, metrics(), price_series("0050", date(2026, 8, 1), [1.0]),
                       dividends=[])
    assert out["issuer"] == "元大投信"
    assert out["tracking_index"] == "臺灣50指數"
    assert out["listing_date"] == "2003-06-30"
    assert out["category"] == "市值型"


def test_detail_includes_returns_and_risk_so_the_page_needs_one_request():
    """個股頁若要另外去 rankings.json 撈同一檔的數字,等於為了幾個欄位
    載入 264 KB。這裡帶著,一個請求就夠。"""
    from alpha_track.export import build_detail
    out = build_detail(profile(), metrics(), price_series("0050", date(2026, 8, 1), [1.0]),
                       dividends=[])
    assert out["returns"]["Y1"] == 0.1834
    assert out["risk"]["sharpe"] == 0.9
    assert out["excess"]["Y1"] == 0.0421


def test_detail_includes_dividend_records_newest_first():
    from alpha_track.export import build_detail
    from alpha_track.models import DividendRecord
    divs = [DividendRecord(code="0050", ex_date=date(2025, 7, 21), pay_date=date(2025, 8, 10), amount=0.5),
            DividendRecord(code="0050", ex_date=date(2026, 7, 21), pay_date=date(2026, 8, 10), amount=0.6)]
    out = build_detail(profile(), metrics(),
                       price_series("0050", date(2026, 8, 1), [1.0]), dividends=divs)
    assert [d["ex_date"] for d in out["dividends"]] == ["2026-07-21", "2025-07-21"]
    assert out["dividends"][0]["amount"] == 0.6


def test_detail_on_empty_price_history_still_produces_a_valid_file():
    from alpha_track.export import build_detail
    out = build_detail(profile(), metrics(), [], dividends=[])
    assert out["series"]["start"] is None
    assert out["series"]["days"] == []


def test_benchmark_series_is_exported_once_not_per_etf():
    """基準線 351 檔共用。放進每一檔等於同一份資料複製 351 次。"""
    from alpha_track.export import build_benchmark_series
    out = build_benchmark_series({date(2026, 8, 1): 100.0, date(2026, 8, 3): 102.0})
    assert out["start"] == "2026-08-01"
    assert out["days"] == [0, 2]
    assert out["value"] == [100.0, 102.0]


def test_benchmark_series_is_empty_when_there_is_no_data():
    from alpha_track.export import build_benchmark_series
    out = build_benchmark_series({})
    assert out["start"] is None and out["days"] == []


def test_detail_carries_the_premium_series_separately_from_prices():
    """折溢價與價格的起點不同 —— 淨值只能自接上來源那天開始累積。

    共用同一組 days 會讓折溢價前面補上一長串 null,而那看起來像資料壞了。
    """
    from alpha_track.export import build_detail
    from alpha_track.models import NavRecord
    prices = price_series("0050", date(2020, 1, 1), [100.0] * 5)
    navs = [NavRecord(code="0050", date=date(2026, 8, 25), nav=100.0, market_price=101.0),
            NavRecord(code="0050", date=date(2026, 8, 26), nav=100.0, market_price=99.0)]
    out = build_detail(profile(), metrics(), prices, dividends=[], navs=navs)
    assert out["series"]["start"] == "2020-01-01"
    assert out["premium_series"]["start"] == "2026-08-25"
    assert out["premium_series"]["days"] == [0, 1]
    assert out["premium_series"]["premium"] == pytest.approx([0.01, -0.01])


def test_premium_series_is_empty_when_there_are_no_navs():
    from alpha_track.export import build_detail
    out = build_detail(profile(), metrics(),
                       price_series("0050", date(2026, 8, 1), [1.0]), dividends=[])
    assert out["premium_series"] == {"start": None, "days": [], "premium": []}


def test_dividend_amount_is_rescaled_to_the_price_series_units():
    """配息金額是當時的原始金額,價格序列已被還原 —— 混用會離譜地錯。

    實測:0050 的股息再投入試算因為這件事高估 155.6%。
    """
    from alpha_track.export import build_detail
    from alpha_track.models import DividendRecord
    # 我方價格 31.86(已除以 4),證交所公告的除權息前收盤 131.65
    prices = price_series("0050", date(2024, 1, 15), [31.86, 31.86, 31.0])
    divs = [DividendRecord(code="0050", ex_date=date(2024, 1, 17), pay_date=None,
                           amount=3.0, prev_close=131.65)]
    out = build_detail(profile(), metrics(), prices, divs)
    row = out["dividends"][0]
    assert row["amount"] == pytest.approx(3.0)          # 原始金額不動
    assert row["amount_adj"] == pytest.approx(0.75)     # 3.0 ÷ 4
    assert row["scale_known"] is True


def test_no_split_leaves_the_amount_untouched():
    from alpha_track.export import build_detail
    from alpha_track.models import DividendRecord
    prices = price_series("0056", date(2024, 1, 15), [36.37, 36.37, 35.7])
    divs = [DividendRecord(code="0056", ex_date=date(2024, 1, 17), pay_date=None,
                           amount=0.7, prev_close=36.37)]
    row = build_detail(profile(), metrics(), prices, divs)["dividends"][0]
    assert row["amount_adj"] == pytest.approx(0.7)
    assert row["scale_known"] is True


def test_unclean_ratio_keeps_the_original_and_says_so():
    """對不上整數倍率就維持原值 —— 換算錯的數字看起來一樣合理。"""
    from alpha_track.export import build_detail
    from alpha_track.models import DividendRecord
    prices = price_series("0050", date(2024, 1, 15), [50.0, 50.0, 49.0])
    divs = [DividendRecord(code="0050", ex_date=date(2024, 1, 17), pay_date=None,
                           amount=3.0, prev_close=131.65)]   # 比值 2.63,不乾淨
    row = build_detail(profile(), metrics(), prices, divs)["dividends"][0]
    assert row["amount_adj"] == pytest.approx(3.0)
    assert row["scale_known"] is False


def test_missing_prev_close_is_not_guessed():
    """FinMind 來的紀錄沒有 prev_close。沒有依據就不換算,並標記為不確定。"""
    from alpha_track.export import build_detail
    from alpha_track.models import DividendRecord
    prices = price_series("0050", date(2024, 1, 15), [31.86, 31.86, 31.0])
    divs = [DividendRecord(code="0050", ex_date=date(2024, 1, 17), pay_date=None,
                           amount=3.0)]
    row = build_detail(profile(), metrics(), prices, divs)["dividends"][0]
    assert row["amount_adj"] == pytest.approx(3.0)
    assert row["scale_known"] is False


def test_uses_the_close_before_the_ex_date():
    """除權息前收盤價是除息**前一日**的收盤,兩邊要取同一天才比得準。

    取除息當日的話會差掉一個配息(約 1–2%),對 8 倍以上的分割還撐得住,
    但 2 倍分割就可能被容差判成對不上。
    """
    from alpha_track.export import build_detail
    from alpha_track.models import DividendRecord
    # 前一日 100、除息當日 98(跌掉配息)。prev_close=200 → 倍率應為 2
    prices = price_series("X", date(2024, 1, 16), [100.0, 98.0])
    divs = [DividendRecord(code="X", ex_date=date(2024, 1, 17), pay_date=None,
                           amount=2.0, prev_close=200.0)]
    row = build_detail(profile(), metrics(), prices, divs)["dividends"][0]
    assert row["amount_adj"] == pytest.approx(1.0)
    assert row["scale_known"] is True


def test_reciprocal_tolerance_is_relative_not_scaled():
    """倒數那一側的門檻不能乘上倍率。

    乘了的話 0.38 會被判成 1/3(|0.38×3−1| = 0.139,對上 0.06×3 = 0.18),
    而 0.38 對應不到任何真實的分割。
    """
    from alpha_track.export import _snap_split_factor
    assert _snap_split_factor(0.25) == pytest.approx(0.25)
    assert _snap_split_factor(1 / 3) == pytest.approx(1 / 3)
    assert _snap_split_factor(0.38) is None
    assert _snap_split_factor(4.0) == pytest.approx(4.0)
    assert _snap_split_factor(1.0) == pytest.approx(1.0)
    assert _snap_split_factor(2.6) is None
