"""資料源勘查腳本。實際呼叫各免費 API,記錄真實回應結構。

用途:產出 docs/data-sources.md 的事實依據。不進入正式 pipeline。
執行:python scripts/survey_sources.py
"""
import json
import sys
import time
from pathlib import Path

import httpx

FIXTURES = Path(__file__).parent.parent / "pipeline" / "tests" / "fixtures"
FIXTURES.mkdir(parents=True, exist_ok=True)

# 候選端點。這份清單是「待驗證的假設」,不是已知事實。
# 執行後把實際可用的記錄到 docs/data-sources.md,失敗的也要記錄。
CANDIDATES = [
    ("twse_stock_day_all", "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
    ("twse_etf_report", "https://openapi.twse.com.tw/v1/ETFReport/ETFRank"),
    ("twse_openapi_index", "https://openapi.twse.com.tw/v1/swagger.json"),
    ("tpex_openapi_index", "https://www.tpex.org.tw/openapi/swagger.json"),
    # --- Step 3: 依 swagger 索引擴充(路徑均取自實際 swagger.json 內容,非猜測)---
    ("twse_mi_index", "https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX"),
    ("twse_taiex_total_return", "https://openapi.twse.com.tw/v1/indicesReport/MFI94U"),
    ("tpex_mainboard_quotes", "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"),
    (
        "tpex_mainboard_daily_close_quotes",
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
    ),
    ("tpex_reward_index", "https://www.tpex.org.tw/openapi/v1/tpex_reward_index"),
    # 排除項:曾在 TPEx swagger 索引看到有 PreNAV/EstimatedNAV 欄位、疑似可作為 ETF
    # 淨值來源的端點,實測後為「上櫃受益憑證」(如富邦FB),非一般 ETF,且資料品質不可靠
    # (EstimatedNAV 曾回傳 URL 字串而非數字)。保留在 CANDIDATES 供他人重現此排除理由。
    ("tpex_opfund_latest", "https://www.tpex.org.tw/openapi/v1/tpex_opfund_latest"),
    # 排除項:嘗試尋找投信投顧公會(SITCA)ETF 淨值查詢頁面的猜測路徑,回應是自訂
    # 404 頁(HTTP 200,text/html)。保留在 CANDIDATES 供他人重現/接續搜尋正確路徑。
    ("sitca_in2328_probe", "https://www.sitca.org.tw/ROC/Industry/IN2328.aspx"),
    # --- 額外發現:TWSE 靜態 ETF 清單(非 openapi,rwd 舊站,經瀏覽器 Network 追蹤而非猜測)---
    ("twse_etf_list", "https://www.twse.com.tw/rwd/zh/ETF/list"),
    # --- TWSE 舊站「報酬指數」歷史查詢端點:接受 date 參數,一次回傳「當月」資料。
    # openapi 版本(indicesReport/MFI94U,見上)不支援日期參數,只回傳當月至今資料。
    (
        "twse_taiex_total_return_legacy_2020",
        "https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date=20200102&response=json",
    ),
    (
        "twse_taiex_total_return_legacy_earliest",
        "https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date=20030101&response=json",
    ),
    (
        "twse_taiex_total_return_legacy_out_of_range",
        "https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date=20021201&response=json",
    ),
    # --- Step 4: Yahoo / FinMind ---
    # 注意:brief 原始 URL(range=max&interval=1d)在 0050 這類長歷史標的上會被 Yahoo
    # 自動降頻為月線(dataGranularity=1mo)。要拿到真正逐日資料,需改用 period1/period2
    # (unix timestamp)明確指定區間,interval=1d 才會生效。以下記錄兩種呼叫方式的實測差異。
    (
        "yahoo_0050_range_max_interval_1d",
        "https://query1.finance.yahoo.com/v8/finance/chart/0050.TW"
        "?range=max&interval=1d&events=div",
    ),
    (
        "yahoo_0050_full_daily_period1_period2",
        "https://query1.finance.yahoo.com/v8/finance/chart/0050.TW"
        "?period1=0&period2=9999999999&interval=1d&events=div",
    ),
    (
        "finmind_dividend",
        "https://api.finmindtrade.com/api/v4/data"
        "?dataset=TaiwanStockDividend&data_id=0050&start_date=2015-01-01",
    ),
    # 免費額度確認:0050 上市首年(2003)日收盤價,免費層可得(TaiwanStockPrice)
    (
        "finmind_price_0050_2003",
        "https://api.finmindtrade.com/api/v4/data"
        "?dataset=TaiwanStockPrice&data_id=0050&start_date=2003-01-01&end_date=2003-12-31",
    ),
    # 免費額度確認:還原股價 dataset 需付費層級,免費層回 400(記錄失敗回應本身)
    (
        "finmind_price_adj_free_tier_check",
        "https://api.finmindtrade.com/api/v4/data"
        "?dataset=TaiwanStockPriceAdj&data_id=0050&start_date=2003-01-01",
    ),
    # 代號後綴規則驗證:00679B 為上櫃(TPEx)債券 ETF(見 tpex_mainboard_quotes 樣本),
    # 用 .TWO 才查得到;.TW 對這檔會回 404(symbol may be delisted)。
    (
        "yahoo_00679B_two_suffix_check",
        "https://query1.finance.yahoo.com/v8/finance/chart/00679B.TWO?range=5d&interval=1d",
    ),
]


def probe(name: str, url: str) -> dict:
    """對單一端點發出請求,回傳勘查結果摘要。"""
    result = {"name": name, "url": url}
    try:
        resp = httpx.get(
            url,
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (alpha-track survey script)"},
        )
        result["status"] = resp.status_code
        result["content_type"] = resp.headers.get("content-type", "")
        result["bytes"] = len(resp.content)
        if resp.status_code != 200:
            result["error"] = f"HTTP {resp.status_code}"
            result["body_snippet"] = resp.text[:500]
            # 錯誤回應本身也是勘查結果(例如免費額度限制),同樣存檔備查
            if resp.content:
                (FIXTURES / f"{name}.json").write_bytes(resp.content[: 5 * 1024 * 1024])
            return result
        content_to_save = resp.content
        if len(content_to_save) > 5 * 1024 * 1024:
            content_to_save = content_to_save[: 5 * 1024 * 1024]
            result["truncated"] = True
        (FIXTURES / f"{name}.json").write_bytes(content_to_save)
        data = resp.json()
        if isinstance(data, list):
            result["shape"] = f"list[{len(data)}]"
            result["sample_keys"] = sorted(data[0].keys()) if data else []
            result["samples"] = data[:2]
        elif isinstance(data, dict):
            result["shape"] = "dict"
            result["sample_keys"] = sorted(data.keys())
            result["samples"] = data
    except Exception as exc:  # 勘查腳本刻意寬鬆:失敗本身就是要記錄的結果
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def main() -> int:
    for name, url in CANDIDATES:
        r = probe(name, url)
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
        print("-" * 70)
        time.sleep(1.5)  # 禮貌性間隔,避免連續猛打
    return 0


if __name__ == "__main__":
    sys.exit(main())
