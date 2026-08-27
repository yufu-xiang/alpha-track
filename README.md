# Alpha Track

個人用的台股 ETF 觀測工具。Python pipeline 在每日收盤後整合 TWSE、
TPEx、Yahoo Finance 與 FinMind 資料，計算含息報酬、風險與折溢價指標，
再匯出為 React 靜態網站使用的 JSON。不需要後端伺服器。

## 功能

- 全市場 ETF 多期間績效、風險、流動性與殖利率排行
- ETF 走勢、配息、前十大成分股與折溢價明細
- 多檔比較、投資組合追蹤、指標詞典與理財試算工具
- 資料健康檢查、不完整市場批次隔離、JSON 執行期契約驗證

## 環境與安裝

專案鎖定 Python 3.12、Node 20.19.4、npm 10.8.2 與 `uv.lock`。

```bash
pip install uv==0.11.27
uv sync --locked --extra dev --project pipeline

cd web
npm ci
```

## 開發

若本機已有 `data/alpha_track.db`，可直接離線重新匯出並啟動前端：

```bash
uv run --project pipeline python -m alpha_track.cli export
cd web
npm run dev
```

新環境或需要抓取當日資料時：

```bash
uv run --project pipeline python -m alpha_track.cli restore
uv run --project pipeline python -m alpha_track.cli update
```

`restore` 會先從版控內的 `recovery.json` 還原無法向上游回補的歷史淨值；
`update` 會抓取、驗證、回補、計算並匯出。另有 `backfill` 可單獨補齊
歷史價格、配息與大盤基準。

## 驗證

```bash
uv run --project pipeline pytest -q \
  --cov=alpha_track --cov-report=term-missing --cov-fail-under=85

cd web
npm test
npm run build
```

CI 與每日排程都使用鎖定版本；正式網站由 GitHub Pages 部署。

## 專案結構

- `pipeline/`：資料來源 adapter、SQLite 儲存、指標計算與 JSON 匯出
- `web/`：Vite + React + TypeScript 靜態前端
- `web/public/data/`：可部署的匯出資料與復原快照
- `config/`：指標設定與 ETF 分類對照
- `docs/data-sources.md`：實測資料源、限制與異常格式
- `docs/json-contract.md`：pipeline 與前端的唯一 JSON 契約

資料來源、計算假設與免責說明均會在 UI 顯示。本專案用於資料觀測，
不構成投資建議。
