"""全套測試共用的 fixture。"""
import pytest

from alpha_track import cli


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """測試不該真的睡。

    回補對每個代號之間留 0.5 秒間隔(對免費 API 的禮貌),但在測試裡那是
    純粹的浪費 —— 加上這個 fixture 之前,整套測試從 2 秒變成 73 秒。

    放在 conftest 而非單一測試檔:整合測試會跑完整的 update,對三百多個
    代號各睡一次,module 內的 fixture 涵蓋不到它 —— 實測就是這樣讓
    整合測試跑到逾時的。

    專門驗證間隔的那幾個測試會自己再 monkeypatch 一次來記錄呼叫,不受影響。
    """
    monkeypatch.setattr(cli.time, "sleep", lambda _s: None)
