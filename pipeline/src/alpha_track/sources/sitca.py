"""投信投顧公會(SITCA)—— ETF 成分股。

## 為什麼是這裡

規格 §7.2 的「成分股重疊度」先前因為**找不到公開來源**而擱置。
前幾輪逐一排除了 TWSE openapi(143 條路徑)、TPEx openapi(225 條)、
FinMind(持股要付費且只涵蓋 37 檔主動式)、臺灣指數公司(成分股是付費商品)。

真正的來源是公會的「境內基金各項資料 / 基金投資明細-月前十大」——
免費官方,一次請求回傳一家投信某一類型的**全部基金**。

## 這個表單有兩個坑

1. **必須帶 rdo1 這個 radio。** 頁面有三種查詢模式(依公司/依類型/
   公司+類型),radio 決定哪一組下拉生效,而**沒被選中的那組在瀏覽器裡
   是 disabled、根本不會送出**。只送下拉值的話伺服器回原本的表單頁,
   HTTP 200、沒有錯誤訊息,只是查詢沒發生 —— 實測是靠「前後兩次回應的
   位元組數完全相同」才看出來的。

2. **憑證缺 Subject Key Identifier**,與 www.tpex.org.tw 同一個問題
   (ledger R29)。需要 base.ssl_context_for 放寬 VERIFY_X509_STRICT。

## 結果表格的形狀

同一檔基金的十筆持股,**只有第一列帶基金名稱**,其餘列少一格、整列左移。
因此不能用固定的欄位索引 —— 那會讓每一檔的第一筆(權重最大的那一筆)
被讀成別的欄位。
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

HOLDINGS_URL = "https://www.sitca.org.tw/ROC/Industry/IN2629.aspx?pid=IN22601_04"

# 與 ETF 相關的類型代碼:指數股票型(AH*)與主動式 ETF(AL*)。
# 連結基金(AK*)不取 —— 那是投資另一檔 ETF 的基金,持股只有一筆,
# 拿去比重疊度沒有意義。
ETF_CLASSES = (
    "AH11", "AH12", "AH13", "AH14", "AH15",
    "AH21", "AH22", "AH23", "AH24", "AH25", "AH26",
    "AL11", "AL12", "AL19", "AL21", "AL22", "AL29",
)


@dataclass(frozen=True)
class HoldingRecord:
    """某檔基金在某個月份的一筆持股。"""

    fund_name: str
    """公會用的基金全名(如「元大台灣卓越50基金」)。

    這裡刻意存名稱而非證券代號:公會的表格沒有 ETF 代號。
    對應到代號是另一件事,由呼叫端處理 —— 對不上時要看得出來是哪一檔。
    """
    year_month: str
    rank: int
    security_type: str
    security_code: str
    security_name: str
    amount: float
    weight: float | None
    """占基金淨資產價值之比例,**小數**(9.86% 存 0.0986)。

    公會的表格用百分比,這裡一律轉小數 —— 全站其他比例欄位都是小數,
    混用會在某一天讓某個計算差一百倍。
    """


def _cells(row_html: str) -> list[str]:
    return [
        html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c))).strip()
        for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.S | re.I)
    ]


DISCLAIMER = re.compile(r"[（(]本基金[^）)]*[）)]\s*$")


def clean_fund_name(name: str) -> str:
    """剝掉基金名稱尾端的法定公開說明。

    公會的表格把它併進名稱裡:
    「元大台灣高股息基金(本基金之配息來源可能為收益平準金且並無保證收益及配息)」
    帶著它就對應不到 ETF 代號。

    只剝**以「本基金」開頭**的括號 —— 幣別註記(如「(美元)」)、
    級別註記都是名稱的一部分,剝掉會讓兩檔不同的基金看起來同名。
    """
    return DISCLAIMER.sub("", name).strip()


def _to_float(text: str) -> float | None:
    cleaned = text.replace(",", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_sitca_holdings(page: str, year_month: str) -> list[HoldingRecord]:
    """解析查詢結果。

    查詢沒發生時(缺 radio、或該月該類型沒有資料)回傳空清單 ——
    頁面仍是 HTTP 200 且長得像正常頁面,所以呼叫端必須檢查筆數,
    不能假設有回應就有資料。
    """
    rows: list[HoldingRecord] = []
    current_fund = ""

    for table in re.findall(r"<table[^>]*>(.*?)</table>", page, re.S | re.I):
        trs = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S | re.I)
        header = _cells(trs[0]) if trs else []
        if "基金名稱" not in header or "標的名稱" not in header:
            continue

        for tr in trs[1:]:
            c = _cells(tr)
            if len(c) >= 10:
                current_fund = clean_fund_name(c[0])
                fields = c[1:]
            elif len(c) >= 9:
                fields = c
            else:
                continue  # 「合計」列與空列

            rank = _to_float(fields[0])
            code = fields[2].strip()
            if rank is None or not current_fund or not code:
                continue

            weight_pct = _to_float(fields[-1])
            rows.append(HoldingRecord(
                fund_name=current_fund,
                year_month=year_month,
                rank=int(rank),
                security_type=fields[1],
                security_code=code,
                security_name=fields[3],
                amount=_to_float(fields[4]) or 0.0,
                weight=None if weight_pct is None else weight_pct / 100,
            ))
    return rows


def holdings_form_data(
    year_month: str, company: str, fund_class: str, tokens: dict[str, str]
) -> dict[str, str]:
    """組出查詢用的表單欄位。

    `tokens` 為先前 GET 取得的 __VIEWSTATE / __VIEWSTATEGENERATOR /
    __EVENTVALIDATION。**rdo1 不可省略** —— 見模組說明第 1 點。
    """
    return {
        **tokens,
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "ctl00$ContentPlaceHolder1$rdo1": "rbComCL",
        "ctl00$ContentPlaceHolder1$ddlQ_YM": year_month,
        "ctl00$ContentPlaceHolder1$ddlQ_Comid1": company,
        "ctl00$ContentPlaceHolder1$ddlQ_Class1": fund_class,
        "ctl00$ContentPlaceHolder1$BtnQuery": "查詢",
    }
