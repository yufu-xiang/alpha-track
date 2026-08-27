"""整合測試。規格 §9.3:以 fixture 執行完整 pipeline,驗證 DB 內容與匯出的 JSON。

## 為什麼需要這一層

計算層的覆蓋率是 100%,但編排層(cli.py)只有 59% —— 而**已經發生過的
缺陷有三個就出在編排層**,且三個都不會讓任何單元測試變紅:

  - run_export 重建 EtfProfile 時漏掉 issuer / tracking_index,
    354 檔的發行商全部變成 None。資料抓到了、存了、也讀了,就是沒傳。
  - load_settings 的相對路徑相對於 CWD,從別的目錄執行會開一個空的新資料庫,
    exit 0、輸出寫到錯的地方、正式資料夾一個字沒動。
  - D1 的起訖在某些情況下撞在同一天,339 / 353 檔的當日報酬變成假的 0。

這三個的共同點是:**每個零件都對,接起來不對**。單元測試看不到接縫。

## 這裡用的是真實 payload

不是手工組的物件,而是 fixtures/ 底下實際存下來的 API 回應 ——
TWSE 每日行情、TPEx 每日行情、ETF 靜態清單、MIS 淨值快照、
Yahoo 的 0050 完整歷史、證交所除權息表。

斷言則同時落在**兩端**:資料庫寫進去什麼,以及匯出的 JSON 長什麼樣。
只驗其中一端的話,中間那段轉換出錯不會被發現 —— 而那正是上面三個缺陷
發生的地方。
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from alpha_track.cli import Settings, run_update
from alpha_track.storage import Database

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _subset(payload: list, key: str, codes: set[str]) -> list:
    """自真實 payload 取出指定代號的列,其餘結構原封不動。

    保留的是**真實的欄位與值**,只是少了幾百列 —— 與手工組物件不同,
    欄位名打錯、型別變了、無成交的標記換了,這裡一樣會炸。
    """
    return [row for row in payload if str(row.get(key, "")).strip() in codes]


@pytest.fixture(scope="module")
def pipeline(tmp_path_factory):
    """跑一次完整的 update,回傳 (資料庫路徑, 輸出目錄)。

    **module 範圍**:這一輪要處理三百多檔、回補 0050 的三千筆歷史,
    每個測試各跑一次的話整份會跑到逾時。所有斷言都是唯讀的,共用安全。
    """
    tmp_path = tmp_path_factory.mktemp("pipeline")
    from alpha_track.sources.tpex import parse_tpex_daily, parse_tpex_profiles
    from alpha_track.sources.twse import (
        parse_twse_daily, parse_twse_etf_list, parse_twse_mis_etf,
        parse_twse_profiles,
    )
    from alpha_track.sources.yahoo import parse_yahoo_chart

    today = date(2026, 8, 21)
    # 取子集而非整份 payload。整合測試的價值在**接縫**,不在規模:
    # 整份 1360 筆跑完一輪要 176 秒,而規模本身已由解析層的測試覆蓋。
    # 子集刻意保留普通股(2330 等),「只寫入 ETF」那條斷言才有意義。
    twse_payload = _subset(load("twse_stock_day_all.json"), "Code",
                           {"0050", "0056", "006208", "0053", "2330", "2317"})
    tpex_payload = _subset(load("tpex_mainboard_quotes.json"),
                           "SecuritiesCompanyCode", {"00679B", "00687B", "6488"})

    def fetch_all(_settings):
        prices = (parse_twse_daily(twse_payload, today)
                  + parse_tpex_daily(tpex_payload, today))
        profiles = (parse_twse_profiles(twse_payload, exchange="TWSE")
                    + parse_tpex_profiles(tpex_payload)
                    + parse_twse_etf_list(load("twse_etf_list.json")))
        navs = parse_twse_mis_etf(load("twse_mis_all_etf.json"))
        return prices, profiles, navs, []

    yahoo = load("yahoo_0050_full_daily_period1_period2.json")

    def fetch_history(code: str, exchange: str):
        return parse_yahoo_chart(yahoo, code) if code == "0050" else []

    db_path = tmp_path / "t.db"
    out = tmp_path / "out"
    _RUNNERS[db_path] = lambda: run_update(
        Settings(db_path=str(db_path), output_dir=str(out)),
        fetch_all=fetch_all, fetch_history=fetch_history,
        fetch_benchmark=None, fetch_dividends=None,
        fetch_ex_rights=None, fetch_holdings=None,
    )
    _RUNNERS[db_path]()
    return db_path, out


_RUNNERS: dict = {}
"""記住每個 pipeline 的跑法,讓冪等性測試能重放**完全相同**的輸入。"""


def _run(db_path, _out) -> None:
    _RUNNERS[db_path]()


class TestDatabaseAfterUpdate:
    def test_only_etfs_are_stored(self, pipeline):
        """每日行情回傳的是**全市場**證券,不是只有 ETF。

        實測 TWSE 那份有 1376 筆,其中絕大多數是普通股(ledger R27)。
        沒篩掉的話排行榜會出現兩千多檔股票。
        """
        db_path, _ = pipeline
        with Database(db_path) as db:
            codes = db.all_codes()
        assert codes, "一檔都沒寫入"
        assert all(c.startswith("00") for c in codes)
        assert "2330" not in codes

    def test_prices_come_from_the_payload_date_not_today(self, pipeline):
        """日期取自 payload 的 Date 欄,不是 date.today()(ledger R19)。

        用 today 的話,週末或補跑會把前一個交易日的價格標上今天的日期。

        這裡看的是**沒有回補歷史**的那一檔:0050 的 Yahoo 歷史到 08-21,
        會蓋掉這個訊號,拿它來驗等於什麼都沒驗。
        """
        db_path, _ = pipeline
        # 傳進 fetch_all 的 today 是 08-21,payload 的 Date 是 1150820
        with Database(db_path) as db:
            dates = {p.date for p in db.get_prices("0056")}
        assert dates == {date(2026, 8, 20)}

    def test_both_exchanges_are_present(self, pipeline):
        """上櫃 117 檔全是債券型,漏掉的話整個債券分類會是空的(R20)。"""
        db_path, _ = pipeline
        with Database(db_path) as db:
            exchanges = {p.exchange for p in db.get_profiles().values()}
        assert exchanges == {"TWSE", "TPEX"}

    def test_navs_are_stored_so_premium_is_computable(self, pipeline):
        db_path, _ = pipeline
        with Database(db_path) as db:
            navs = db.get_navs("0050")
        assert navs and navs[-1].premium_discount is not None


class TestExportedJson:
    def test_writes_all_three_kinds_of_file(self, pipeline):
        _, out = pipeline
        assert (out / "meta.json").exists()
        assert (out / "rankings.json").exists()
        assert (out / "etf" / "0050.json").exists()

    def test_issuer_and_index_survive_the_round_trip(self, pipeline):
        """抓到 → 存進 DB → 讀出來 → 重建 EtfProfile → 匯出。

        這條線斷過:重建時漏掉兩個欄位,354 檔的發行商全部變成 None,
        而畫面上只是兩個沒有理由的破折號 —— 與「資料源沒有這欄」
        完全無法區分。
        """
        _, out = pipeline
        detail = json.loads((out / "etf" / "0050.json").read_text("utf-8"))
        assert detail["issuer"], "發行商在轉換過程中掉了"
        assert detail["tracking_index"], "追蹤指數在轉換過程中掉了"

    def test_day_return_is_null_not_zero_for_a_single_day_of_data(self, pipeline):
        """只有一天價格時,「當日」算不出來 —— 必須是 null。

        0 的意思是「沒漲沒跌」。實測曾有 339 / 353 檔因為起訖撞在同一天
        而顯示 0.00%,整欄失去意義卻看不出異常。
        """
        _, out = pipeline
        rankings = json.loads((out / "rankings.json").read_text("utf-8"))
        # 0050 有 Yahoo 的完整歷史,算得出來;其餘只有當日一筆,必須是 null
        others = [e for e in rankings["etfs"] if e["code"] != "0050"]
        assert others
        assert all(e["returns"]["D1"] is None for e in others)

    def test_the_backfilled_code_gets_real_multi_period_returns(self, pipeline):
        """回補過的代號要真的算得出長期報酬,不能只是欄位存在。"""
        _, out = pipeline
        rankings = json.loads((out / "rankings.json").read_text("utf-8"))
        row = next(e for e in rankings["etfs"] if e["code"] == "0050")
        assert row["returns"]["Y1"] is not None
        assert row["risk"]["volatility"] is not None
        assert row["risk"]["mdd"] is not None

    def test_meta_reports_health_honestly(self, pipeline):
        _, out = pipeline
        meta = json.loads((out / "meta.json").read_text("utf-8"))
        assert meta["is_stale"] is False
        # 子集裡的 ETF 數;普通股不該計入
        assert meta["etf_count"] == 6
        assert isinstance(meta["unclassified"], list)

    def test_rankings_and_detail_agree_on_the_same_numbers(self, pipeline):
        """同一個數字在兩份檔案裡必須一致。

        個股頁的指標是另外組裝的 —— 兩邊各算一次的話,某一天會分岔,
        而使用者看到的是「排行榜說 18%、點進去說 17%」。
        """
        _, out = pipeline
        rankings = json.loads((out / "rankings.json").read_text("utf-8"))
        row = next(e for e in rankings["etfs"] if e["code"] == "0050")
        detail = json.loads((out / "etf" / "0050.json").read_text("utf-8"))
        for period in ("Y1", "Y3", "INCEPTION"):
            assert row["returns"][period] == detail["returns"][period]
        assert row["risk"] == detail["risk"]
        assert row["premium_discount"] == detail["premium_discount"]

    def test_every_row_carries_the_full_period_key_set(self, pipeline):
        """後端保證送出全部十一個鍵,前端才能直接索引而不必先檢查。"""
        from alpha_track.models import Period

        _, out = pipeline
        rankings = json.loads((out / "rankings.json").read_text("utf-8"))
        expected = {p.value for p in Period}
        for row in rankings["etfs"]:
            assert set(row["returns"]) == expected
            assert set(row["annualized"]) == expected


def test_running_twice_is_idempotent(pipeline):
    """同一天重跑不該產生第二筆價格,也不該改變匯出的數字。

    排程重試、手動補跑都會發生,而重複寫入會讓報酬憑空多出一天。
    """
    db_path, out = pipeline
    before = (out / "rankings.json").read_text("utf-8")
    with Database(db_path) as db:
        rows_before = len(db.get_prices("0050"))

    # 再跑一次**完全相同**的輸入。換一組輸入的話測的就不是冪等性了。
    _run(db_path, out)
    with Database(db_path) as db:
        assert len(db.get_prices("0050")) == rows_before
    assert (out / "rankings.json").read_text("utf-8") == before


class TestFetcherWiring:
    """抓取函式與解析器之間的**接線**。

    規格 §9.5 說不對真實 API 寫自動化測試 —— 那指的是不要真的連網,
    不是不要驗接線。這一類缺陷已經發生過:parse_twse_nav 寫好了、
    測試也過了,但 fetch_all_sources **從來沒有呼叫它**,於是 navs 表
    永遠是空的、折溢價永遠是 null,而任何解析層的測試都不會紅。

    這裡把 HTTP 換成回傳真實 fixture 的替身,驗的是「有沒有接上」
    與「接到哪個網址」,不是解析本身。
    """

    def test_daily_fetch_wires_all_four_sources(self, monkeypatch):
        from alpha_track import cli
        from alpha_track.sources import base

        seen: list[str] = []
        payloads = {
            cli.TWSE_DAILY_URL: load("twse_stock_day_all.json"),
            cli.TPEX_DAILY_URL: load("tpex_mainboard_quotes.json"),
            cli.TWSE_ETF_LIST_URL: load("twse_etf_list.json"),
            cli.TWSE_MIS_ETF_URL: load("twse_mis_all_etf.json"),
        }

        def fake(url, **_kw):
            seen.append(url)
            return payloads[url]

        monkeypatch.setattr(base, "fetch_json", fake)
        prices, profiles, navs, _dividends = cli.fetch_all_sources(
            cli.Settings())

        assert set(seen) == set(payloads), "有來源沒被呼叫"
        assert prices and profiles
        # 淨值是最容易被漏接的那一個 —— 它有自己的解析器與資料表,
        # 漏接時整條鏈路都不會報錯,只有畫面上多一欄破折號。
        assert navs, "MIS 淨值沒有接上"
        assert any(n.premium_discount is not None for n in navs)

    def test_a_failing_source_does_not_take_down_the_others(self, monkeypatch):
        """規格 §8.1:單一來源失敗不得中斷其餘來源。"""
        from alpha_track import cli
        from alpha_track.sources import base

        def fake(url, **_kw):
            if url == cli.TPEX_DAILY_URL:
                raise RuntimeError("上櫃掛了")
            return {
                cli.TWSE_DAILY_URL: load("twse_stock_day_all.json"),
                cli.TWSE_ETF_LIST_URL: load("twse_etf_list.json"),
                cli.TWSE_MIS_ETF_URL: load("twse_mis_all_etf.json"),
            }[url]

        monkeypatch.setattr(base, "fetch_json", fake)
        prices, profiles, navs, _ = cli.fetch_all_sources(cli.Settings())
        assert prices and profiles and navs

    def test_ex_rights_fetch_builds_the_right_date_range(self, monkeypatch):
        from alpha_track import cli
        from alpha_track.sources import base

        seen: list[str] = []

        def fake(url, **_kw):
            seen.append(url)
            return load("twse_ex_rights_2024.json")

        monkeypatch.setattr(base, "fetch_json", fake)
        rows = cli.fetch_twse_ex_rights(date(2024, 1, 1), date(2024, 12, 31))
        assert "startDate=20240101" in seen[0]
        assert "endDate=20241231" in seen[0]
        # 這個來源存在的理由是除權息前收盤價,不是息值
        assert any(r.prev_close for r in rows)

    def test_holdings_fetch_queries_every_etf_class(self, monkeypatch):
        """漏掉某個類型的話,那一整類 ETF 的成分股會永遠是空的。"""
        from alpha_track import cli
        from alpha_track.sources import base, sitca

        asked: list[str] = []

        class FakeSession:
            def __init__(self, url, **_kw):
                self.url = url

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return None

            def tokens(self):
                return {"__VIEWSTATE": "x"}

            def query(self, data):
                asked.append(data["ctl00$ContentPlaceHolder1$ddlQ_Class"])
                return (FIXTURES / "sitca_holdings_A0005_AH11_202607.html"
                        ).read_text(encoding="utf-8")

        monkeypatch.setattr(base, "FormSession", FakeSession)
        rows = cli.fetch_sitca_holdings("202607")
        assert asked == list(sitca.ETF_CLASSES)
        assert rows
