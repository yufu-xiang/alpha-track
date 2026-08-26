import json
import ssl

import certifi
from datetime import date
from pathlib import Path

import pytest

from alpha_track.sources.base import (
    parse_ad_dot,
    ssl_context_for,
    parse_roc_compact,
    parse_roc_slash,
    to_float,
)
from alpha_track.sources.finmind import parse_finmind_dividends
from alpha_track.sources.tpex import parse_tpex_daily, parse_tpex_profiles
from alpha_track.sources.twse import (
    parse_twse_daily,
    parse_twse_etf_list,
    parse_twse_profiles,
    parse_twse_total_return_legacy,
)
from alpha_track.sources.yahoo import parse_yahoo_chart

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# --- TWSE 每日行情 ---------------------------------------------------------


def test_parse_twse_daily_converts_string_numbers_to_float():
    """TWSE 以字串回傳數字。openapi 版無千分位逗號,但舊站有,故一律經 to_float。"""
    payload = [{
        "Code": "0050", "Name": "元大台灣50",
        "OpeningPrice": "194.00", "HighestPrice": "196.00",
        "LowestPrice": "193.50", "ClosingPrice": "195.50",
        "TradeVolume": "12,345,678",
    }]
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 21))
    assert len(rows) == 1
    assert rows[0].close == 195.5
    assert rows[0].volume == 12345678


def test_parse_twse_daily_skips_rows_with_no_trade():
    """無成交當日以連字號表示,略過而非寫入零價。"""
    payload = [
        {"Code": "0050", "Name": "元大台灣50", "OpeningPrice": "194.00",
         "HighestPrice": "196.00", "LowestPrice": "193.50",
         "ClosingPrice": "195.50", "TradeVolume": "1000"},
        {"Code": "00999", "Name": "無成交", "OpeningPrice": "--",
         "HighestPrice": "--", "LowestPrice": "--",
         "ClosingPrice": "--", "TradeVolume": "0"},
    ]
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 21))
    assert [r.code for r in rows] == ["0050"]


def test_parse_twse_daily_on_empty_payload_returns_empty():
    assert parse_twse_daily([], trade_date=date(2026, 8, 21)) == []


def test_parse_daily_prefers_the_date_in_the_payload():
    """端點是「最新交易日快照」且無日期參數。週末執行時 date.today() 會把
    前一交易日的價格標上今天,憑空造出一個交易日(R19)。"""
    payload = [{"Date": "1150820", "Code": "0050", "Name": "元大台灣50",
                "OpeningPrice": "194.00", "HighestPrice": "196.00",
                "LowestPrice": "193.50", "ClosingPrice": "195.50",
                "TradeVolume": "1000"}]
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 23))
    assert rows[0].date == date(2026, 8, 20), "應採用 payload 的 1150820"


def test_parse_daily_falls_back_to_trade_date_when_payload_has_none():
    payload = [{"Code": "0050", "Name": "元大台灣50", "OpeningPrice": "194.00",
                "HighestPrice": "196.00", "LowestPrice": "193.50",
                "ClosingPrice": "195.50", "TradeVolume": "1000"}]
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 21))
    assert rows[0].date == date(2026, 8, 21)


def test_parse_twse_profiles_keeps_the_name_the_api_returns():
    """TWSE 已經給了名稱,不取用的話排行榜每一列都會顯示代號兩次。"""
    payload = [{"Code": "0050", "Name": "元大台灣50", "ClosingPrice": "195.50"}]
    profiles = parse_twse_profiles(payload, exchange="TWSE")
    assert len(profiles) == 1
    assert profiles[0].code == "0050"
    assert profiles[0].name == "元大台灣50"
    assert profiles[0].exchange == "TWSE"


def test_parse_twse_profiles_skips_rows_without_a_name():
    payload = [{"Code": "0050", "Name": "", "ClosingPrice": "195.50"},
               {"Code": "0056", "Name": "元大高股息", "ClosingPrice": "40.40"}]
    assert [p.code for p in parse_twse_profiles(payload, exchange="TWSE")] == ["0056"]


