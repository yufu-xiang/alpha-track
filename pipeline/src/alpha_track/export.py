"""JSON 匯出。定義前後端唯一契約。

規格 §5.3。欄位名稱與階段 1b 的 TypeScript 型別必須逐字一致;
改名是破壞性變更,兩邊須同步修改(1b 的契約測試以 Object.keys().sort()
全等斷言,多一個欄位或少一個欄位都會讓前端測試失敗)。

null 的意義固定為「資料不足」,前端據此把該列排到最末並顯示「—」。
絕不以 0 頂替。
"""
from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .compute import EtfMetrics
from .models import DividendRecord, EtfProfile, PriceRecord

TAIPEI = ZoneInfo("Asia/Taipei")


def build_rankings(
    data_date: date,
    rows: Sequence[tuple[EtfProfile, EtfMetrics, float]],
) -> dict:
    """組裝 rankings.json。rows 為 (檔案, 指標, 最新收盤價)。"""
    return {
        "data_date": data_date.isoformat(),
        "etfs": [
            {
                "code": p.code,
                "name": p.name,
                "category": p.category,
                "region": p.region,
                "is_leveraged": p.is_leveraged,
                "is_inverse": p.is_inverse,
                "close": close,
                "listing_date": p.listing_date.isoformat() if p.listing_date else None,
                # 實際持有資料的起點。與掛牌日不同時代表免費資料源涵蓋不足
                # (Yahoo 的歷史深度,或未調整分割導致舊區段被捨棄 —— ledger R24),
                # 前端據此說明,而不是讓使用者以為那一欄本來就沒有數字。
                "data_start": m.data_start.isoformat() if m.data_start else None,
                # 流動性比較要看成交**金額**不是股數:10 元與 100 元的 ETF
                # 成交同樣股數,實際換手的資金差十倍。兩者都送出,
                # 讓使用者能自己看到這個差別。
                "avg_volume": m.avg_volume,
                "avg_turnover": m.avg_turnover,
                # 近一年實配 ÷ 現價。無配息紀錄者為 None,不是 0 ——
                # 「沒有資料」與「這一年沒配」是兩件事。
                "dividend_yield": m.dividend_yield,
                # 複製而非共用:匯出後呼叫端若再動 EtfMetrics,
                # 不該連帶改到已經組好的輸出。
                "returns": dict(m.returns),
                "annualized": dict(m.annualized),
                # 相對加權報酬指數的超額報酬(規格 §4.5b)。
                # 大盤資料涵蓋不到的期間為 null,不拿別的期間頂替。
                "excess": dict(m.excess),
                "risk": {
                    "volatility": m.volatility,
                    "mdd": m.mdd,
                    "sharpe": m.sharpe,
                    "beta": m.beta,
                },
                "premium_discount": m.premium_discount,
            }
            for p, m, close in rows
        ],
    }


def build_meta(
    *,
    data_date: date,
    etf_count: int,
    unclassified: Sequence[str],
    anomalies: Sequence[tuple[str, str]],
    is_stale: bool,
    risk_free_rate: float,
    benchmark_return_1y: float | None = None,
) -> dict:
    """組裝 meta.json,驅動前端的資料健康狀態列(規格 §5.5)。

    benchmark_return_1y 是加權報酬指數的近一年漲幅。它不是健康狀態,
    是**判讀基準**:大盤漲九成的年份,整張表的報酬與夏普值都會很誇張,
    沒有這個對照,使用者無從判斷「+99%」是這檔厲害還是全市場都在漲。
    """
    return {
        "generated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "data_date": data_date.isoformat(),
        "is_stale": is_stale,
        "etf_count": etf_count,
        "unclassified": list(unclassified),
        "anomalies": [{"code": c, "reason": r} for c, r in anomalies],
        "risk_free_rate": risk_free_rate,
        "benchmark_return_1y": benchmark_return_1y,
    }


def _day_offsets(dates: Sequence[date]) -> tuple[str | None, list[int]]:
    """把日期序列壓成「起點 + 天數位移」。

    完整日期字串每點要 13 位元組。實測 0050 的 3081 點:物件陣列 93 KB、
    平行陣列 63 KB、日期位移 35 KB —— 差近三倍,而全站有 351 檔。
    """
    if not dates:
        return None, []
    start = dates[0]
    return start.isoformat(), [(d - start).days for d in dates]


def build_detail(
    profile: EtfProfile,
    metrics: EtfMetrics,
    prices: Sequence[PriceRecord],
    dividends: Sequence[DividendRecord],
) -> dict:
    """組裝單一 ETF 的個股頁資料(規格 §5.2 ②)。

    帶著該檔的報酬與風險指標,個股頁因此只需要一個請求 —— 否則為了幾個
    數字要另外載入 264 KB 的 rankings.json。

    走勢用**還原價**:走勢圖比的是含息報酬,用原始收盤價會讓高配息 ETF
    看起來一路走跌。

    未還原的 `close` 也一併送出,因為「配息再投入 vs 不再投入」的比較
    非它不可 —— 還原價**本身就已假設配息再投入**,拿它去算再投入會把
    配息計算兩次,而且兩條線會完全重疊,看起來像是程式壞了。
    """
    start, days = _day_offsets([p.date for p in prices])
    return {
        "code": profile.code,
        "name": profile.name,
        "category": profile.category,
        "region": profile.region,
        "exchange": profile.exchange,
        "issuer": profile.issuer,
        "tracking_index": profile.tracking_index,
        "listing_date": (profile.listing_date.isoformat()
                         if profile.listing_date else None),
        "data_start": (metrics.data_start.isoformat()
                       if metrics.data_start else None),
        "returns": dict(metrics.returns),
        "annualized": dict(metrics.annualized),
        "excess": dict(metrics.excess),
        "risk": {
            "volatility": metrics.volatility,
            "mdd": metrics.mdd,
            "sharpe": metrics.sharpe,
            "beta": metrics.beta,
        },
        "premium_discount": metrics.premium_discount,
        "series": {
            "start": start,
            "days": days,
            "adj": [round(p.adj_close, 4) for p in prices],
            "close": [round(p.close, 4) for p in prices],
        },
        # 新到舊:配息表最常看的是「最近配了多少」。
        "dividends": [
            {"ex_date": d.ex_date.isoformat(),
             "pay_date": d.pay_date.isoformat() if d.pay_date else None,
             "amount": d.amount}
            for d in sorted(dividends, key=lambda x: x.ex_date, reverse=True)
        ],
    }


def build_benchmark_series(bench_closes: Mapping[date, float]) -> dict:
    """加權報酬指數的序列,供個股頁疊加基準線。

    351 檔共用同一條線,故單獨匯出一次 —— 放進每一檔等於複製 351 份。
    """
    dates = sorted(bench_closes)
    start, days = _day_offsets(dates)
    return {"start": start, "days": days,
            "value": [round(bench_closes[d], 2) for d in dates]}


def write_json(path: Path, data: object) -> None:
    """寫出 JSON。中文不轉義,避免檔案體積膨脹近三倍。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
