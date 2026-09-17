import pytest

from alpha_track.sources import sitca_fees
from alpha_track.sources.sitca_fees import parse_sitca_expenses


def test_annual_total_fee_ratio_uses_last_column_and_etf_rows_only():
    etf = ["AH11", "98764389", "元大台灣卓越50基金"] + ["0"] * 14 + ["1,424,925,319", "0.22%"]
    link = ["AK1", "75970963", "元大台灣卓越50ETF連結基金"] + ["0"] * 14 + ["100", "0.01%"]
    page = "<table><tr><th>交易直接成本</th><th>會計帳列之費用</th></tr>" + "".join(
        "<tr>" + "".join(f"<td>{value}</td>" for value in row) + "</tr>"
        for row in (etf, link)
    ) + "</table>"
    rows = parse_sitca_expenses(page, 2025)
    assert len(rows) == 1
    assert rows[0].fund_id == "98764389"
    assert rows[0].year == 2025
    assert rows[0].ratio == 0.0022


def test_fetch_expenses_selects_year_then_annual_period(monkeypatch):
    calls = []
    row = ["AH11", "98764389", "元大台灣卓越50基金"] + ["0"] * 14 + ["100", "0.22%"]
    result = ('<option selected="selected" value="Year">全年</option>'
              '<table><tr><th>交易直接成本</th><th>會計帳列之費用</th></tr>'
              '<tr>' + ''.join(f'<td>{v}</td>' for v in row) + '</tr></table>')

    class FakeSession:
        def __init__(self, url, timeout):
            assert url == sitca_fees.FEES_URL
            assert timeout == 90

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def tokens(self):
            return {"__VIEWSTATE": "token"}

        def options(self, field):
            assert field == sitca_fees.PERIOD_FIELD
            return ["Year"]

        def query(self, params):
            calls.append(params)
            return result

    monkeypatch.setattr(sitca_fees, "FormSession", FakeSession)
    rows = sitca_fees.fetch_sitca_expenses(2025)
    assert len(calls) == 2
    assert calls[0]["__EVENTTARGET"] == sitca_fees.YEAR_FIELD
    assert calls[1][sitca_fees.PERIOD_FIELD] == "Year"
    assert rows[0].ratio == 0.0022


def test_fetch_expenses_rejects_monthly_result(monkeypatch):
    class FakeSession:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def tokens(self):
            return {}

        def options(self, _field):
            return ["Year"]

        def query(self, _params):
            return '<option selected="selected" value="12">十二月</option>'

    monkeypatch.setattr(sitca_fees, "FormSession", FakeSession)
    with pytest.raises(ValueError, match="年度費用率"):
        sitca_fees.fetch_sitca_expenses(2025)