# --- 日期格式 --------------------------------------------------------------


def test_roc_compact_date_converts_from_minguo():
    """openapi(TWSE 與 TPEx)一律民國年無分隔:1150820 → 2026-08-20。"""
    assert parse_roc_compact("1150820") == date(2026, 8, 20)


def test_roc_slash_date_tolerates_leading_space():
    """TWSE 舊站回傳如 ' 92/01/02',含前導空格。"""
    assert parse_roc_slash(" 92/01/02") == date(2003, 1, 2)


def test_ad_dot_date_is_western_year_not_minguo():
    """TWSE 舊站 ETF 清單用西元年加句點,與其他 TWSE 端點都不同 ——
    誤當成民國年會得到 3914 年,是最容易靜默出錯的一種。"""
    assert parse_ad_dot("2003.06.30") == date(2003, 6, 30)


def test_date_parsers_return_none_on_garbage():
    assert parse_roc_compact("--") is None
    assert parse_roc_slash("") is None
    assert parse_ad_dot("N/A") is None


def test_to_float_treats_any_run_of_dashes_as_missing():
    """無成交的標記形式因端點而異:TPEx 用 '----',Change 欄用 '---'(R23)。"""
    assert to_float("----") is None
    assert to_float("---") is None
    assert to_float("-") is None
    assert to_float("22,566.08") == 22566.08
    assert to_float("-0.43") == -0.43, "負號不可被誤判為缺值標記"


# --- TWSE ETF 靜態清單 -----------------------------------------------------


def test_parse_twse_etf_list_extracts_real_listing_date():
    """掛牌日必須取自官方清單,不可用「最早有資料的日期」當代理值 ——
    Yahoo 的 0050 歷史自 2009 起,實際掛牌日是 2003-06-30。

    回應是 fields + 二維 data,不是 list[dict](R21)。"""
    payload = {
        "stat": "OK",
        "fields": ["上市日期", "證券代號", "證券簡稱", "發行人", "標的指數"],
        "data": [["2003.06.30", "0050", "元大台灣50", "元大投信", "臺灣50指數"]],
    }
    profiles = parse_twse_etf_list(payload)
    assert profiles[0].listing_date == date(2003, 6, 30)
    assert profiles[0].issuer == "元大投信"


def test_parse_twse_etf_list_maps_by_field_name_not_position():
    """欄位順序若變動,依名稱對位仍正確;依位置取值則會靜默錯亂。"""
    payload = {
        "stat": "OK",
        "fields": ["證券代號", "上市日期", "證券簡稱", "發行人", "標的指數"],
        "data": [["0050", "2003.06.30", "元大台灣50", "元大投信", "臺灣50指數"]],
    }
    profiles = parse_twse_etf_list(payload)
    assert profiles[0].code == "0050"
    assert profiles[0].listing_date == date(2003, 6, 30)


def test_parse_twse_etf_list_on_list_payload_returns_empty():
    """樣板曾假設 list[dict];真收到那種形狀時回空,不可拋例外。"""
    assert parse_twse_etf_list([{"證券代號": "0050"}]) == []


# --- TWSE 舊站報酬指數 -----------------------------------------------------


def test_parse_twse_total_return_legacy_strips_thousands_separator():
    """舊站含千分位逗號,openapi 版沒有 —— 混用時最容易漏掉這個轉換。"""
    payload = {
        "stat": "OK",
        "fields": ["日　期", "發行量加權股價報酬指數"],
        "data": [[" 92/01/02", "4,524.92"], ["92/01/03", "4,600.00"]],
    }
    rows = parse_twse_total_return_legacy(payload)
    assert rows == [(date(2003, 1, 2), 4524.92), (date(2003, 1, 3), 4600.0)]


def test_parse_twse_total_return_legacy_rejects_error_response():
    """超出範圍是 HTTP 200 + stat 帶錯誤訊息且無 data ——
    不檢查 stat 就會把失敗當成「這個月沒有資料」,回補靜默補成空的。"""
    payload = {"stat": "查詢日期小於92年1月，請重新查詢!", "total": 0}
    with pytest.raises(ValueError, match="查詢日期"):
        parse_twse_total_return_legacy(payload)


