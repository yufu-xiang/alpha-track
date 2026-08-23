"""JSON 匯出。定義前後端唯一契約。

規格 §5.3。欄位名稱與階段 1b 的 TypeScript 型別必須逐字一致;
改名是破壞性變更,兩邊須同步修改(1b 的契約測試以 Object.keys().sort()
全等斷言,多一個欄位或少一個欄位都會讓前端測試失敗)。

null 的意義固定為「資料不足」,前端據此把該列排到最末並顯示「—」。
絕不以 0 頂替。
"""
from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .compute import EtfMetrics
from .models import EtfProfile

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
                # 複製而非共用:匯出後呼叫端若再動 EtfMetrics,
                # 不該連帶改到已經組好的輸出。
                "returns": dict(m.returns),
                "annualized": dict(m.annualized),
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
) -> dict:
    """組裝 meta.json,驅動前端的資料健康狀態列(規格 §5.5)。"""
    return {
        "generated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "data_date": data_date.isoformat(),
        "is_stale": is_stale,
        "etf_count": etf_count,
        "unclassified": list(unclassified),
        "anomalies": [{"code": c, "reason": r} for c, r in anomalies],
        "risk_free_rate": risk_free_rate,
    }


def write_json(path: Path, data: object) -> None:
    """寫出 JSON。中文不轉義,避免檔案體積膨脹近三倍。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
