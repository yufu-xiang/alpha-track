"""Pipeline 進入點。

指令:
  python -m alpha_track.cli update    # 抓取 → 驗證 → 儲存 → 回補 → 計算 → 匯出
  python -m alpha_track.cli export    # 只重新計算並匯出(不連網)
  python -m alpha_track.cli backfill  # 只補歷史與大盤基準

抓取一律以參數注入(fetch_all / fetch_history / fetch_benchmark),
流程才能在不連網的情況下測試。預設值是真的會連網的那些函式。
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import yaml

from .categories import UNCLASSIFIED, classify, is_etf_code, load_category_map
from .compute import compute_etf_metrics
from .export import (build_benchmark_series, build_detail, build_meta,
                     build_rankings, write_json)
from .models import DividendRecord, EtfProfile, NavRecord, PriceRecord
from .storage import Database
from .validation import validate_price_batch

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]

BENCHMARK_NAME = "TAIEX_TR"
"""加權報酬指數。供 Beta 與超額報酬使用(規格 §4.4)。"""

MIN_HISTORY_ROWS = 60
"""價格列數少於此值即視為缺歷史,觸發向 Yahoo 回補。
與 compute.MIN_DAYS_FOR_RISK 一致:低於這個量,風險指標一律算不出來。"""

BENCHMARK_EARLIEST = date(2003, 1, 1)
"""基準回補的最早月份。

TWSE 舊站的加權報酬指數最早只到民國 92 年 1 月;更早的月份回應是
HTTP 200 帶 `stat` 錯誤訊息(見 docs/data-sources.md)。

為什麼要回補到 2003 而不只是十年:規格 §7.3 要求蒙地卡羅模擬以**長期
歷史**做 bootstrap,並在資料不足 10 年時顯著警告 —— 只回補十年會讓那個
警告永遠處在邊界上,而長期退休推論最需要的正是涵蓋多次多空循環的樣本。
2003 起算涵蓋 2008 金融海嘯與 2020 疫情崩盤,那才是有意義的壓力樣本。
"""

# 端點來自 docs/data-sources.md 的實測記錄,非憑記憶編寫。
TWSE_DAILY_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TWSE_ETF_LIST_URL = "https://www.twse.com.tw/rwd/zh/ETF/list"
TPEX_DAILY_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
FINMIND_DIVIDEND_URL = (
    "https://api.finmindtrade.com/api/v4/data"
    "?dataset=TaiwanStockDividend&data_id={code}&start_date=2015-01-01"
)
# 必須用 period1/period2,不可用 range=max —— 後者會被靜默降頻成月線
# (docs/data-sources.md 的「關鍵陷阱」)。
YAHOO_CHART_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    "?period1=0&period2=9999999999&interval=1d&events=div"
)
TAIEX_TR_MONTHLY_URL = (
    "https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date={date}&response=json"
)

# 上市 .TW、上櫃 .TWO。後綴用錯會乾淨地回 HTTP 404
# (docs/data-sources.md 第 8 點)。
YAHOO_SUFFIX = {"TWSE": ".TW", "TPEX": ".TWO"}

DIVIDEND_REQUEST_INTERVAL = 0.5
"""逐檔抓配息的請求間隔(秒)。理由同 YAHOO_REQUEST_INTERVAL。"""

BENCHMARK_REQUEST_INTERVAL = 1.0
"""逐月回補基準的請求間隔(秒)。勘查實測未遇限流,但十年是 120 次呼叫,
不加間隔就是在測試對方的耐性。"""

DIVIDEND_FETCH_LIMIT = 40
"""每次執行最多抓幾檔配息。

FinMind 是**逐檔**端點,首次執行有三百多檔要抓 —— 一次抓完是對免費 API
連發。配息一年才變幾次、不急,分幾天攤開反而更穩。
"""

DIVIDEND_MAX_AGE_DAYS = 30
"""配息資料的重抓週期。抓過就先擱著,但不能抓一次就永遠不再更新。"""

YAHOO_REQUEST_INTERVAL = 0.5
"""逐檔回補歷史的請求間隔(秒)。