# --- TPEx ------------------------------------------------------------------


def test_parse_tpex_daily_uses_tpex_field_names():
    """上櫃的代號與名稱欄名與上市完全不同,照抄 TWSE 的欄名會全數解析不到。"""
    payload = [{"Date": "1150820", "SecuritiesCompanyCode": "00679B",
                "CompanyName": "元大美債20年", "Close": "26.36", "Open": "26.24",
                "High": "26.38", "Low": "26.24", "TradingShares": "24166000"}]
    rows = parse_tpex_daily(payload, trade_date=date(2026, 8, 21))
    assert rows[0].code == "00679B"
    assert rows[0].close == 26.36
    assert rows[0].volume == 24166000
    assert rows[0].date == date(2026, 8, 20)


def test_parse_tpex_daily_skips_the_four_dash_no_trade_marker():
    """上櫃無成交是 '----'(四個連字號),不是 TWSE 文件假設的 '--'。"""
    payload = [{"Date": "1150820", "SecuritiesCompanyCode": "2035",
                "CompanyName": "唐榮", "Close": "----", "Open": "----",
                "High": "----", "Low": "----", "TradingShares": "0"}]
    assert parse_tpex_daily(payload, trade_date=date(2026, 8, 21)) == []


def test_parse_tpex_profiles_marks_exchange_as_tpex():
    """上市/上櫃決定 Yahoo 後綴(.TW / .TWO),標錯會讓回補整檔 404。"""
    payload = [{"SecuritiesCompanyCode": "00679B", "CompanyName": "元大美債20年",
                "Close": "26.36"}]
    profiles = parse_tpex_profiles(payload)
    assert profiles[0].exchange == "TPEX"


# --- Yahoo -----------------------------------------------------------------


def test_parse_yahoo_chart_rejects_non_daily_granularity():
    """Yahoo 對長歷史標的會把 interval=1d 靜默降頻成月線(HTTP 200 不報錯)。
    月線當日線存進資料庫,波動度、MDD、Beta 全部會錯得很像真的。"""
    payload = {
        "chart": {"result": [{
            "meta": {"dataGranularity": "1mo"},
            "timestamp": [1755734400],
            "indicators": {
                "quote": [{"open": [100.0], "high": [102.0], "low": [99.0],
                           "close": [101.0], "volume": [1000]}],
                "adjclose": [{"adjclose": [95.0]}],
            },
        }]}
    }
    with pytest.raises(ValueError, match="粒度"):
        parse_yahoo_chart(payload, code="0050")


def test_parse_yahoo_chart_accepts_daily_granularity():
    payload = {
        "chart": {"result": [{
            "meta": {"dataGranularity": "1d"},
            "timestamp": [1755734400],
            "indicators": {
                "quote": [{"open": [100.0], "high": [102.0], "low": [99.0],
                           "close": [101.0], "volume": [1000]}],
                "adjclose": [{"adjclose": [95.0]}],
            },
        }]}
    }
    assert len(parse_yahoo_chart(payload, code="0050")) == 1


