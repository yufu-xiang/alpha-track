import json
from datetime import date
from pathlib import Path

from alpha_track.compute import EtfMetrics
from alpha_track.export import build_meta, build_rankings, write_json
from alpha_track.models import EtfProfile


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
        "unclassified", "anomalies", "risk_free_rate",
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
