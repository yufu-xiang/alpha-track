"""資料源共用工具。

網路層與解析層刻意分離:解析為純函式,可用 fixture 測試而不連網。

日期格式有三種且外觀相似(見 docs/data-sources.md 第 6 點),故集中處理:
民國年無分隔、民國年斜線、西元年句點。各 adapter 不得自行改寫。
"""
from __future__ import annotations

import ssl
import time
from datetime import date
from urllib.parse import urlsplit

import certifi
import httpx

USER_AGENT = "alpha-track/0.1 (personal ETF tracker)"

RFC5280_NONCONFORMING_HOSTS = frozenset({"www.tpex.org.tw"})
"""憑證鏈不符 RFC 5280 格式要求、需要放寬 VERIFY_X509_STRICT 的網域。

實測 2026-08-23:`www.tpex.org.tw` 的憑證鏈缺少 Subject Key Identifier 擴充。
Python 3.13+ / OpenSSL 3.5+ 的預設 context 開啟 VERIFY_X509_STRICT,會以
`certificate verify failed: Missing Subject Key Identifier` 直接拒絕連線 ——
於是 117 檔上櫃 ETF 在新版執行環境完全抓不到。

**放寬的是憑證「格式」要求,不是「真偽」驗證。** 憑證鏈與主機名一律照驗
(check_hostname=True、verify_mode=CERT_REQUIRED),被關掉的只是 RFC 5280
對 CA 憑證的一項欄位規定。這條界線不要再往下讓 —— 需要的是修這份清單,
不是改成 verify=False。清單保持逐一列舉,不做萬用比對。
"""


def ssl_context_for(url: str) -> ssl.SSLContext:
    """依網域決定 TLS 設定。預設最嚴,只對清單內的網域放寬格式檢查。"""
    context = ssl.create_default_context(cafile=certifi.where())
    if urlsplit(url).hostname in RFC5280_NONCONFORMING_HOSTS:
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return context


def fetch_json(url: str, *, retries: int = 3, timeout: float = 30.0) -> object:
    """取得 JSON,失敗時指數退避重試。

    遇 429 限流一律等待後重試,不縮短間隔硬打 —— 免費 API 的額度
    用完之後短時間內反覆重試只會延長封鎖。
    """
    delay = 1.0
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = httpx.get(url, timeout=timeout,
                             headers={"User-Agent": USER_AGENT},
                             follow_redirects=True,
                             verify=ssl_context_for(url))
            if resp.status_code == 429:
                time.sleep(delay * 4)
                delay *= 2
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
    raise RuntimeError(f"取得 {url} 失敗,已重試 {retries} 次") from last_exc


def parse_roc_compact(value: object) -> date | None:
    """民國年無分隔:'1150820' → 2026-08-20。openapi(TWSE 與 TPEx)皆此格式。"""
    text = str(value or "").strip()
    if len(text) not in (6, 7) or not text.isdigit():
        return None
    try:
        return date(int(text[:-4]) + 1911, int(text[-4:-2]), int(text[-2:]))
    except ValueError:
        return None


def parse_roc_slash(value: object) -> date | None:
    """民國年斜線分隔:' 92/01/02' → 2003-01-02。TWSE 舊站格式,可能有前導空格。"""
    parts = str(value or "").strip().split("/")
    if len(parts) != 3:
        return None
    try:
        return date(int(parts[0]) + 1911, int(parts[1]), int(parts[2]))
    except ValueError:
        return None


def parse_ad_dot(value: object) -> date | None:
    """**西元年**句點分隔:'2003.06.30' → 2003-06-30。

    TWSE 舊站 ETF 清單專用。注意它與其他 TWSE 端點不同,是西元年不是民國年 ——
    誤當民國年會得到 3914 年,而且不會拋錯,是最容易靜默出錯的一種格式。
    """
    parts = str(value or "").strip().split(".")
    if len(parts) != 3:
        return None
    try:
        return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError:
        return None


def to_float(value: object) -> float | None:
    """把 API 回傳的字串數字轉為 float。無法轉換時回傳 None,不回傳 0。

    「無成交」的標記形式因端點而異且沒有文件:TPEx 實測用 '----'(四個連字號),
    Change 欄用 '---'(三個)。與其逐一列舉,一律把「整串都是連字號」視為缺值 ——
    但 '-0.43' 這種帶負號的數值不算,故用集合相等而非開頭字元判斷。
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if text in ("", "N/A", "null") or set(text) == {"-"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None