def test_parse_yahoo_chart_prefers_adjclose_over_close():
    """含息報酬的整條鏈路建立在還原價上,必須取 adjclose。"""
    payload = {
        "chart": {"result": [{
            "timestamp": [1755734400, 1755820800],
            "indicators": {
                "quote": [{"open": [100.0, 101.0], "high": [102.0, 103.0],
                           "low": [99.0, 100.0], "close": [101.0, 102.0],
                           "volume": [1000, 2000]}],
                "adjclose": [{"adjclose": [95.0, 96.0]}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert len(rows) == 2
    assert rows[0].close == 101.0
    assert rows[0].adj_close == 95.0


def test_parse_yahoo_chart_skips_null_entries():
    """Yahoo 在停牌日回傳 null,必須略過而非當成 0。"""
    payload = {
        "chart": {"result": [{
            "timestamp": [1755734400, 1755820800],
            "indicators": {
                "quote": [{"open": [100.0, None], "high": [102.0, None],
                           "low": [99.0, None], "close": [101.0, None],
                           "volume": [1000, None]}],
                "adjclose": [{"adjclose": [95.0, None]}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert len(rows) == 1


def test_parse_yahoo_chart_falls_back_to_close_when_no_adjclose():
    """若來源未提供還原價,以收盤價代替並由呼叫端記錄 —— 不可靜默假裝有還原價。"""
    payload = {
        "chart": {"result": [{
            "timestamp": [1755734400],
            "indicators": {
                "quote": [{"open": [100.0], "high": [102.0], "low": [99.0],
                           "close": [101.0], "volume": [1000]}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert rows[0].adj_close == 101.0


def test_parse_yahoo_chart_on_error_response_returns_empty():
    assert parse_yahoo_chart({"chart": {"result": None}}, code="0050") == []


# --- 真實回應 --------------------------------------------------------------
#
# 手寫的 payload 只證明程式能解析「我以為的形狀」;吃真 fixture 才證明它能解析
# 交易所真正回傳的形狀。R21 那個錯誤(假設 list[dict])在樣板測試下是全綠的。


def test_parse_real_twse_daily_fixture():
    rows = parse_twse_daily(load("twse_stock_day_all.json"),
                            trade_date=date(2026, 8, 21))
    assert len(rows) > 100, "真實回應應包含大量標的"
    assert all(r.close > 0 for r in rows)
    assert {r.date for r in rows} == {date(2026, 8, 20)}, "日期應來自 payload"
    assert any(r.code == "0050" for r in rows)


def test_parse_real_twse_profiles_fixture_yields_chinese_names():
    profiles = parse_twse_profiles(load("twse_stock_day_all.json"), exchange="TWSE")
    by_code = {p.code: p.name for p in profiles}
    assert by_code["0050"] == "元大台灣50"
    assert all(p.name != p.code for p in profiles), "名稱欄不得退化成代號"


def test_parse_real_twse_etf_list_fixture():
    profiles = parse_twse_etf_list(load("twse_etf_list.json"))
    assert len(profiles) > 200, "實測 232 檔上市 ETF"
    by_code = {p.code: p for p in profiles}
    assert by_code["0050"].listing_date == date(2003, 6, 30)
    assert by_code["0050"].issuer is not None
    assert all(p.exchange == "TWSE" for p in profiles)


def test_parse_real_twse_total_return_legacy_fixtures():
    rows_2020 = parse_twse_total_return_legacy(
        load("twse_taiex_total_return_legacy_2020.json"))
    assert rows_2020[0] == (date(2020, 1, 2), 22566.08)
    assert len(rows_2020) == 15

    earliest = parse_twse_total_return_legacy(
        load("twse_taiex_total_return_legacy_earliest.json"))
    assert earliest[0] == (date(2003, 1, 2), 4524.92), "前導空格的日期也要解析"


def test_parse_real_twse_total_return_legacy_out_of_range_fixture():
    """實際的超出範圍回應:HTTP 200,靠 stat 文字判斷失敗。"""
    with pytest.raises(ValueError):
        parse_twse_total_return_legacy(
            load("twse_taiex_total_return_legacy_out_of_range.json"))


def test_parse_real_tpex_fixture_includes_bond_etfs():
    """債券 ETF 幾乎全在上櫃;沒有這個 adapter,整個債券型分類都會是空的。"""
    payload = load("tpex_mainboard_quotes.json")
    rows = parse_tpex_daily(payload, trade_date=date(2026, 8, 21))
    by_code = {r.code: r for r in rows}
    assert "00679B" in by_code
    assert by_code["00679B"].close == 26.36
    assert by_code["00679B"].date == date(2026, 8, 20)
    assert len(rows) < len(payload), "無成交的列應被略過"
    assert all(r.close > 0 for r in rows)


def test_parse_real_tpex_profiles_fixture():
    profiles = parse_tpex_profiles(load("tpex_mainboard_quotes.json"))
    by_code = {p.code: p for p in profiles}
    assert by_code["00679B"].name == "元大美債20年"
    assert by_code["00679B"].exchange == "TPEX"


def test_parse_real_yahoo_daily_fixture():
    rows = parse_yahoo_chart(load("yahoo_0050_full_daily_period1_period2.json"),
                             code="0050")
    assert len(rows) > 3000
    assert rows[0].adj_close < rows[0].close, "舊日期的還原價應低於原始收盤價"
    assert all(r.close > 0 for r in rows)
    assert rows[-1].date == date(2026, 8, 21)


def test_parse_real_yahoo_downgraded_fixture_is_rejected():
    """這份 fixture 是實際被靜默降頻的回應 —— 粒度檢查擋不擋得住直接驗。"""
    with pytest.raises(ValueError, match="粒度"):
        parse_yahoo_chart(load("yahoo_0050_range_max_interval_1d.json"), code="0050")


def test_parse_real_yahoo_otc_suffix_fixture():
    rows = parse_yahoo_chart(load("yahoo_00679B_two_suffix_check.json"),
                             code="00679B")
    assert len(rows) == 5


def test_parse_real_finmind_dividend_fixture():
    rows = parse_finmind_dividends(load("finmind_dividend.json"))
    assert len(rows) > 0
    first = rows[0]
    assert first.code == "0050"
    assert first.ex_date == date(2015, 10, 26), "除息日取 CashExDividendTradingDate"
    assert first.pay_date == date(2015, 11, 26)
    assert first.amount == 2.0
    assert all(r.amount > 0 for r in rows)


def test_parse_real_finmind_paid_tier_rejection_is_not_silently_empty():
    """免費層存取付費 dataset 回 HTTP 200 以外的 status ——
    當成「這檔沒配過息」會讓還原價的交叉驗證靜默失效。"""
    with pytest.raises(ValueError):
        parse_finmind_dividends(load("finmind_price_adj_free_tier_check.json"))


# --- 未調整的分割 ----------------------------------------------------------


def test_parse_yahoo_chart_drops_history_before_an_unadjusted_split():
    """台股單日漲跌幅上限 10%(槓桿型 20%)。四分之一的跳空不是行情,
    是來源沒有回溯調整的分割 —— 而 payload 的 events 裡沒有 splits 可供偵測。"""
    payload = {
        "chart": {"result": [{
            "meta": {"dataGranularity": "1d"},
            "timestamp": [1230858000 + 86400 * i for i in range(6)],
            "indicators": {
                "quote": [{"open": [100.0] * 3 + [25.0] * 3,
                           "high": [100.0] * 3 + [25.0] * 3,
                           "low": [100.0] * 3 + [25.0] * 3,
                           "close": [100.0] * 3 + [25.0] * 3,
                           "volume": [1000] * 3 + [4000] * 3}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert len(rows) == 3, "只保留分割後那一段"
    assert all(r.close == 25.0 for r in rows)


def test_parse_yahoo_chart_keeps_history_across_a_legitimate_large_move():
    """20% 是槓桿型 ETF 的單日上限,是合法行情,不可誤判為分割而丟掉歷史。"""
    payload = {
        "chart": {"result": [{
            "meta": {"dataGranularity": "1d"},
            "timestamp": [1230858000 + 86400 * i for i in range(4)],
            "indicators": {
                "quote": [{"open": [100.0, 100.0, 80.0, 80.0],
                           "high": [100.0, 100.0, 80.0, 80.0],
                           "low": [100.0, 100.0, 80.0, 80.0],
                           "close": [100.0, 100.0, 80.0, 80.0],
                           "volume": [1000] * 4}],
            },
        }]}
    }
    assert len(parse_yahoo_chart(payload, code="00631L")) == 4


def test_parse_real_yahoo_fixture_drops_the_unadjusted_2014_split():
    """0050 於 2014-01-02 執行 1:4 分割(價格比 0.2494、成交股數 ×4.96、
    成交金額連續),Yahoo 未回溯調整,adjclose 兩側的 close/adj 比值同為
    1.5785,證明只含配息調整。跨越該日算出的 MDD 是 -77%,是假的。"""
    rows = parse_yahoo_chart(load("yahoo_0050_full_daily_period1_period2.json"),
                             code="0050")
    assert rows[0].date == date(2014, 1, 2), "起點應落在分割後"
    moves = [b.adj_close / a.adj_close - 1.0 for a, b in zip(rows, rows[1:])]
    assert max(abs(m) for m in moves) < 0.35, "保留的區段不得再有尺度斷裂"


def test_parse_twse_etf_list_splits_dual_currency_rows():
    """雙幣別 ETF 在官方清單裡是**一格兩碼**,而且用 HTML 換行連接:
    '006205(新臺幣)<br>00625K(人民幣)'。不拆開的話這些代號的掛牌日全部取不到,
    而且會產生一個永遠對不上任何行情的假代號。"""
    payload = {
        "stat": "OK",
        "fields": ["上市日期", "證券代號", "證券簡稱", "發行人", "標的指數"],
        "data": [["2011.09.29",
                  "006205(新臺幣)<br>00625K(人民幣)",
                  "富邦上証(新臺幣)<br>富邦上証+R(人民幣)",
                  "富邦投信", "上證180指數"]],
    }
    profiles = parse_twse_etf_list(payload)
    by_code = {p.code: p for p in profiles}
    assert set(by_code) == {"006205", "00625K"}
    assert by_code["006205"].name == "富邦上証"
    assert by_code["00625K"].name == "富邦上証+R"
    assert by_code["006205"].listing_date == date(2011, 9, 29)
    assert by_code["00625K"].listing_date == date(2011, 9, 29)


def test_parse_real_twse_etf_list_has_no_html_in_any_code():
    """真 fixture 有 7 列是雙幣別。任何一個代號帶著 HTML 都對不上行情。"""
    profiles = parse_twse_etf_list(load("twse_etf_list.json"))
    assert all("<" not in p.code and "(" not in p.code for p in profiles), \
        [p.code for p in profiles if "<" in p.code or "(" in p.code]
    by_code = {p.code: p for p in profiles}
    assert "00625K" in by_code, "雙幣別的第二個代號必須也在"
    assert "006205" in by_code


# --- TLS ------------------------------------------------------------------


def test_tpex_gets_a_context_without_rfc5280_strict_checking():
    """www.tpex.org.tw 的憑證鏈缺少 RFC 5280 要求的 Subject Key Identifier,
    Python 3.13+/OpenSSL 3.5+ 的預設 context 開了 VERIFY_X509_STRICT 會拒絕連線。
    不處理的話 117 檔上櫃 ETF 在新版執行環境完全抓不到。"""
    ctx = ssl_context_for("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes")
    assert not (ctx.verify_flags & ssl.VERIFY_X509_STRICT)


def test_relaxing_strict_does_not_disable_certificate_verification():
    """放寬的只是憑證『格式』要求,不是『真偽』驗證 ——
    憑證鏈與主機名一律照驗,這條界線不可以被後人一路放寬成 verify=False。"""
    ctx = ssl_context_for("https://www.tpex.org.tw/openapi/v1/x")
    assert ctx.check_hostname is True
    assert ctx.verify_mode == ssl.CERT_REQUIRED


def test_other_hosts_get_the_platform_default_untouched():
    """只有確認有問題的網域降規格,其餘一個位元都不動。

    刻意比對「與平台預設相同」而不是「含有 VERIFY_X509_STRICT」:
    那個旗標是否預設開啟**因 Python 版本而異** —— 3.14 有、3.12 沒有。
    斷言旗標存在等於把某個版本的行為寫死成普世真理,實測 CI(3.12)因此
    整批失敗,而本機(3.14)全綠。要測的是我的函式做了什麼,不是平台預設是什麼。
    """
    default = ssl.create_default_context(cafile=certifi.where())
    for url in ("https://openapi.twse.com.tw/v1/x",
                "https://query1.finance.yahoo.com/v8/x",
                "https://api.finmindtrade.com/api/v4/data"):
        assert ssl_context_for(url).verify_flags == default.verify_flags, url


def test_tpex_context_differs_from_the_default_only_by_the_strict_flag():
    """對 TPEx 也只清掉那一個旗標,其餘原封不動。

    平台預設沒有該旗標時(Python 3.12),這個式子等於「與預設相同」,
    測試照樣成立 —— 表達的是「有就清掉」,而不是「一定有」。
    """
    default = ssl.create_default_context(cafile=certifi.where())
    ctx = ssl_context_for("https://www.tpex.org.tw/openapi/v1/x")
    assert ctx.verify_flags == default.verify_flags & ~ssl.VERIFY_X509_STRICT


def _chart(closes: list[float], volumes: list[int] | None = None) -> dict:
    n = len(closes)
    return {"chart": {"result": [{
        "meta": {"dataGranularity": "1d"},
        "timestamp": [1230858000 + 86400 * i for i in range(n)],
        "indicators": {"quote": [{
            "open": closes, "high": closes, "low": closes, "close": closes,
            "volume": volumes or [1000] * n,
        }]},
    }]}}


def test_truncates_only_when_the_ratio_matches_a_plausible_split():
    """1:4 是乾淨的分割倍率,截斷。"""
    rows = parse_yahoo_chart(_chart([100.0] * 3 + [25.0] * 3), code="0050")
    assert len(rows) == 3
    assert all(r.close == 25.0 for r in rows)


def test_truncates_on_a_reverse_split():
    """反向與槓桿型 ETF 淨值太低時會做反分割,倍率同樣乾淨(實測 ×4、×5、×6、×7)。"""
    rows = parse_yahoo_chart(_chart([10.0] * 3 + [40.0] * 3), code="00673R")
    assert len(rows) == 3
    assert all(r.close == 40.0 for r in rows)


def test_keeps_history_when_a_big_move_is_not_a_plausible_split_ratio():
    """實測 00715L(布蘭特原油正2)在 2026-03-09 跳空 +62.3%,但成交金額
    ×2.56(分割該持平)、隔日就跌回 44.8(分割不會回頭),而且全序列有
    五天超過 35% —— 原油槓桿 ETF 不受漲跌幅限制,本來就會這樣動。

    1.62 不接近任何整數比,不該當成分割。誤判的代價是丟掉八年歷史,
    而那會表現為「Y3/Y5/Y10 是 null」,與「這檔太新」完全無法區分。"""
    rows = parse_yahoo_chart(_chart([38.0] * 3 + [61.6, 44.8, 39.1]), code="00715L")
    assert len(rows) == 6, "非分割的劇烈波動必須保留完整歷史"


def test_keeps_history_for_a_wild_but_non_integer_ratio():
    """1.44 倍(實測 00633L)同樣對不上任何分割比。"""
    rows = parse_yahoo_chart(_chart([100.0] * 3 + [144.0] * 3), code="00633L")
    assert len(rows) == 6


def test_absurd_ratio_is_not_treated_as_a_split_either():
    """實測 00631L 掛牌初期有 21.74 倍的跳空 —— 沒有這種分割,
    那是來源的早期壞資料。仍然保留,由警告交給人判斷。"""
    rows = parse_yahoo_chart(_chart([2000.0] * 3 + [92.0] * 3), code="00631L")
    assert len(rows) == 6


def test_split_detection_tolerates_a_market_move_on_the_same_day():
    """分割當天大盤也在動。1:4 分割搭配 -5% 的行情是 4.21 倍,仍應判為分割。"""
    rows = parse_yahoo_chart(_chart([100.0] * 3 + [23.75] * 3), code="0050")
    assert len(rows) == 3


def test_etf_list_null_cells_do_not_become_the_string_none():
    """主動式 ETF 沒有追蹤指數,官方清單那一格是 JSON null(實測 232 列中有 25 列)。
    以 str() 轉換會得到字串 'None',於是資料庫裡就有 25 檔「追蹤一個叫 None 的指數」
    —— 是個看起來有值、實際無意義的欄位。"""
    payload = {
        "stat": "OK",
        "fields": ["上市日期", "證券代號", "證券簡稱", "發行人", "標的指數"],
        "data": [["2025.05.22", "00982A", "主動群益台灣強棒", "群益投信", None]],
    }
    p = parse_twse_etf_list(payload)[0]
    assert p.tracking_index is None, "應為 None,不是字串 'None'"
    assert p.issuer == "群益投信"


def test_real_etf_list_fixture_has_no_none_string_anywhere():
    for p in parse_twse_etf_list(load("twse_etf_list.json")):
        assert p.tracking_index != "None", p.code
        assert p.issuer != "None", p.code
        assert p.name != "None", p.code


def load_fixture(name: str):
    import json
    from pathlib import Path
    path = Path(__file__).parent / "fixtures" / name
    return json.loads(path.read_text(encoding="utf-8"))


class TestParseTwseMisEtf:
    """TWSE MIS 的 ETF 淨值快照。欄位代號是實測解出來的,測試對著真實 fixture 跑。"""

    def test_parses_the_real_snapshot(self):
        from alpha_track.sources.twse import parse_twse_mis_etf
        rows = parse_twse_mis_etf(load_fixture("twse_mis_all_etf.json"))
        # fixture 共 357 檔,其中 00409A 當日無成交(市價 0)被剔除
        assert len(rows) == 356
        assert all(r.date == date(2026, 8, 26) for r in rows)

    def test_field_letters_map_to_the_right_quantities(self):
        """e=市價、f=淨值。對調的話折溢價會整批變號,而數值大小看起來仍然合理。"""
        from alpha_track.sources.twse import parse_twse_mis_etf
        rows = {r.code: r for r in parse_twse_mis_etf(load_fixture("twse_mis_all_etf.json"))}
        r = rows["00715L"]
        assert r.market_price == pytest.approx(46.36)
        assert r.nav == pytest.approx(45.79)
        assert r.premium_discount == pytest.approx(0.0124, abs=1e-4)

    def test_our_premium_matches_the_exchange_own_figure(self):
        """自 nav 與 market_price 重算的折溢價,須與端點自報的 g 欄一致。

        這是解碼是否正確的實證:若 e/f 認錯欄位,兩者不可能對得上。
        容忍 0.06 個百分點 —— e/f 是四捨五入後的顯示值,g 用未捨入的淨值算。
        """
        from alpha_track.sources.twse import parse_twse_mis_etf
        payload = load_fixture("twse_mis_all_etf.json")
        reported = {}
        for block in payload["a1"]:
            for item in block.get("msgArray", []):
                try:
                    reported[str(item["a"]).strip()] = float(str(item["g"]).replace(",", ""))
                except (TypeError, ValueError):
                    pass
        rows = parse_twse_mis_etf(payload)
        checked = 0
        for r in rows:
            theirs = reported.get(r.code)
            if theirs is None or r.premium_discount is None:
                continue
            assert abs(r.premium_discount * 100 - theirs) < 0.06, r.code
            checked += 1
        assert checked > 300

    def test_skips_untraded_etfs_instead_of_calling_them_fairly_priced(self):
        """市價 0 代表當日無成交。

        端點在這種情況下的 g 欄回報 0 —— 照收會讓一檔沒人交易的 ETF
        在折溢價榜上顯示得比誰都健康。折溢價無從談起就不要寫。
        """
        from alpha_track.sources.twse import parse_twse_mis_etf
        rows = parse_twse_mis_etf(load_fixture("twse_mis_all_etf.json"))
        assert "00409A" not in {r.code for r in rows}

    def test_empty_payload_returns_empty_not_error(self):
        from alpha_track.sources.twse import parse_twse_mis_etf
        assert parse_twse_mis_etf({}) == []
        assert parse_twse_mis_etf({"a1": []}) == []
