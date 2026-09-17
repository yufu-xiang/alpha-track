"""投信投顧公會年度各項費用比率。

只取「全年」的合計比率；月報的 0.02% 不能當成年費率。
基金統編是對應 ETF 代號的主鍵，名稱僅供查核與保守備援。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .base import FormSession
from .sitca import _cells, clean_fund_name

FEES_URL = "https://www.sitca.org.tw/ROC/Industry/IN2211.aspx?pid=IN2222_01"
YEAR_FIELD = "ctl00$ContentPlaceHolder1$ddlQ_Y"
PERIOD_FIELD = "ctl00$ContentPlaceHolder1$ddlQ_M"
COMPANY_FIELD = "ctl00$ContentPlaceHolder1$ddlQ_Comid"
FUND_FIELD = "ctl00$ContentPlaceHolder1$ddlQ_Fund"


@dataclass(frozen=True)
class ExpenseRecord:
    fund_id: str
    fund_name: str
    year: int
    ratio: float


def parse_sitca_expenses(page: str, year: int) -> list[ExpenseRecord]:
    """表格最後一欄為合計比率；百分比轉成全站使用的小數。"""
    result: list[ExpenseRecord] = []
    for table in re.findall(r"<table[^>]*>(.*?)</table>", page, re.S | re.I):
        if "交易直接成本" not in table or "會計帳列之費用" not in table:
            continue
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S | re.I):
            cells = _cells(tr)
            if len(cells) != 19 or not cells[0].startswith(("AH", "AL")):
                continue
            if not re.fullmatch(r"\d{8}", cells[1]):
                continue
            raw = cells[-1].strip().replace(",", "")
            if not re.fullmatch(r"\d+(?:\.\d+)?%", raw):
                continue
            ratio = float(raw[:-1]) / 100
            if not 0 <= ratio < 0.5:
                continue
            result.append(ExpenseRecord(
                fund_id=cells[1], fund_name=clean_fund_name(cells[2]),
                year=year, ratio=ratio,
            ))
    return result


def fetch_sitca_expenses(year: int) -> list[ExpenseRecord]:
    """切換年份後再選全年；WebForms 第一次 postback 會重設期間選單。"""
    with FormSession(FEES_URL, timeout=90) as session:
        base = {
            YEAR_FIELD: str(year), PERIOD_FIELD: "Year",
            COMPANY_FIELD: "", FUND_FIELD: "",
        }
        session.query({**session.tokens(), **base,
                       "__EVENTTARGET": YEAR_FIELD, "__EVENTARGUMENT": ""})
        if "Year" not in session.options(PERIOD_FIELD):
            return []
        page = session.query({**session.tokens(), **base,
                              "ctl00$ContentPlaceHolder1$BtnQuery": "查詢"})
        selected = re.search(
            r'<option selected="selected" value="Year">全年</option>', page)
        if selected is None:
            raise ValueError("公會未回傳年度費用率，拒絕把月費率當成年費率")
        return parse_sitca_expenses(page, year)