首次執行要補三百多個代號。Yahoo 是非官方來源,docs/data-sources.md 明載
「未刻意壓測速率上限」「大量標的批次回補時仍應加入間隔,避免被暫時封鎖」。
連發被擋的失敗形式特別難察覺:不是整批失敗,而是後半段代號悄悄補不到,
資料看起來有、只是少了一截,而每一檔都有 try 保護不會中斷整批。"""


@dataclass
class Settings:
    risk_free_rate: float = 0.015
    output_dir: str = "web/public/data"
    db_path: str = "data/alpha_track.db"
    stale_warning_days: int = 3


def _resolve(path_str: str) -> str:
    """把設定檔中的相對路徑釘在專案根目錄,而不是當前工作目錄。

    否則從 pipeline/ 執行 export 會開啟 pipeline/data/alpha_track.db ——
    那個檔案不存在,SQLite 會**安靜地建一個空的**,於是指令以 exit 0 結束、
    輸出一份「資料庫為空」的 meta.json 到 pipeline/web/public/data/,
    真正的資料夾則完全沒被更新。整個過程沒有任何錯誤訊息。
    """
    p = Path(path_str)
    return str(p if p.is_absolute() else ROOT / p)


def load_settings(path: Path) -> Settings:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return Settings(
        risk_free_rate=raw.get("risk_free_rate", 0.015),
        output_dir=_resolve(raw.get("output_dir", "web/public/data")),
        db_path=_resolve(raw.get("db_path", "data/alpha_track.db")),
        stale_warning_days=raw.get("stale_warning_days", 3),
    )


def run_export(
    settings: Settings,
    *,
    is_stale: bool,
    anomalies: list[tuple[str, str]],
) -> None:
    """自資料庫計算指標並匯出 JSON。不連網,可獨立重跑。

    未分類清單由本函式自行統計,不由呼叫端傳入:它本來就對每一檔呼叫
    classify(),而由呼叫端傳的話,export 與 backfill 這兩個指令都會誠實地
    回報「零檔未分類」—— 畫面上整片都是「未分類」,狀態列卻寫「全部正常」。
    自己算也比只看當日批次更完整。
    """
    out_dir = Path(settings.output_dir)
    category_map = load_category_map(ROOT / "config" / "etf_categories.yaml")

    with Database(Path(settings.db_path)) as db:
        db.init_schema()
        base_date = db.latest_price_date()
        if base_date is None:
            write_json(out_dir / "meta.json", build_meta(
                data_date=date.today(), etf_count=0, unclassified=[],
                anomalies=[("*", "資料庫為空,尚未取得任何價格資料")],
                is_stale=True, risk_free_rate=settings.risk_free_rate,
            ))
            return

        stored = db.get_profiles()
        bench_closes = db.get_benchmark(BENCHMARK_NAME)
        rows = []
        unclassified: list[str] = []
        for code in db.all_codes():
            prices = db.get_prices(code)
            if not prices:
                continue
            cls = classify(code, category_map)
            if cls.category == UNCLASSIFIED:
                unclassified.append(code)
            base = stored.get(code)
            profile = EtfProfile(
                code=code,
                # 名稱來自資料庫(由每日行情的 Name / CompanyName 欄位寫入)。
                # 尚未寫入時退回代號,使排行榜至少不是空白。
                name=base.name if base else code,
                # 掛牌日取自官方 ETF 清單。**不用「最早有資料的日期」當代理值**:
                # 那會讓「成立以來」永遠看起來資料齊全,正是 R14 要防的錯誤。
                # 不知道就是 None,compute 會據此照常計算 INCEPTION。
                listing_date=base.listing_date if base else None,
                exchange=base.exchange if base else "TWSE",
                category=cls.category, region=cls.region,
                is_leveraged=cls.is_leveraged, is_inverse=cls.is_inverse,
            )
            dividends = db.get_dividends(code)
            metrics = compute_etf_metrics(
                prices, base_date,
                risk_free=settings.risk_free_rate,
                bench_closes=bench_closes, navs=db.get_navs(code),
                listing_date=profile.listing_date,
                dividends=dividends,
            )
            rows.append((profile, metrics, prices[-1].close))

            # 個股頁的資料(規格 §5.2 ②、§5.3 的 lazy load 分層)。
            # 一檔一個檔案:全部價格序列合計約 12 MB,不能塞進 rankings.json。
            write_json(out_dir / "etf" / f"{code}.json",
                       build_detail(profile, metrics, prices, dividends))

        # 基準線 351 檔共用,單獨匯出一次
        write_json(out_dir / "benchmark.json", build_benchmark_series(bench_closes))
        write_json(out_dir / "rankings.json", build_rankings(base_date, rows))
        write_json(out_dir / "meta.json", build_meta(
            data_date=base_date, etf_count=len(rows),
            unclassified=sorted(unclassified), anomalies=anomalies,
            is_stale=is_stale, risk_free_rate=settings.risk_free_rate,
            benchmark_return_1y=_benchmark_year_return(bench_closes, base_date),
        ))


def _benchmark_year_return(
    bench_closes: dict[date, float], base_date: date
) -> float | None:
    """大盤近一年漲幅,供前端當作整張表的判讀基準。

    起點取「一年前當日或之前最近的一筆」—— 一年前那天不一定是交易日。
    """
    if not bench_closes:
        return None
    end_key = max((d for d in bench_closes if d <= base_date), default=None)
    if end_key is None:
        return None
    target = end_key - timedelta(days=365)
    start_key = max((d for d in bench_closes if d <= target), default=None)
    if start_key is None or bench_closes[start_key] <= 0:
        return None
    return bench_closes[end_key] / bench_closes[start_key] - 1.0


FetchAll = Callable[
    [Settings],
    tuple[list[PriceRecord], list[EtfProfile], list[NavRecord], list[DividendRecord]],
]
FetchHistory = Callable[[str, str], list[PriceRecord]]
FetchBenchmark = Callable[[date, date], list[tuple[date, float]]]
FetchDividends = Callable[[str], list[DividendRecord]]


def fetch_all_sources(settings: Settings) -> tuple[
    list[PriceRecord], list[EtfProfile], list[NavRecord], list[DividendRecord]
]:
    """自各來源取得當日資料。端點 URL 依 docs/data-sources.md。

    每個來源獨立 try:單一來源失敗不得中斷其餘來源(規格 §8.1)。
    """
    from .sources.base import fetch_json
    from .sources.tpex import parse_tpex_daily, parse_tpex_profiles
    from .sources.twse import parse_twse_daily, parse_twse_etf_list, parse_twse_profiles

    today = date.today()
    prices: list[PriceRecord] = []
    profiles: list[EtfProfile] = []
    navs: list[NavRecord] = []
    dividends: list[DividendRecord] = []

    # 每日行情同時供應價格與名稱,解析兩次,共用同一份回應。
    # trade_date 只是退路:parse_* 會優先採用 payload 自帶的日期(R19)。
    for label, url, parse_prices, parse_profiles in (
        ("TWSE 每日行情", TWSE_DAILY_URL,
         lambda d: parse_twse_daily(d, today),
         lambda d: parse_twse_profiles(d, exchange="TWSE")),
        ("TPEx 每日行情", TPEX_DAILY_URL,
         lambda d: parse_tpex_daily(d, today),
         parse_tpex_profiles),
    ):
        try:
            payload = fetch_json(url)
            prices.extend(parse_prices(payload))
            profiles.extend(parse_profiles(payload))
        except Exception as exc:
            logger.warning("%s 取得失敗:%s", label, exc)

    # 靜態清單是**唯一**的真實掛牌日來源。每日行情不提供,
    # 缺了它「成立以來」的正確性就無從判斷(R14)。
    try:
        profiles.extend(parse_twse_etf_list(fetch_json(TWSE_ETF_LIST_URL)))
    except Exception as exc:
        logger.warning("TWSE ETF 靜態清單取得失敗:%s", exc)

    # 淨值:Task 1 確認沒有任何官方免費的集中式來源,階段 1 不抓(R12)。
    # navs 保持空清單,折溢價輸出 null。找到來源後在此加回一組。

    return prices, profiles, navs, dividends


def fetch_yahoo_history(code: str, exchange: str) -> list[PriceRecord]:
    """向 Yahoo 取單一代號的完整還原股價歷史。

    後綴依 exchange 決定,不盲試兩個 —— 盲試會讓每一檔上櫃 ETF
    都先吃一次 404,117 檔就是 117 次無謂的往返。
    """
    from .sources.base import fetch_json
    from .sources.yahoo import parse_yahoo_chart

    suffix = YAHOO_SUFFIX.get(exchange)
    if suffix is None:
        logger.warning("%s 的掛牌市場未知(%r),無法決定 Yahoo 後綴", code, exchange)
        return []
    payload = fetch_json(YAHOO_CHART_URL.format(symbol=f"{code}{suffix}"))
    return parse_yahoo_chart(payload, code)


def fetch_taiex_tr_history(start: date, end: date) -> list[tuple[date, float]]:
    """自 TWSE 舊站逐月取得加權報酬指數。

    OpenAPI 版的報酬指數只有近期滾動視窗,無法回補歷史;舊站端點一次給一個月,
    十年約需 120 次呼叫。間隔 ≥1 秒,一次補完之後即為增量。

    最早只到民國 92 年 1 月;更早的月份回應是 HTTP 200 帶 stat 錯誤訊息,
    由 parse_twse_total_return_legacy 拋出,在此當成該月無資料略過。
    """
    from .sources.base import fetch_json
    from .sources.twse import parse_twse_total_return_legacy

    rows: list[tuple[date, float]] = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        try:
            payload = fetch_json(TAIEX_TR_MONTHLY_URL.format(
                date=cursor.strftime("%Y%m%d")))
            rows.extend(parse_twse_total_return_legacy(payload))
        except Exception as exc:
            logger.warning("報酬指數 %s 取得失敗:%s", cursor.strftime("%Y-%m"), exc)
        time.sleep(BENCHMARK_REQUEST_INTERVAL)
        cursor = (cursor + timedelta(days=32)).replace(day=1)
    return rows


def fetch_finmind_dividends(code: str) -> list[DividendRecord]:
    """向 FinMind 取單一代號的配息紀錄。

    這是**逐檔**端點,沒有全市場版本 —— 也因此不適合每天全抓,
    由 run_backfill 依 DIVIDEND_MAX_AGE_DAYS 分批更新。
    """
    from .sources.base import fetch_json
    from .sources.finmind import parse_finmind_dividends

    return parse_finmind_dividends(fetch_json(FINMIND_DIVIDEND_URL.format(code=code)))


def run_backfill(
    settings: Settings,
    *,
    fetch_history: FetchHistory = fetch_yahoo_history,
    fetch_benchmark: FetchBenchmark | None = fetch_taiex_tr_history,
    fetch_dividends: FetchDividends | None = fetch_finmind_dividends,
) -> None:
    """為缺歷史的代號回補完整還原股價,並補齊大盤報酬指數。

    每個代號獨立 try:單一代號失敗不得中斷整批(規格 §8.1)。
    """
    with Database(Path(settings.db_path)) as db:
        db.init_schema()
        profiles = db.get_profiles()
        targets = db.codes_without_history(MIN_HISTORY_ROWS)
        for i, code in enumerate(targets):
            # 逐檔之間留間隔。第一檔不必等 —— 每日執行時通常沒有代號
            # 需要回補,不該白白多花半秒。
            if i > 0:
                time.sleep(YAHOO_REQUEST_INTERVAL)
            profile = profiles.get(code)
            exchange = profile.exchange if profile else "TWSE"
            try:
                rows = fetch_history(code, exchange)
            except Exception as exc:
                logger.warning("%s 回補失敗:%s", code, exc)
                continue
            if rows:
                db.upsert_prices(rows)
                logger.info("%s 回補 %d 筆", code, len(rows))

        # 配息:除息日豁免的資料來源(驗證閘門用),也是個股頁的配息紀錄。
        # 成功才記錄抓取時間 —— 失敗的下次會再試,不會被誤認為「已抓過」。
        if fetch_dividends is not None:
            targets = db.codes_needing_dividends(DIVIDEND_MAX_AGE_DAYS)
            for i, code in enumerate(targets[:DIVIDEND_FETCH_LIMIT]):
                if i > 0:
                    time.sleep(DIVIDEND_REQUEST_INTERVAL)
                try:
                    rows = fetch_dividends(code)
                except Exception as exc:
                    logger.warning("%s 配息取得失敗:%s", code, exc)
                    continue
                db.upsert_dividends(rows)
                db.record_dividend_fetch(code, date.today())
                if rows:
                    logger.info("%s 配息 %d 筆", code, len(rows))

        # 大盤報酬指數:Beta 與超額報酬的基準。缺了不影響其他指標。
        #
        # 起點自資料庫既有的最後一筆之後續抓,不是每次都回頭補十年:
        # 十年是 120 次逐月呼叫,天天重來是在測試對方的耐性。但也不能
        # 補完就不再抓 —— 那樣基準會停在回補當天,之後的交易日永遠補不進來,
        # Beta 的樣本就再也不會前進。
        if fetch_benchmark is not None:
            stored = db.get_benchmark(BENCHMARK_NAME)
            today = date.today()
            start = max(stored) + timedelta(days=1) if stored else BENCHMARK_EARLIEST
            if start <= today:
                try:
                    bench = fetch_benchmark(start, today)
                    db.upsert_benchmark(BENCHMARK_NAME, bench)
                    logger.info("報酬指數自 %s 起補入 %d 筆", start, len(bench))
                except Exception as exc:
                    logger.warning("報酬指數回補失敗:%s", exc)


def run_update(
    settings: Settings,
    *,
    fetch_all: FetchAll = fetch_all_sources,
    fetch_history: FetchHistory = fetch_yahoo_history,
    fetch_benchmark: FetchBenchmark | None = fetch_taiex_tr_history,
    fetch_dividends: FetchDividends | None = fetch_finmind_dividends,
) -> None:
    """每日更新:抓取 → 篩出 ETF → 驗證 → 寫入 → 回補 → 計算 → 匯出。

    驗證未通過時跳過寫入,保留前一日資料並以 is_stale=True 匯出 ——
    寧可顯示昨天的正確數字,也不要顯示今天的錯誤數字。
    """
    prices, profiles, navs, dividends = fetch_all(settings)

    # 每日行情端點回傳的是**全部**上市櫃證券(實測 TWSE 1376、TPEx 1011 筆),
    # 其中 ETF 只有 233 + 117 檔。篩選放在這裡而不是 adapter 裡:
    # parse_twse_daily 的職責是「解析每日行情」,不是「決定本專案追蹤什麼」。
    prices = [p for p in prices if is_etf_code(p.code)]
    profiles = [p for p in profiles if is_etf_code(p.code)]
    navs = [n for n in navs if is_etf_code(n.code)]
    dividends = [d for d in dividends if is_etf_code(d.code)]

    db_path = Path(settings.db_path)
    with Database(db_path) as db:
        db.init_schema()
        prev_date = db.latest_price_date()
        prev_closes: dict[str, float] = {}
        if prev_date is not None:
            for code in db.all_codes():
                rows = [p for p in db.get_prices(code) if p.date == prev_date]
                if rows:
                    prev_closes[code] = rows[-1].close
        prev_count = len(prev_closes)

        ex_dates = {(d.code, d.ex_date) for d in dividends}
        result = validate_price_batch(prices, prev_count, prev_closes, ex_dates)

        if result.batch_rejected:
            logger.error("整批拒絕:%s", result.batch_reason)
            run_export(settings, is_stale=True,
                       anomalies=[("*", result.batch_reason or "驗證未通過")])
            return

        db.upsert_prices(result.accepted)
        db.upsert_profiles(profiles)
        db.upsert_navs(navs)
        db.upsert_dividends(dividends)

    # 新掛牌或首次執行的代號只有一天資料,先回補再計算,
    # 否則所有多期間報酬都會是 null(R1)。
    # 基準也在此更新 —— 排程只跑 update,不在這裡補的話 Beta 永遠是 null。
    run_backfill(settings, fetch_history=fetch_history,
                 fetch_benchmark=fetch_benchmark, fetch_dividends=fetch_dividends)

    run_export(settings, is_stale=False, anomalies=result.flagged)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="alpha-track")
    parser.add_argument("command", choices=["update", "export", "backfill"])
    parser.add_argument("--config", default=str(ROOT / "config" / "settings.yaml"))
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, stream=sys.stderr,
        format="%(levelname)s %(name)s: %(message)s",
    )
    settings = load_settings(Path(args.config))

    if args.command == "export":
        run_export(settings, is_stale=False, anomalies=[])
    elif args.command == "backfill":
        run_backfill(settings)
        run_export(settings, is_stale=False, anomalies=[])
    else:
        run_update(settings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
