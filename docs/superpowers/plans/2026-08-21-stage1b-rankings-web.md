# 階段 1b:績效排行榜前端實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立純靜態的 ETF 績效排行網站,消費階段 1a 產出的 JSON,提供多期間排序、欄位自選、分類篩選、指標說明與資料健康狀態。

**Architecture:** Vite + React 純前端,無後端。啟動時載入 `meta.json` 與 `rankings.json`,所有排序與篩選在瀏覽器記憶體內完成(250 筆資料為毫秒級)。使用者偏好存於 localStorage。部署為靜態檔案。

**Tech Stack:** Vite、React 18、TypeScript、TanStack Table v8、Vitest、@testing-library/react

**Spec:** `docs/superpowers/specs/2026-08-21-etf-tracker-design.md`

**契約:** `docs/json-contract.md`(階段 1a Task 11 產出)

## Global Constraints

- TypeScript strict mode 開啟
- **JSON 欄位名稱必須與 `docs/json-contract.md` 逐字一致** —— 型別定義是契約的鏡像,不可自行改名
- `null` 一律代表「資料不足」,顯示為 `—`,排序時置於列表最末(不論升冪降冪)
- **絕不把 `null` 當成 `0` 參與計算或排序**
- 期間代碼固定為 `D1 W1 M1 M3 M6 YTD Y1 Y3 Y5 Y10 INCEPTION`
- 所有 localStorage 讀寫必須包 try/catch(無痕模式會拋例外)
- 比率資料以小數儲存,顯示時才乘 100 加上 `%`
- 介面文字一律繁體中文

## 前置條件

本計畫可在階段 1a 完成前開始:Task 1 會建立一份符合契約的 fixture JSON,
前端全程對 fixture 開發與測試。階段 1a 完成後,把 fixture 換成真實產出即可。

---

## 檔案結構

```
web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/data/            # 階段 1a 的匯出目標(開發期用 fixture)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts            # 契約型別(docs/json-contract.md 的鏡像)
    ├── data/
    │   ├── loader.ts       # JSON 載入與錯誤處理
    │   └── fixture.ts      # 測試用資料
    ├── lib/
    │   ├── sorting.ts      # null 置底排序
    │   ├── format.ts       # 百分比與日期格式化
    │   └── prefs.ts        # localStorage 偏好存取
    ├── content/
    │   └── glossary.ts     # 指標詞典
    └── components/
        ├── RankingTable.tsx
        ├── PeriodTabs.tsx
        ├── ColumnPicker.tsx
        ├── Filters.tsx
        ├── HealthBar.tsx
        └── MetricInfo.tsx
```

---

## Task 1: 專案骨架、契約型別與 fixture

**Files:**
- Create: `web/package.json`、`web/tsconfig.json`、`web/vite.config.ts`、`web/index.html`
- Create: `web/src/types.ts`
- Create: `web/src/data/fixture.ts`
- Test: `web/src/types.test.ts`

**Interfaces:**
- Consumes: `docs/json-contract.md`
- Produces: `RankingsData`、`EtfRow`、`MetaData`、`PERIODS`、`PeriodCode`;
  `fixtureRankings`、`fixtureMeta`

- [ ] **Step 1: 建立專案設定**

`web/package.json`:

```json
{
  "name": "alpha-track-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tanstack/react-table": "^8.20.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node", "vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

`web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

`web/index.html`:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>台股 ETF 績效排行</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 寫失敗測試**

`web/src/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fixtureMeta, fixtureRankings } from './data/fixture'
import { PERIODS, type EtfRow } from './types'

describe('契約型別', () => {
  it('期間代碼與後端 Period enum 逐字一致', () => {
    expect(PERIODS).toEqual([
      'D1', 'W1', 'M1', 'M3', 'M6', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10', 'INCEPTION',
    ])
  })

  it('fixture 的每一列都具備契約規定的全部欄位', () => {
    const row: EtfRow = fixtureRankings.etfs[0]!
    expect(Object.keys(row).sort()).toEqual([
      'annualized', 'category', 'close', 'code', 'data_start', 'is_inverse',
      'is_leveraged', 'listing_date', 'name', 'premium_discount', 'region',
      'returns', 'risk',
    ])
  })

  it('data_start 與 listing_date 是兩件事,不可混用', () => {
    // 0050 掛牌於 2003,但免費資料源實際只回溯到 2014(見 1a 的 ledger R24:
    // Yahoo 的 2014-01-02 有一次未調整的 1:4 分割,之前的區段被捨棄)。
    // 「成立以來」因此是 null —— UI 必須用 data_start 說明這欄為何空白,
    // 否則使用者只會看到一個沒有理由的破折號。
    const old = fixtureRankings.etfs.find((e) => e.code === '0050')!
    expect(old.listing_date).toBe('2003-06-30')
    expect(old.data_start).toBe('2014-01-02')
    expect(old.returns.INCEPTION).toBeNull()
  })

  it('fixture 以 null 表示資料不足,而非 0', () => {
    const young = fixtureRankings.etfs.find((e) => e.code === '00929')!
    expect(young.returns.Y10).toBeNull()
    expect(young.returns.Y5).toBeNull()
    expect(young.returns.Y1).not.toBeNull()
  })

  it('fixture 涵蓋槓桿與反向標的,供篩選功能測試', () => {
    expect(fixtureRankings.etfs.some((e) => e.is_leveraged)).toBe(true)
    expect(fixtureRankings.etfs.some((e) => e.is_inverse)).toBe(true)
  })

  it('meta fixture 具備健康狀態列所需的全部欄位', () => {
    expect(Object.keys(fixtureMeta).sort()).toEqual([
      'anomalies', 'data_date', 'etf_count', 'generated_at',
      'is_stale', 'risk_free_rate', 'unclassified',
    ])
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `cd web && npm install && npm test`
Expected: FAIL — 找不到 `./types` 與 `./data/fixture`

- [ ] **Step 4: 實作 types.ts**

```ts
/**
 * 契約型別:docs/json-contract.md 的 TypeScript 鏡像。
 *
 * 這裡的欄位名稱必須與 pipeline 的 export.py 逐字一致。
 * 改名是破壞性變更,兩邊必須同步修改。
 *
 * null 的意義固定為「資料不足」——顯示為 —,排序時置於最末,
 * 絕不當成 0 參與計算。
 */

export const PERIODS = [
  'D1', 'W1', 'M1', 'M3', 'M6', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10', 'INCEPTION',
] as const

export type PeriodCode = (typeof PERIODS)[number]

export const PERIOD_LABELS: Record<PeriodCode, string> = {
  D1: '當日',
  W1: '一週',
  M1: '一月',
  M3: '三月',
  M6: '六月',
  YTD: '今年以來',
  Y1: '一年',
  Y3: '三年',
  Y5: '五年',
  Y10: '十年',
  INCEPTION: '成立以來',
}

export interface RiskMetrics {
  volatility: number | null
  mdd: number | null
  sharpe: number | null
  beta: number | null
}

export interface EtfRow {
  code: string
  name: string
  category: string | null
  region: string | null
  is_leveraged: boolean
  is_inverse: boolean
  close: number
  listing_date: string | null
  /**
   * 實際持有價格資料的起點。與 listing_date 不同時,代表免費資料源涵蓋不足
   * (Yahoo 的歷史深度、或未調整分割導致舊區段被捨棄)。
   * 「成立以來」為 null 時,UI 用這個日期說明原因,而不是留一個沒有理由的破折號。
   */
  data_start: string | null
  returns: Record<PeriodCode, number | null>
  annualized: Record<PeriodCode, number | null>
  risk: RiskMetrics
  premium_discount: number | null
}

export interface RankingsData {
  data_date: string
  etfs: EtfRow[]
}

export interface Anomaly {
  code: string
  reason: string
}

export interface MetaData {
  generated_at: string
  data_date: string
  is_stale: boolean
  etf_count: number
  unclassified: string[]
  anomalies: Anomaly[]
  risk_free_rate: number
}
```

- [ ] **Step 5: 實作 fixture.ts**

```ts
/**
 * 測試與開發用資料。刻意涵蓋各種邊界:
 * 老牌 ETF(十年資料齊全)、新掛牌(長期為 null)、槓桿、反向、未分類,
 * 以及 data_start 晚於 listing_date 而使「成立以來」為 null 的情況(0050)。
 */
import type { MetaData, PeriodCode, RankingsData } from '../types'

function periods(v: Partial<Record<PeriodCode, number | null>>) {
  const base: Record<PeriodCode, number | null> = {
    D1: null, W1: null, M1: null, M3: null, M6: null, YTD: null,
    Y1: null, Y3: null, Y5: null, Y10: null, INCEPTION: null,
  }
  return { ...base, ...v }
}

export const fixtureRankings: RankingsData = {
  data_date: '2026-08-21',
  etfs: [
    {
      code: '0050', name: '元大台灣50', category: '市值型', region: '台灣',
      is_leveraged: false, is_inverse: false, close: 195.5,
      listing_date: '2003-06-30',
      data_start: '2014-01-02',
      returns: periods({
        D1: 0.0052, W1: 0.0131, M1: 0.0287, M3: 0.0654, M6: 0.1102,
        YTD: 0.1455, Y1: 0.1834, Y3: 0.4512, Y5: 0.9821, Y10: 2.4103,
        // INCEPTION 為 null:資料只回溯到 data_start(2014),
        // 標成「成立以來」會是個安靜的錯誤數字。
      }),
      annualized: periods({
        Y3: 0.1321, Y5: 0.1468, Y10: 0.1312,
      }),
      risk: { volatility: 0.1833, mdd: -0.3421, sharpe: 0.9187, beta: 1.0210 },
      premium_discount: 0.0012,
    },
    {
      code: '0056', name: '元大高股息', category: '高股息', region: '台灣',
      is_leveraged: false, is_inverse: false, close: 40.4,
      listing_date: '2007-12-26',
      data_start: '2009-01-05',
      returns: periods({
        D1: -0.0021, W1: 0.0064, M1: 0.0155, M3: 0.0312, M6: 0.0688,
        YTD: 0.0921, Y1: 0.1245, Y3: 0.3102, Y5: 0.6544, Y10: 1.4021,
        INCEPTION: 2.1033,
      }),
      annualized: periods({
        Y3: 0.0942, Y5: 0.1057, Y10: 0.0915, INCEPTION: 0.0644,
      }),
      risk: { volatility: 0.1521, mdd: -0.2988, sharpe: 0.7133, beta: 0.8422 },
      premium_discount: 0.0231,
    },
    {
      code: '00929', name: '復華台灣科技優息', category: '高股息', region: '台灣',
      is_leveraged: false, is_inverse: false, close: 18.9,
      listing_date: '2023-06-09',
      data_start: '2023-06-09',
      returns: periods({
        D1: 0.0106, W1: 0.0201, M1: 0.0402, M3: 0.0811, M6: 0.1233,
        YTD: 0.1544, Y1: 0.2011, Y3: 0.3877, INCEPTION: 0.4102,
      }),
      annualized: periods({ Y3: 0.1153, INCEPTION: 0.1201 }),
      risk: { volatility: 0.2144, mdd: -0.1877, sharpe: 0.8632, beta: 1.1044 },
      premium_discount: -0.0044,
    },
    {
      code: '00679B', name: '元大美債20年', category: '債券型', region: null,
      is_leveraged: false, is_inverse: false, close: 29.8,
      listing_date: '2017-01-11',
      data_start: '2017-01-11',
      returns: periods({
        D1: 0.0034, W1: -0.0088, M1: -0.0121, M3: 0.0044, M6: -0.0233,
        YTD: -0.0155, Y1: 0.0322, Y3: -0.1544, Y5: -0.2811,
        INCEPTION: -0.1033,
      }),
      annualized: periods({ Y3: -0.0545, Y5: -0.0641, INCEPTION: -0.0114 }),
      risk: { volatility: 0.1211, mdd: -0.4522, sharpe: 0.1421, beta: 0.1033 },
      premium_discount: 0.0008,
    },
    {
      code: '00631L', name: '元大台灣50正2', category: '槓桿型', region: null,
      is_leveraged: true, is_inverse: false, close: 210.5,
      listing_date: '2014-10-31',
      data_start: '2014-10-31',
      returns: periods({
        D1: 0.0103, W1: 0.0266, M1: 0.0577, M3: 0.1322, M6: 0.2255,
        YTD: 0.2988, Y1: 0.3822, Y3: 0.9877, Y5: 2.4011, Y10: 8.1044,
        INCEPTION: 9.2011,
      }),
      annualized: periods({
        Y3: 0.2544, Y5: 0.2788, Y10: 0.2455, INCEPTION: 0.2211,
      }),
      risk: { volatility: 0.3688, mdd: -0.6211, sharpe: 0.9922, beta: 2.0411 },
      premium_discount: 0.0055,
    },
    {
      code: '00632R', name: '元大台灣50反1', category: '反向型', region: null,
      is_leveraged: false, is_inverse: true, close: 4.12,
      listing_date: '2014-10-31',
      data_start: '2014-10-31',
      returns: periods({
        D1: -0.0051, W1: -0.0129, M1: -0.0281, M3: -0.0644, M6: -0.1088,
        YTD: -0.1422, Y1: -0.1811, Y3: -0.4022, Y5: -0.6544, Y10: -0.8211,
        INCEPTION: -0.8422,
      }),
      annualized: periods({
        Y3: -0.1588, Y5: -0.1955, Y10: -0.1577, INCEPTION: -0.1522,
      }),
      risk: { volatility: 0.1822, mdd: -0.8433, sharpe: null, beta: -1.0122 },
      premium_discount: -0.0011,
    },
    {
      code: '00999', name: '未知新標的', category: '未分類', region: null,
      is_leveraged: false, is_inverse: false, close: 15.02,
      listing_date: '2026-07-15',
      data_start: '2026-07-15',
      returns: periods({ D1: 0.0013, W1: 0.0044, M1: 0.0102, INCEPTION: 0.0013 }),
      annualized: periods({ INCEPTION: null }),
      risk: { volatility: null, mdd: null, sharpe: null, beta: null },
      premium_discount: null,
    },
  ],
}

export const fixtureMeta: MetaData = {
  generated_at: '2026-08-21T18:04:12+08:00',
  data_date: '2026-08-21',
  is_stale: false,
  etf_count: 7,
  unclassified: ['00999'],
  anomalies: [],
  risk_free_rate: 0.015,
}
```

- [ ] **Step 6: 執行測試確認通過**

Run: `cd web && npm test`
Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat(web): 專案骨架、契約型別與測試 fixture"
```

---

## Task 2: null 置底排序

**Files:**
- Create: `web/src/lib/sorting.ts`
- Test: `web/src/lib/sorting.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `nullsLastComparator(a, b, desc): number`(通用比較器)
  以及 `toSortable(v: number | null): number | undefined`(TanStack 用)

**設計要點:** 規格 §4.3 規定資料不足者「不論升冪或降冪都排在最末」。
一般的比較器會把 null 當成最小值,降冪時它就跑到底部、升冪時跑到頂部 ——
這會讓一堆「—」佔據榜首,正是規格要避免的情況。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it } from 'vitest'
import { nullsLastComparator, toSortable } from './sorting'

function sortValues(values: (number | null)[], desc: boolean) {
  return [...values].sort((a, b) => nullsLastComparator(a, b, desc))
}

describe('nullsLastComparator', () => {
  it('降冪時由大到小排列', () => {
    expect(sortValues([1, 3, 2], true)).toEqual([3, 2, 1])
  })

  it('升冪時由小到大排列', () => {
    expect(sortValues([3, 1, 2], false)).toEqual([1, 2, 3])
  })

  it('降冪時 null 排在最末', () => {
    expect(sortValues([1, null, 3, null, 2], true)).toEqual([3, 2, 1, null, null])
  })

  it('升冪時 null 仍排在最末 —— 這是與一般比較器最關鍵的差異', () => {
    expect(sortValues([1, null, 3, null, 2], false)).toEqual([1, 2, 3, null, null])
  })

  it('全為 null 時不改變相對順序', () => {
    expect(sortValues([null, null, null], true)).toEqual([null, null, null])
  })

  it('負值參與正常排序,不被當成缺值', () => {
    expect(sortValues([-0.5, null, 0.2, -0.1], true)).toEqual([0.2, -0.1, -0.5, null])
  })

  it('零是有效值,不等同於 null', () => {
    expect(sortValues([0, null, 0.1], true)).toEqual([0.1, 0, null])
  })
})

describe('toSortable', () => {
  it('數值原樣通過', () => {
    expect(toSortable(0.18)).toBe(0.18)
  })

  it('零不被當成缺值', () => {
    expect(toSortable(0)).toBe(0)
  })

  it('null 轉成 undefined 交給 TanStack 的 sortUndefined 處理', () => {
    expect(toSortable(null)).toBeUndefined()
  })

  it('NaN 也視為缺值', () => {
    expect(toSortable(Number.NaN)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- sorting`
Expected: FAIL — 找不到 `./sorting`

- [ ] **Step 3: 實作 sorting.ts**

```ts
/**
 * 排序工具。
 *
 * 規格 §4.3:資料不足(null)者不論升冪或降冪,一律排在列表最末。
 *
 * 一般比較器把 null 視為最小值,升冪時它會浮到頂端,使一整排「—」
 * 佔據榜首。這正是規格要避免的情況,故 null 的處理獨立於排序方向。
 */

export function nullsLastComparator(
  a: number | null,
  b: number | null,
  desc: boolean,
): number {
  const aNull = a === null || Number.isNaN(a)
  const bNull = b === null || Number.isNaN(b)

  if (aNull && bNull) return 0
  if (aNull) return 1 // a 永遠往後,不看 desc
  if (bNull) return -1

  return desc ? b - a : a - b
}

/**
 * 把「資料不足」轉成 undefined,供 TanStack 的 sortUndefined 處理。
 *
 * 為什麼不自己寫 sortingFn 處理 null:TanStack 在降冪時會**反轉**
 * 比較器的回傳值,所以「null 恆回傳 1」在降冪時會被翻成置頂,
 * 正好與需求相反。TanStack 對 undefined 的處理則獨立於排序方向,
 * 因此把 null 映射成 undefined 才是唯一在升降冪都正確的做法。
 *
 * 用法:欄位定義寫 accessor 為 `toSortable(row.returns[p])`,
 * 並設定 `sortUndefined: 'last'`。
 */
export function toSortable(v: number | null): number | undefined {
  return v === null || Number.isNaN(v) ? undefined : v
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd web && npm test -- sorting`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sorting.ts web/src/lib/sorting.test.ts
git commit -m "feat(web): null 置底排序,升降冪皆然"
```

---

## Task 3: 格式化與偏好儲存

**Files:**
- Create: `web/src/lib/format.ts`
- Create: `web/src/lib/prefs.ts`
- Test: `web/src/lib/format.test.ts`
- Test: `web/src/lib/prefs.test.ts`

**Interfaces:**
- Consumes: `PeriodCode` (Task 1)
- Produces:
  - `formatPercent(v: number | null, digits?: number): string`
  - `formatNumber(v: number | null, digits?: number): string`
  - `formatDate(iso: string | null): string`
  - `loadPrefs(): Prefs`、`savePrefs(p: Prefs): void`、`DEFAULT_PREFS`

- [ ] **Step 1: 寫失敗測試**

`web/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber, formatPercent } from './format'

describe('formatPercent', () => {
  it('把小數轉為百分比字串', () => {
    expect(formatPercent(0.1834)).toBe('+18.34%')
  })

  it('負值帶負號', () => {
    expect(formatPercent(-0.0521)).toBe('-5.21%')
  })

  it('零顯示為 0.00% 而非帶正號', () => {
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('null 顯示為破折號 —— 這是資料不足的視覺標記', () => {
    expect(formatPercent(null)).toBe('—')
  })

  it('可指定小數位數', () => {
    expect(formatPercent(0.1834, 1)).toBe('+18.3%')
  })
})

describe('formatNumber', () => {
  it('保留指定小數位', () => {
    expect(formatNumber(0.9187, 2)).toBe('0.92')
  })

  it('null 顯示為破折號', () => {
    expect(formatNumber(null)).toBe('—')
  })

  it('負值正常顯示,不加正號', () => {
    expect(formatNumber(-1.0122, 2)).toBe('-1.01')
  })
})

describe('formatDate', () => {
  it('把 ISO 日期轉為本地格式', () => {
    expect(formatDate('2003-06-30')).toBe('2003/06/30')
  })

  it('null 顯示為破折號', () => {
    expect(formatDate(null)).toBe('—')
  })
})
```

`web/src/lib/prefs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs'

describe('偏好儲存', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('未儲存過時回傳預設值', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('預設顯示欄位為規格指定的五個期間', () => {
    expect(DEFAULT_PREFS.visibleColumns).toEqual(['D1', 'M1', 'M3', 'Y1', 'Y3'])
  })

  it('存檔後可讀回', () => {
    savePrefs({ ...DEFAULT_PREFS, visibleColumns: ['Y1', 'Y10'] })
    expect(loadPrefs().visibleColumns).toEqual(['Y1', 'Y10'])
  })

  it('儲存內容毀損時回退到預設值,不讓整頁崩潰', () => {
    localStorage.setItem('alpha-track:prefs', '{ 這不是 JSON')
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('localStorage 讀取拋例外時回退到預設值(無痕模式)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('localStorage 寫入拋例外時靜默失敗,不中斷操作', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow()
  })

  it('捨棄不認識的期間代碼,避免舊版偏好污染新版欄位', () => {
    localStorage.setItem(
      'alpha-track:prefs',
      JSON.stringify({ visibleColumns: ['Y1', 'BOGUS'], showLevered: false }),
    )
    expect(loadPrefs().visibleColumns).toEqual(['Y1'])
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- lib`
Expected: FAIL — 找不到模組

- [ ] **Step 3: 實作 format.ts**

```ts
/** 顯示格式化。null 一律呈現為破折號,絕不顯示為 0。 */

const DASH = '—'

export function formatPercent(v: number | null, digits = 2): string {
  if (v === null || Number.isNaN(v)) return DASH
  const pct = v * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

export function formatNumber(v: number | null, digits = 2): string {
  if (v === null || Number.isNaN(v)) return DASH
  return v.toFixed(digits)
}

export function formatDate(iso: string | null): string {
  if (!iso) return DASH
  return iso.replaceAll('-', '/')
}
```

- [ ] **Step 4: 實作 prefs.ts**

```ts
/**
 * 使用者偏好儲存。
 *
 * 所有 localStorage 存取都包 try/catch:無痕模式下 getItem/setItem
 * 會直接拋例外,未攔截會讓整頁白畫面。
 */
import { PERIODS, type PeriodCode } from '../types'

const KEY = 'alpha-track:prefs'

export interface Prefs {
  visibleColumns: PeriodCode[]
  showLevered: boolean
}

export const DEFAULT_PREFS: Prefs = {
  visibleColumns: ['D1', 'M1', 'M3', 'Y1', 'Y3'],
  showLevered: false,
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    const valid = (parsed.visibleColumns ?? []).filter(
      (c): c is PeriodCode => (PERIODS as readonly string[]).includes(c),
    )
    return {
      visibleColumns: valid.length > 0 ? valid : DEFAULT_PREFS.visibleColumns,
      showLevered: parsed.showLevered ?? DEFAULT_PREFS.showLevered,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // 無痕模式或配額已滿。偏好遺失不影響功能,靜默忽略。
  }
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd web && npm test -- format prefs`
Expected: 17 passed(程式碼區塊實為 10 + 7 個測試函式;
原本寫 18 是計數錯誤,且 `-- lib` 會一併選到同目錄的 sorting.test.ts)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/
git commit -m "feat(web): 格式化工具與 localStorage 偏好儲存"
```

---

## Task 4: 資料載入與健康狀態列

**Files:**
- Create: `web/src/data/loader.ts`
- Create: `web/src/components/HealthBar.tsx`
- Test: `web/src/data/loader.test.ts`
- Test: `web/src/components/HealthBar.test.tsx`

**Interfaces:**
- Consumes: `RankingsData`、`MetaData` (Task 1)
- Produces:
  - `loadData(): Promise<LoadResult>`,`LoadResult = { ok: true; rankings; meta } | { ok: false; error: string }`
  - `<HealthBar meta={meta} />`
  - `daysSince(iso: string, now?: Date): number`

- [ ] **Step 1: 寫失敗測試**

`web/src/data/loader.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { daysSince, loadData } from './loader'
import { fixtureMeta, fixtureRankings } from './fixture'

afterEach(() => vi.restoreAllMocks())

describe('loadData', () => {
  it('兩份 JSON 都成功時回傳 ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('meta') ? fixtureMeta : fixtureRankings,
    })))
    const r = await loadData()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.rankings.etfs).toHaveLength(7)
  })

  it('HTTP 錯誤時回傳明確錯誤,不拋例外', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    const r = await loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('404')
  })

  it('網路失敗時回傳明確錯誤', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const r = await loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('載入失敗')
  })

  it('JSON 格式錯誤時回傳明確錯誤,而非空白畫面', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token') },
    })))
    const r = await loadData()
    expect(r.ok).toBe(false)
  })
})

describe('daysSince', () => {
  it('計算相隔天數', () => {
    expect(daysSince('2026-08-18', new Date('2026-08-21T12:00:00+08:00'))).toBe(3)
  })

  it('當天為 0', () => {
    expect(daysSince('2026-08-21', new Date('2026-08-21T20:00:00+08:00'))).toBe(0)
  })
})
```

`web/src/components/HealthBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixtureMeta } from '../data/fixture'
import { HealthBar } from './HealthBar'

// 注意:`fixtureMeta` 帶著 `unclassified: ['00999']`,直接拿來測「全部正常」
// 會顯示「1 檔未分類」而失敗。測試要自己建構所測的狀態:
//   const healthy = { ...fixtureMeta, unclassified: [], anomalies: [] }
// 下列各例一律以 healthy 為基底。

describe('HealthBar', () => {
  it('一切正常時顯示更新日期與正常字樣', () => {
    render(<HealthBar meta={healthy} now={new Date('2026-08-21T20:00:00+08:00')} />)
    expect(screen.getByText(/2026\/08\/21/)).toBeInTheDocument()
    expect(screen.getByText(/全部正常/)).toBeInTheDocument()
  })

  it('有未分類標的時列出數量', () => {
    render(
      <HealthBar
        meta={{ ...fixtureMeta, unclassified: ['00999', '00998'] }}
        now={new Date('2026-08-21T20:00:00+08:00')}
      />,
    )
    expect(screen.getByText(/2 檔未分類/)).toBeInTheDocument()
  })

  it('有異常標的時列出數量', () => {
    render(
      <HealthBar
        meta={{ ...fixtureMeta, anomalies: [{ code: '0056', reason: '單日變動異常' }] }}
        now={new Date('2026-08-21T20:00:00+08:00')}
      />,
    )
    expect(screen.getByText(/1 檔價格異常/)).toBeInTheDocument()
  })

  it('資料標記為 stale 時顯示未更新警告', () => {
    render(
      <HealthBar
        meta={{ ...fixtureMeta, is_stale: true }}
        now={new Date('2026-08-21T20:00:00+08:00')}
      />,
    )
    expect(screen.getByText(/資料未更新/)).toBeInTheDocument()
  })

  it('資料超過三天未更新時顯示顯著警告', () => {
    render(
      <HealthBar
        meta={{ ...fixtureMeta, data_date: '2026-08-10' }}
        now={new Date('2026-08-21T20:00:00+08:00')}
      />,
    )
    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(/11 天未更新/)
  })

  it('正常狀態不使用 alert role —— 避免警告疲乏', () => {
    render(<HealthBar meta={fixtureMeta} now={new Date('2026-08-21T20:00:00+08:00')} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- loader HealthBar`
Expected: FAIL — 找不到模組

- [ ] **Step 3: 實作 loader.ts**

```ts
/**
 * 資料載入。
 *
 * 規格 §8.2:載入失敗時顯示明確錯誤,絕不呈現空白表格 ——
 * 空表格會被誤讀為「今天沒有任何 ETF」。
 */
import type { MetaData, RankingsData } from '../types'

const BASE = import.meta.env.BASE_URL ?? '/'

export type LoadResult =
  | { ok: true; rankings: RankingsData; meta: MetaData }
  | { ok: false; error: string }

async function fetchJson<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE}data/${path}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return (await resp.json()) as T
}

export async function loadData(): Promise<LoadResult> {
  try {
    const [rankings, meta] = await Promise.all([
      fetchJson<RankingsData>('rankings.json'),
      fetchJson<MetaData>('meta.json'),
    ])
    return { ok: true, rankings, meta }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `資料載入失敗:${detail}` }
  }
}

export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(`${iso}T00:00:00+08:00`)
  const diff = now.getTime() - then.getTime()
  return Math.floor(diff / 86_400_000)
}
```

- [ ] **Step 4: 實作 HealthBar.tsx**

```tsx
/**
 * 資料健康狀態列。規格 §5.5。
 *
 * 存在理由:資料來自四個免費來源、其中兩個非官方。個人工具最大的隱患
 * 是「不知道今天的數字能不能信」,這條狀態列讓每次看到的數字可被信任。
 */
import { daysSince } from '../data/loader'
import { formatDate } from '../lib/format'
import type { MetaData } from '../types'

const STALE_WARNING_DAYS = 3

interface Props {
  meta: MetaData
  now?: Date
}

export function HealthBar({ meta, now = new Date() }: Props) {
  const age = daysSince(meta.data_date, now)
  const isOld = age > STALE_WARNING_DAYS

  const notes: string[] = []
  if (meta.is_stale) notes.push('資料未更新(來源驗證未通過)')
  if (isOld) notes.push(`已 ${age} 天未更新`)
  if (meta.unclassified.length > 0) {
    notes.push(`${meta.unclassified.length} 檔未分類`)
  }
  if (meta.anomalies.length > 0) {
    notes.push(`${meta.anomalies.length} 檔價格異常`)
  }

  const hasProblem = meta.is_stale || isOld
  const summary = notes.length > 0 ? notes.join(' · ') : '全部正常'

  return (
    <div
      className={`health-bar ${hasProblem ? 'health-bar--warning' : ''}`}
      role={hasProblem ? 'alert' : undefined}
    >
      <span>資料更新至 {formatDate(meta.data_date)}</span>
      <span aria-hidden="true"> · </span>
      <span>{summary}</span>
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd web && npm test -- loader HealthBar`
Expected: 12 passed(實作時另加 2 個:載入半殘不得渲染空表、
未分類與價格異常不觸發 alert,故實際為 14)

- [ ] **Step 6: Commit**

```bash
git add web/src/data/loader.ts web/src/data/loader.test.ts web/src/components/HealthBar.tsx web/src/components/HealthBar.test.tsx
git commit -m "feat(web): 資料載入與健康狀態列"
```

---

## Task 5: 指標詞典與說明彈出視窗

**Files:**
- Create: `web/src/content/glossary.ts`
- Create: `web/src/components/MetricInfo.tsx`
- Test: `web/src/content/glossary.test.ts`
- Test: `web/src/components/MetricInfo.test.tsx`

**Interfaces:**
- Consumes: 無
- Produces:
  - `GLOSSARY: Record<string, GlossaryEntry>`,`GlossaryEntry = { term, what, how, read, pitfall }`
  - `<MetricInfo termId="sharpe" />`

**設計要點:** 規格 §5.7。四個欄位中「怎麼看」是重點 ——
知道 Sharpe 的公式沒有用,知道「1 以上算不錯」才能做決定。
本階段只收錄階段 1 出現的指標,後續階段各自增補。

> **「怎麼算」要寫本站實際的算法,不是教科書公式。** 夏普值就是不同的:
> 1a 的 compute.py 刻意讓分子取近一年報酬、分母取全歷史波動度,好讓使用者
> 能拿畫面上的「一年」欄與「波動度」欄直接驗算(規格 §7 的可檢驗要求)。
> 詞典若寫教科書版,使用者算不出來,只會結論「這網站的數字有問題」。
>
> 另注意本節原本的 `total_return.read` 過不了本節自己的
> 「必須提供可判讀基準」測試 —— 「四到十二」是中文數字,不含 `\d`
> 也不含方向詞。已改寫為含「越…越…」的句子。

- [ ] **Step 1: 寫失敗測試**

`web/src/content/glossary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GLOSSARY } from './glossary'

describe('指標詞典', () => {
  it('涵蓋階段 1 顯示的全部指標', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual([
      'annualized', 'beta', 'cagr', 'mdd', 'premium_discount',
      'sharpe', 'total_return', 'volatility',
    ])
  })

  it('每一筆都具備四個欄位,且沒有空字串', () => {
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term, `${id} 缺 term`).toBeTruthy()
      expect(entry.what, `${id} 缺「是什麼」`).toBeTruthy()
      expect(entry.how, `${id} 缺「怎麼算」`).toBeTruthy()
      expect(entry.read, `${id} 缺「怎麼看」`).toBeTruthy()
      expect(entry.pitfall, `${id} 缺「陷阱」`).toBeTruthy()
    }
  })

  it('「怎麼看」必須提供可判讀的基準,而非重述定義', () => {
    // 判讀基準應含數字門檻或方向詞,否則等於沒說
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      const hasGuidance = /\d|越|愈|高於|低於|接近|大於|小於/.test(entry.read)
      expect(hasGuidance, `${id} 的「怎麼看」沒有給出判讀基準`).toBe(true)
    }
  })
})
```

`web/src/components/MetricInfo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MetricInfo } from './MetricInfo'

describe('MetricInfo', () => {
  it('預設不顯示說明內容', () => {
    render(<MetricInfo termId="sharpe" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('點擊後顯示四段說明', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="sharpe" />)
    await user.click(screen.getByRole('button', { name: /說明/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('是什麼')
    expect(dialog).toHaveTextContent('怎麼算')
    expect(dialog).toHaveTextContent('怎麼看')
    expect(dialog).toHaveTextContent('陷阱')
  })

  it('再次點擊可關閉', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="sharpe" />)
    const btn = screen.getByRole('button', { name: /說明/ })
    await user.click(btn)
    await user.click(btn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('用點擊而非 hover 觸發 —— 手機沒有 hover', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="mdd" />)
    await user.hover(screen.getByRole('button', { name: /說明/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('未知的指標代碼不渲染任何東西,不讓整頁崩潰', () => {
    const { container } = render(<MetricInfo termId="不存在的指標" />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- glossary MetricInfo`
Expected: FAIL — 找不到模組

- [ ] **Step 3: 實作 glossary.ts**

```ts
/**
 * 指標詞典。規格 §5.7。
 *
 * 四個欄位中「怎麼看」是重點:知道公式沒有用,知道數值落在什麼區間
 * 算好才能做決定。撰寫新條目時,read 欄位必須給出可判讀的門檻或方向。
 *
 * 本檔隨階段增量成長。新增指標時同步補上條目,不留到最後補寫。
 */

export interface GlossaryEntry {
  term: string
  what: string
  how: string
  read: string
  pitfall: string
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  total_return: {
    term: '含息總報酬',
    what: '把配息也算進去的完整報酬,不只看股價漲跌。',
    how: '用還原權值股價計算:期末還原價 ÷ 期初還原價 − 1。除息造成的股價下跌已被還原價自動抵銷。',
    read: '這是唯一能公平比較不同 ETF 的口徑。配息越多的標的,價格報酬與含息報酬的差距越大 —— 台股高股息 ETF 一年配息 4 到 12 次,只看股價會嚴重低估它們的真實報酬。',
    pitfall: '外面很多網站的「報酬率」其實是價格報酬,拿來和這裡的數字比會對不起來。比較前先確認對方的口徑。',
  },
  annualized: {
    term: '年化報酬',
    what: '把跨越多年的總報酬,換算成「平均每年賺多少」。',
    how: '(1 + 總報酬) 開 N 次方 − 1,N 為年數。',
    read: '只有一年以上的期間才提供年化數字。三年賺 45% 聽起來很多,年化後是 13%,這才是能和定存、其他標的比較的基準。',
    pitfall: '年化是平均值,不代表每年都賺這麼多。中間可能先跌 30% 再漲回來,年化數字看不出這段過程,要搭配最大回撤一起看。',
  },
  cagr: {
    term: '複合年均成長率(CAGR)',
    what: '年化報酬的正式名稱,考慮複利效果的平均年報酬。',
    how: '(期末值 ÷ 期初值) 開 N 次方 − 1。',
    read: '長期投資看這個數字。台股大盤長期 CAGR 約 8% 上下,明顯高於此值的標的要先確認是不是承擔了更高風險。',
    pitfall: '期間選擇會大幅影響結果。從 2008 年低點起算和從 2007 年高點起算,同一檔 ETF 的 CAGR 可能差一倍以上。',
  },
  volatility: {
    term: '年化波動度',
    what: '價格上下震盪的劇烈程度,是風險最常用的量化指標。',
    how: '取這檔**全部歷史**的每日報酬率算標準差,再乘以 √252(一年約 252 個交易日)。少於 60 個交易日不計算。',
    read: '數字越大代表波動越劇烈。台股市值型 ETF 大約 15–20%,高股息型通常略低,槓桿型可達 35% 以上。',
    pitfall: '波動度把上漲和下跌一視同仁,但投資人只怕下跌。一檔只往上衝的標的波動度也會很高,不代表它危險。',
  },
  mdd: {
    term: '最大回撤(MDD)',
    what: '歷史上從最高點跌到最低點,最深跌掉多少。',
    how: '掃過整段歷史,找出「相對於此前最高價」跌幅最深的那一刻。',
    read: '這是最貼近實際痛感的風險指標。−35% 代表你曾經在帳面上少掉三分之一。問自己:這個數字發生在我身上,我抱得住嗎?',
    pitfall: '只反映已發生過的歷史。ETF 上市時間短的話,它可能根本還沒經歷過一次真正的空頭,數字漂亮是因為沒被考驗過。',
  },
  sharpe: {
    term: '夏普值(Sharpe Ratio)',
    what: '每承擔一單位風險,換到多少超額報酬。用來比較「賺得值不值」。',
    how: '(近一年報酬 − 無風險利率) ÷ 年化波動度,無風險利率預設 1.5%。注意分子取近一年、分母取全部歷史,兩者期間刻意不同 —— 這樣你才能拿表格上「一年」欄與「波動度」欄的數字直接驗算出這個值。',
    read: '大於 1 算不錯,大於 2 要先懷疑是不是期間太短或資料有問題。低於 0 代表報酬還輸給定存,承擔的風險完全沒換到東西。',
    pitfall: '空頭期間分子為負,此時夏普值的大小沒有意義(波動越大反而看起來越不糟)。負值時只要知道「不好」即可,不必比較誰負得少。',
  },
  beta: {
    term: '貝他值(Beta)',
    what: '相對於大盤的敏感度。大盤動 1%,這檔平均動多少。',
    how: '對加權報酬指數做迴歸:Cov(標的, 大盤) ÷ Var(大盤)。',
    read: '接近 1 代表跟著大盤走;大於 1 漲跌都比大盤兇;小於 1 較溫和;負值代表和大盤反向(反向型 ETF 約 −1)。',
    pitfall: '產業型或海外型 ETF 的 Beta 參考價值低,因為它們本來就不追蹤台股大盤,迴歸出來的關係可能只是巧合。',
  },
  premium_discount: {
    term: '折溢價',
    what: '市場成交價和 ETF 真實淨值之間的落差。',
    how: '(市價 − 淨值) ÷ 淨值。正值為溢價(買貴了),負值為折價(買便宜了)。',
    read: '正常應該貼近 0。超過 +2% 代表市場過熱、你要用高於真實價值的錢去買;台股 ETF 在題材熱絡時溢價衝到 5% 以上並不罕見。',
    pitfall: '溢價買進後若溢價收斂,即使淨值沒跌你也會賠錢。追熱門新 ETF 前務必先看這個數字。',
  },
}
```

- [ ] **Step 4: 實作 MetricInfo.tsx**

```tsx
/**
 * 指標說明彈出視窗。規格 §5.7。
 *
 * 刻意用點擊觸發而非 hover:手機沒有 hover,用 hover 等於在手機上
 * 完全無法閱讀說明,而排行榜的手機使用比重不低。
 */
import { useState } from 'react'
import { GLOSSARY } from '../content/glossary'

interface Props {
  termId: string
}

export function MetricInfo({ termId }: Props) {
  const [open, setOpen] = useState(false)
  const entry = GLOSSARY[termId]

  if (!entry) return null

  return (
    <span className="metric-info">
      <button
        type="button"
        className="metric-info__trigger"
        aria-label={`${entry.term}說明`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⓘ
      </button>
      {open && (
        <div className="metric-info__popover" role="dialog" aria-label={`${entry.term}說明`}>
          <h4>{entry.term}</h4>
          <dl>
            <dt>是什麼</dt>
            <dd>{entry.what}</dd>
            <dt>怎麼算</dt>
            <dd>{entry.how}</dd>
            <dt>怎麼看</dt>
            <dd>{entry.read}</dd>
            <dt>陷阱</dt>
            <dd>{entry.pitfall}</dd>
          </dl>
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd web && npm test -- glossary MetricInfo`
Expected: 8 passed

- [ ] **Step 6: Commit**

```bash
git add web/src/content/ web/src/components/MetricInfo.tsx web/src/components/MetricInfo.test.tsx
git commit -m "feat(web): 指標詞典與說明彈出視窗"
```

---

## Task 6: 排行表格

**Files:**
- Create: `web/src/components/RankingTable.tsx`
- Test: `web/src/components/RankingTable.test.tsx`

**Interfaces:**
- Consumes: `EtfRow`、`PeriodCode` (Task 1);`toSortable` (Task 2);
  `formatPercent`、`formatNumber` (Task 3);`MetricInfo` (Task 5)
- Produces: `<RankingTable rows={...} visibleColumns={...} sortBy={...} onSortChange={...} />`

- [ ] **Step 1: 寫失敗測試**

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fixtureRankings } from '../data/fixture'
import { RankingTable } from './RankingTable'

const ROWS = fixtureRankings.etfs

function renderTable(props: Partial<Parameters<typeof RankingTable>[0]> = {}) {
  return render(
    <RankingTable
      rows={ROWS}
      visibleColumns={['D1', 'M1', 'Y1', 'Y10']}
      sortBy="Y1"
      onSortChange={vi.fn()}
      {...props}
    />,
  )
}

function bodyRowCodes(): string[] {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  return rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent!.trim())
}

describe('RankingTable', () => {
  it('每一列都渲染出來', () => {
    renderTable()
    expect(bodyRowCodes()).toHaveLength(ROWS.length)
  })

  it('只顯示指定的期間欄位', () => {
    renderTable({ visibleColumns: ['D1', 'Y1'] })
    expect(screen.getByRole('columnheader', { name: /當日/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /一年/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /十年/ })).not.toBeInTheDocument()
  })

  it('預設依指定欄位降冪排序', () => {
    renderTable({ sortBy: 'Y1' })
    // fixture 中 Y1 最高者為 00631L(38.22%)
    expect(bodyRowCodes()[0]).toBe('00631L')
  })

  it('資料不足的欄位顯示破折號而非 0', () => {
    renderTable({ visibleColumns: ['Y10'] })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('00929'))!
    expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('—')
  })

  // 注意:fixture 中**三**檔沒有十年資料(00929、00679B、00999),不是兩檔 ——
  // 00679B 的 returns 只到 Y5。硬寫 slice(-2) 會失敗。改由資料推導,
  // 動 fixture 時測試才不會莫名變紅。
  //   function codesWithoutData(p) {
  //     return ROWS.filter((r) => r.returns[p] === null).map((r) => r.code).sort()
  //   }
  it('依 Y10 降冪時,資料不足者排在最末', () => {
    renderTable({ sortBy: 'Y10' })
    const missing = codesWithoutData('Y10')
    expect(bodyRowCodes().slice(-missing.length).sort()).toEqual(missing)
  })

  it('依 Y10 升冪時,資料不足者仍排在最末', async () => {
    const user = userEvent.setup()
    renderTable({ sortBy: 'Y10' })
    await user.click(screen.getByRole('columnheader', { name: /十年/ }))
    const missing = codesWithoutData('Y10')
    expect(bodyRowCodes().slice(-missing.length).sort()).toEqual(missing)
  })

  it('點擊欄位標頭會通知外部排序變更', async () => {
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    renderTable({ onSortChange })
    await user.click(screen.getByRole('columnheader', { name: /當日/ }))
    expect(onSortChange).toHaveBeenCalledWith('D1')
  })

  // aria-label 是「夏普值(Sharpe Ratio)說明」(詞條名含括號),
  // 故 /夏普值說明/ 對不上,要用 /夏普值.*說明/。
  it('風險欄位標頭附帶指標說明按鈕', () => {
    renderTable({ visibleColumns: [], showRisk: true })
    expect(screen.getByRole('button', { name: /夏普值.*說明/ })).toBeInTheDocument()
  })

  it('空資料時顯示提示而非空白表格', () => {
    renderTable({ rows: [] })
    expect(screen.getByText(/沒有符合條件的 ETF/)).toBeInTheDocument()
  })

  it('報酬以百分比呈現並帶正負號', () => {
    renderTable({ visibleColumns: ['D1'] })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('0050'))!
    expect(within(row).getByText('+0.52%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- RankingTable`
Expected: FAIL — 找不到 `./RankingTable`

- [ ] **Step 3: 實作 RankingTable.tsx**

```tsx
/**
 * 績效排行表格。規格 §5.2。
 *
 * 排序關鍵:資料不足(null)者不論升冪降冪都排在最末,由
 * nullsLastSortingFn 搭配 sortUndefined 保證(規格 §4.3)。
 */
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { formatNumber, formatPercent } from '../lib/format'
import { toSortable } from '../lib/sorting'
import { PERIOD_LABELS, type EtfRow, type PeriodCode } from '../types'
import { MetricInfo } from './MetricInfo'

const helper = createColumnHelper<EtfRow>()

interface Props {
  rows: EtfRow[]
  visibleColumns: PeriodCode[]
  sortBy: PeriodCode | null
  onSortChange: (period: PeriodCode) => void
  showRisk?: boolean
}

export function RankingTable({
  rows, visibleColumns, sortBy, onSortChange, showRisk = false,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>(
    sortBy ? [{ id: sortBy, desc: true }] : [],
  )

  const columns = useMemo(() => {
    const base = [
      helper.accessor('code', {
        header: '代號',
        cell: (c) => c.getValue(),
        enableSorting: false,
      }),
      helper.accessor('name', {
        header: '名稱',
        cell: (c) => c.getValue(),
        enableSorting: false,
      }),
      helper.accessor('category', {
        header: '分類',
        cell: (c) => c.getValue() ?? '—',
        enableSorting: false,
      }),
      helper.accessor('close', {
        header: '現價',
        cell: (c) => formatNumber(c.getValue(), 2),
      }),
    ]

    const periodCols = visibleColumns.map((p) =>
      helper.accessor((row) => toSortable(row.returns[p]), {
        id: p,
        header: PERIOD_LABELS[p],
        cell: (c) => formatPercent(c.getValue() ?? null),
        sortUndefined: 'last',
      }),
    )

    const riskCols = showRisk
      ? [
          helper.accessor((row) => toSortable(row.risk.volatility), {
            id: 'volatility',
            header: () => (<span>年化波動 <MetricInfo termId="volatility" /></span>),
            cell: (c) => formatPercent(c.getValue() ?? null),
            sortUndefined: 'last',
          }),
          helper.accessor((row) => toSortable(row.risk.mdd), {
            id: 'mdd',
            header: () => (<span>最大回撤 <MetricInfo termId="mdd" /></span>),
            cell: (c) => formatPercent(c.getValue() ?? null),
            sortUndefined: 'last',
          }),
          helper.accessor((row) => toSortable(row.risk.sharpe), {
            id: 'sharpe',
            header: () => (<span>夏普值 <MetricInfo termId="sharpe" /></span>),
            cell: (c) => formatNumber(c.getValue() ?? null, 2),
            sortUndefined: 'last',
          }),
          helper.accessor((row) => toSortable(row.premium_discount), {
            id: 'premium_discount',
            header: () => (<span>折溢價 <MetricInfo termId="premium_discount" /></span>),
            cell: (c) => formatPercent(c.getValue() ?? null),
            sortUndefined: 'last',
          }),
        ]
      : []

    return [...base, ...periodCols, ...riskCols]
  }, [visibleColumns, showRisk])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (rows.length === 0) {
    return <p className="empty-state">沒有符合條件的 ETF。試著放寬篩選條件。</p>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const isPeriod = (visibleColumns as string[]).includes(header.column.id)
                return (
                  <th
                    key={header.id}
                    onClick={
                      canSort
                        ? () => {
                            header.column.toggleSorting()
                            if (isPeriod) onSortChange(header.column.id as PeriodCode)
                          }
                        : undefined
                    }
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd web && npm test -- RankingTable`
Expected: 13 passed(原 10 個,加上實作時發現的三個:說明鈕不得順帶排序、
外部改變 sortBy 要重新排序、sortBy 指向未顯示欄位時不排序)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RankingTable.tsx web/src/components/RankingTable.test.tsx
git commit -m "feat(web): 排行表格,資料不足者恆置底"
```

---

## Task 7: 期間按鈕與欄位自選

**Files:**
- Create: `web/src/components/PeriodTabs.tsx`
- Create: `web/src/components/ColumnPicker.tsx`
- Test: `web/src/components/PeriodTabs.test.tsx`
- Test: `web/src/components/ColumnPicker.test.tsx`

**Interfaces:**
- Consumes: `PERIODS`、`PERIOD_LABELS`、`PeriodCode` (Task 1);`DEFAULT_PREFS` (Task 3)
- Produces:
  - `<PeriodTabs active={...} onSelect={...} />`
  - `<ColumnPicker selected={...} onChange={...} />`

**設計要點:** 規格 §5.2 的連帶規則 ——
點選的期間若當前未勾選顯示,該欄位須自動加入顯示。
排序一個看不見的欄位會讓人完全摸不著頭緒。此規則在 Task 8 的 App 組裝時接上。

- [ ] **Step 1: 寫失敗測試**

`web/src/components/PeriodTabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PeriodTabs } from './PeriodTabs'

describe('PeriodTabs', () => {
  it('列出全部十一個期間', () => {
    render(<PeriodTabs active="Y1" onSelect={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(11)
  })

  it('標示當前作用中的期間', () => {
    render(<PeriodTabs active="Y1" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: '一年' })).toHaveAttribute(
      'aria-pressed', 'true',
    )
    expect(screen.getByRole('button', { name: '三年' })).toHaveAttribute(
      'aria-pressed', 'false',
    )
  })

  it('點擊後回報選取的期間代碼', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PeriodTabs active="Y1" onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: '三月' }))
    expect(onSelect).toHaveBeenCalledWith('M3')
  })

  it('顯示中文期間名稱而非代碼', () => {
    render(<PeriodTabs active="Y1" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: '成立以來' })).toBeInTheDocument()
    expect(screen.queryByText('INCEPTION')).not.toBeInTheDocument()
  })
})
```

`web/src/components/ColumnPicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColumnPicker } from './ColumnPicker'

describe('ColumnPicker', () => {
  it('預設收合,點擊後展開', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={vi.fn()} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    expect(screen.getByRole('group')).toBeInTheDocument()
  })

  it('已選欄位顯示為勾選狀態', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1', 'Y3']} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    expect(screen.getByRole('checkbox', { name: '一年' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '一週' })).not.toBeChecked()
  })

  it('勾選新欄位會加入選取清單', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '十年' }))
    expect(onChange).toHaveBeenCalledWith(['Y1', 'Y10'])
  })

  it('取消勾選會自清單移除', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1', 'Y3']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))
    expect(onChange).toHaveBeenCalledWith(['Y3'])
  })

  it('回到預設會還原成規格指定的五個期間', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y10']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('button', { name: /回到預設/ }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'M1', 'M3', 'Y1', 'Y3'])
  })

  it('不允許取消到一個欄位都不剩', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('選取結果依規格的期間順序排列,而非點選順序', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y10']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '當日' }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'Y10'])
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- PeriodTabs ColumnPicker`
Expected: FAIL — 找不到模組

- [ ] **Step 3: 實作 PeriodTabs.tsx**

```tsx
/** 期間快速排序按鈕列。規格 §5.2。 */
import { PERIODS, PERIOD_LABELS, type PeriodCode } from '../types'

interface Props {
  active: PeriodCode | null
  onSelect: (period: PeriodCode) => void
}

export function PeriodTabs({ active, onSelect }: Props) {
  return (
    <div className="period-tabs" role="toolbar" aria-label="選擇排序期間">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={active === p}
          onClick={() => onSelect(p)}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 實作 ColumnPicker.tsx**

```tsx
/**
 * 欄位自選。規格 §5.2。
 *
 * 十一個期間全部顯示會爆版(尤其手機),故由使用者自選,
 * 選擇存於 localStorage 下次沿用。
 */
import { useState } from 'react'
import { DEFAULT_PREFS } from '../lib/prefs'
import { PERIODS, PERIOD_LABELS, type PeriodCode } from '../types'

interface Props {
  selected: PeriodCode[]
  onChange: (next: PeriodCode[]) => void
}

export function ColumnPicker({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)

  function toggle(period: PeriodCode) {
    const isOn = selected.includes(period)
    // 全部取消會留下一張只有代號名稱的表,沒有意義,故至少保留一欄
    if (isOn && selected.length === 1) return
    const next = isOn
      ? selected.filter((p) => p !== period)
      : [...selected, period]
    // 依規格的期間順序排列,而非使用者的點選順序
    onChange(PERIODS.filter((p) => next.includes(p)))
  }

  return (
    <div className="column-picker">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        欄位
      </button>
      {open && (
        <div className="column-picker__menu" role="group" aria-label="選擇顯示欄位">
          {PERIODS.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={selected.includes(p)}
                onChange={() => toggle(p)}
              />
              {PERIOD_LABELS[p]}
            </label>
          ))}
          <button type="button" onClick={() => onChange([...DEFAULT_PREFS.visibleColumns])}>
            回到預設
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd web && npm test -- PeriodTabs ColumnPicker`
Expected: 11 passed

- [ ] **Step 6: Commit**

```bash
git add web/src/components/PeriodTabs.tsx web/src/components/PeriodTabs.test.tsx web/src/components/ColumnPicker.tsx web/src/components/ColumnPicker.test.tsx
git commit -m "feat(web): 期間按鈕與欄位自選"
```

---

## Task 8: 篩選器

**Files:**
- Create: `web/src/components/Filters.tsx`
- Create: `web/src/lib/filtering.ts`
- Test: `web/src/lib/filtering.test.ts`
- Test: `web/src/components/Filters.test.tsx`

**Interfaces:**
- Consumes: `EtfRow` (Task 1)
- Produces:
  - `applyFilters(rows, { categories, query, showLevered }): EtfRow[]`
  - `<Filters categories={...} selected={...} query={...} showLevered={...} on*={...} />`

- [ ] **Step 1: 寫失敗測試**

`web/src/lib/filtering.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fixtureRankings } from '../data/fixture'
import { applyFilters, collectCategories } from './filtering'

const ROWS = fixtureRankings.etfs
const NONE = { categories: [], query: '', showLevered: false }

describe('applyFilters', () => {
  it('預設隱藏槓桿與反向標的', () => {
    const out = applyFilters(ROWS, NONE)
    expect(out.some((r) => r.is_leveraged || r.is_inverse)).toBe(false)
  })

  it('開啟開關後顯示槓桿與反向標的', () => {
    const out = applyFilters(ROWS, { ...NONE, showLevered: true })
    expect(out.some((r) => r.is_leveraged)).toBe(true)
    expect(out.some((r) => r.is_inverse)).toBe(true)
  })

  it('依分類篩選', () => {
    const out = applyFilters(ROWS, { ...NONE, categories: ['高股息'] })
    expect(out.map((r) => r.code).sort()).toEqual(['0056', '00929'])
  })

  it('多個分類為聯集', () => {
    const out = applyFilters(ROWS, { ...NONE, categories: ['高股息', '市值型'] })
    expect(out).toHaveLength(3)
  })

  it('以代號搜尋', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '0050' }).map((r) => r.code))
      .toEqual(['0050'])
  })

  it('以名稱搜尋', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '高股息' }).map((r) => r.code))
      .toEqual(['0056'])
  })

  it('搜尋忽略前後空白', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '  0050  ' })).toHaveLength(1)
  })

  it('搜尋不分大小寫,B 結尾代號可用小寫查到', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '00679b', showLevered: true }))
      .toHaveLength(1)
  })

  it('分類與搜尋同時作用時取交集', () => {
    const out = applyFilters(ROWS, { ...NONE, categories: ['高股息'], query: '復華' })
    expect(out.map((r) => r.code)).toEqual(['00929'])
  })

  it('無結果時回傳空陣列,不拋錯', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '不存在的標的' })).toEqual([])
  })
})

// 注意:本節原本的實作用 `localeCompare(b, 'zh-Hant')`,實測得到的是筆畫序
// ['反向型','市值型','未分類','高股息','債券型','槓桿型'],與本測試原本期望的
// code point 序完全不同 —— 實作與測試互相矛盾。兩種機器排序對中文讀者都沒有
// 意義,且 localeCompare 還相依於執行環境的 ICU 資料。已改為依規格的分類順序
// 寫死(見 filtering.ts 的 CATEGORY_ORDER),未分類與未知分類墊底。
describe('collectCategories', () => {
  it('依規格的分類順序排列,未分類與未知分類墊底', () => {
    expect(collectCategories(ROWS)).toEqual([
      '市值型', '高股息', '債券型', '槓桿型', '反向型', '未分類',
    ])
  })
})
```

`web/src/components/Filters.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Filters } from './Filters'

const PROPS = {
  categories: ['市值型', '高股息', '債券型'],
  selected: [] as string[],
  query: '',
  showLevered: false,
  onCategoriesChange: vi.fn(),
  onQueryChange: vi.fn(),
  onShowLeveredChange: vi.fn(),
}

describe('Filters', () => {
  it('每個分類渲染成一個可切換的按鈕', () => {
    render(<Filters {...PROPS} />)
    expect(screen.getByRole('button', { name: '市值型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '債券型' })).toBeInTheDocument()
  })

  it('點擊分類會加入選取', async () => {
    const onCategoriesChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onCategoriesChange={onCategoriesChange} />)
    await user.click(screen.getByRole('button', { name: '高股息' }))
    expect(onCategoriesChange).toHaveBeenCalledWith(['高股息'])
  })

  it('再次點擊已選分類會取消', async () => {
    const onCategoriesChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} selected={['高股息']} onCategoriesChange={onCategoriesChange} />)
    await user.click(screen.getByRole('button', { name: '高股息' }))
    expect(onCategoriesChange).toHaveBeenCalledWith([])
  })

  it('搜尋框輸入時回報內容', async () => {
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onQueryChange={onQueryChange} />)
    await user.type(screen.getByRole('searchbox'), '0050')
    expect(onQueryChange).toHaveBeenCalled()
  })

  it('槓桿反向開關預設為關', () => {
    render(<Filters {...PROPS} />)
    expect(screen.getByRole('checkbox', { name: /槓桿|反向/ })).not.toBeChecked()
  })

  it('切換槓桿反向開關會回報', async () => {
    const onShowLeveredChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onShowLeveredChange={onShowLeveredChange} />)
    await user.click(screen.getByRole('checkbox', { name: /槓桿|反向/ }))
    expect(onShowLeveredChange).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- filtering Filters`
Expected: FAIL — 找不到模組

- [ ] **Step 3: 實作 filtering.ts**

```ts
/**
 * 篩選邏輯。純函式,與 UI 分離以便測試。
 *
 * 槓桿與反向 ETF 預設隱藏(規格 §3.4):它們的長期報酬本質上不可與
 * 現股型比較,混在同一張榜單會使排名失去意義。
 */
import type { EtfRow } from '../types'

export interface FilterState {
  categories: string[]
  query: string
  showLevered: boolean
}

export function applyFilters(rows: EtfRow[], state: FilterState): EtfRow[] {
  const q = state.query.trim().toLowerCase()

  return rows.filter((row) => {
    if (!state.showLevered && (row.is_leveraged || row.is_inverse)) return false

    if (state.categories.length > 0) {
      if (!row.category || !state.categories.includes(row.category)) return false
    }

    if (q) {
      const haystack = `${row.code} ${row.name}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}

export function collectCategories(rows: EtfRow[]): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    if (row.category) set.add(row.category)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}
```

- [ ] **Step 4: 實作 Filters.tsx**

```tsx
/** 篩選列:分類 chips、搜尋、槓桿反向開關。規格 §5.2。 */
interface Props {
  categories: string[]
  selected: string[]
  query: string
  showLevered: boolean
  onCategoriesChange: (next: string[]) => void
  onQueryChange: (next: string) => void
  onShowLeveredChange: (next: boolean) => void
}

export function Filters({
  categories, selected, query, showLevered,
  onCategoriesChange, onQueryChange, onShowLeveredChange,
}: Props) {
  function toggle(category: string) {
    onCategoriesChange(
      selected.includes(category)
        ? selected.filter((c) => c !== category)
        : [...selected, category],
    )
  }

  return (
    <div className="filters">
      <div className="filters__chips">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={selected.includes(c)}
            onClick={() => toggle(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="搜尋代號或名稱"
        aria-label="搜尋代號或名稱"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      <label className="filters__toggle">
        <input
          type="checkbox"
          checked={showLevered}
          onChange={(e) => onShowLeveredChange(e.target.checked)}
        />
        顯示槓桿與反向 ETF
      </label>
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd web && npm test -- filtering Filters`
Expected: 25 passed(原 17 個,加上實作時補的邊界:槓桿篩選優先於分類篩選、
搜尋不看分類、不修改傳入陣列、分類去重與空分類、未知分類墊底、
已選分類的 aria-pressed、無分類時不渲染空按鈕列)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/filtering.ts web/src/lib/filtering.test.ts web/src/components/Filters.tsx web/src/components/Filters.test.tsx
git commit -m "feat(web): 分類、搜尋與槓桿反向篩選"
```

---

## Task 9: App 組裝與連帶規則

**Files:**
- Create: `web/src/App.tsx`
- Create: `web/src/main.tsx`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 1–8 的全部模組
- Produces: `<App />` 完整頁面

**設計要點:** 本任務接上規格 §5.2 的**連帶規則** ——
點選的期間若當前未在顯示欄位中,自動加入顯示。

- [ ] **Step 1: 寫失敗測試**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fixtureMeta, fixtureRankings } from './data/fixture'

function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('meta') ? fixtureMeta : fixtureRankings),
  })))
}

beforeEach(() => {
  localStorage.clear()
  mockFetchOk()
})
afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it('載入中顯示提示', () => {
    render(<App />)
    expect(screen.getByText(/載入中/)).toBeInTheDocument()
  })

  it('載入完成後顯示表格與健康狀態列', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText(/資料更新至/)).toBeInTheDocument()
  })

  it('載入失敗時顯示錯誤訊息,不顯示空表格', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    render(<App />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/載入失敗/))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('預設顯示規格指定的五個期間欄位', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    for (const label of ['當日', '一月', '三月', '一年', '三年']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(label) }))
        .toBeInTheDocument()
    }
    expect(screen.queryByRole('columnheader', { name: /^十年/ })).not.toBeInTheDocument()
  })

  it('點擊未顯示的期間按鈕會自動把該欄位加入顯示', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    expect(screen.queryByRole('columnheader', { name: /^十年/ })).not.toBeInTheDocument()

    const tabs = screen.getByRole('toolbar', { name: /排序期間/ })
    await user.click(within(tabs).getByRole('button', { name: '十年' }))

    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /^十年/ })).toBeInTheDocument(),
    )
  })

  it('欄位選擇會存入 localStorage', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    const tabs = screen.getByRole('toolbar', { name: /排序期間/ })
    await user.click(within(tabs).getByRole('button', { name: '十年' }))

    await waitFor(() => {
      const raw = localStorage.getItem('alpha-track:prefs')
      expect(raw).toContain('Y10')
    })
  })

  it('分類篩選會即時縮減表格列數', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    const before = within(screen.getByRole('table')).getAllByRole('row').length
    await user.click(screen.getByRole('button', { name: '高股息' }))
    await waitFor(() => {
      const after = within(screen.getByRole('table')).getAllByRole('row').length
      expect(after).toBeLessThan(before)
    })
  })

  it('槓桿反向標的預設不出現在表格中', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(within(screen.getByRole('table')).queryByText('00631L')).not.toBeInTheDocument()
  })

  it('顯示無風險利率,使夏普值可被檢驗', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText(/無風險利率 1\.50%/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- App`
Expected: FAIL — 找不到 `./App`

- [ ] **Step 3: 實作 App.tsx**

```tsx
/**
 * 排行榜頁面組裝。規格 §5.2。
 *
 * 連帶規則:點選的期間若當前未在顯示欄位中,自動加入顯示。
 * 排序一個看不見的欄位會讓使用者完全摸不著頭緒。
 */
import { useEffect, useMemo, useState } from 'react'
import { ColumnPicker } from './components/ColumnPicker'
import { Filters } from './components/Filters'
import { HealthBar } from './components/HealthBar'
import { PeriodTabs } from './components/PeriodTabs'
import { RankingTable } from './components/RankingTable'
import { loadData, type LoadResult } from './data/loader'
import { applyFilters, collectCategories } from './lib/filtering'
import { formatPercent } from './lib/format'
import { loadPrefs, savePrefs } from './lib/prefs'
import { PERIODS, type PeriodCode } from './types'

export function App() {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [prefs, setPrefs] = useState(() => loadPrefs())
  const [sortBy, setSortBy] = useState<PeriodCode>('Y1')
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void loadData().then(setResult)
  }, [])

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  function handlePeriodSelect(period: PeriodCode) {
    setSortBy(period)
    // 連帶規則:排序看不見的欄位會造成困惑,故自動加入顯示
    if (!prefs.visibleColumns.includes(period)) {
      setPrefs((p) => ({
        ...p,
        visibleColumns: PERIODS.filter(
          (x) => p.visibleColumns.includes(x) || x === period,
        ),
      }))
    }
  }

  const allRows = result?.ok ? result.rankings.etfs : []
  const availableCategories = useMemo(() => collectCategories(allRows), [allRows])
  const rows = useMemo(
    () => applyFilters(allRows, { categories, query, showLevered: prefs.showLevered }),
    [allRows, categories, query, prefs.showLevered],
  )

  if (result === null) {
    return <main className="app"><p>載入中…</p></main>
  }

  if (!result.ok) {
    return (
      <main className="app">
        <p role="alert" className="error">
          {result.error}
          <br />
          請確認 pipeline 已執行過,且 <code>public/data/</code> 下有 JSON 檔。
        </p>
      </main>
    )
  }

  return (
    <main className="app">
      <header>
        <h1>台股 ETF 績效排行</h1>
        <HealthBar meta={result.meta} />
      </header>

      <PeriodTabs active={sortBy} onSelect={handlePeriodSelect} />

      <div className="controls">
        <Filters
          categories={availableCategories}
          selected={categories}
          query={query}
          showLevered={prefs.showLevered}
          onCategoriesChange={setCategories}
          onQueryChange={setQuery}
          onShowLeveredChange={(v) => setPrefs((p) => ({ ...p, showLevered: v }))}
        />
        <ColumnPicker
          selected={prefs.visibleColumns}
          onChange={(next) => setPrefs((p) => ({ ...p, visibleColumns: next }))}
        />
      </div>

      <RankingTable
        rows={rows}
        visibleColumns={prefs.visibleColumns}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showRisk
      />

      <footer>
        {/* 組成單一字串:拆成多個 JSX 節點會讓 getByText 的正則比對不到,
            而且螢幕閱讀器也會把它讀成斷開的片段。 */}
        <p>
          {`報酬皆為含息總報酬 · 夏普值使用無風險利率 ${
            formatPercent(result.meta.risk_free_rate).replace('+', '')
          } · 「—」代表該期間資料不足`}
        </p>
      </footer>
    </main>
  )
}
```

- [ ] **Step 4: 實作 main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: 建立 fixture JSON 供開發使用**

Node 無法直接 import `.ts`,故寫一支用 vite-node 執行的產生腳本。

建立 `web/scripts/write-fixture.ts`:

```ts
/**
 * 把 fixture 寫成 JSON,供 npm run dev 在階段 1a 完成前使用。
 * 階段 1a 上線後,pipeline 的真實產出會覆蓋這兩個檔案。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureMeta, fixtureRankings } from '../src/data/fixture'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'rankings.json'), JSON.stringify(fixtureRankings), 'utf-8')
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(fixtureMeta), 'utf-8')
console.log(`已寫入 ${outDir}`)
```

在 `web/package.json` 的 `scripts` 加入:

```json
"fixture": "vite-node scripts/write-fixture.ts"
```

並把 `vite-node` 加入 `devDependencies`:

```json
"vite-node": "^2.1.0"
```

Run: `cd web && npm install && npm run fixture`
Expected: 印出寫入路徑,且 `web/public/data/` 下出現兩個 JSON 檔

- [ ] **Step 6: 執行測試確認通過**

Run: `cd web && npm test -- App`
Expected: 9 passed

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/main.tsx web/public/data/
git commit -m "feat(web): 頁面組裝與期間欄位連帶規則"
```

---

## Task 10: 樣式、響應式與主題

**Files:**
- Create: `web/src/styles.css`
- Test: `web/src/styles.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: 完整樣式表

**設計要點:** 規格 §5.4 —— 排行榜於窄螢幕**凍結代號與名稱欄、其餘橫向捲動**,
不拆成卡片。排行榜的價值在於並排比較,卡片化會摧毀這個價值。

- [ ] **Step 1: 寫失敗測試**

CSS 難以做行為測試,故驗證關鍵規則存在且結構正確:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'styles.css'), 'utf-8')

describe('樣式表', () => {
  it('在 :root 定義完整的淺色調色盤', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--bg:/)
    expect(css).toMatch(/:root\s*\{[^}]*--fg:/)
  })

  it('深色主題透過 prefers-color-scheme 覆寫', () => {
    expect(css).toContain('prefers-color-scheme: dark')
  })

  it('body 有明確的背景色,不依賴瀏覽器預設', () => {
    expect(css).toMatch(/body\s*\{[^}]*background:/)
  })

  it('表格容器可橫向捲動', () => {
    expect(css).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/)
  })

  it('窄螢幕時凍結前兩欄', () => {
    expect(css).toContain('position: sticky')
    expect(css).toMatch(/@media[^{]*max-width/)
  })

  it('正負報酬使用不同顏色,且不只靠顏色區分', () => {
    expect(css).toMatch(/--gain:/)
    expect(css).toMatch(/--loss:/)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd web && npm test -- styles`
Expected: FAIL — 找不到 `styles.css`

- [ ] **Step 3: 實作 styles.css**

```css
/* 台股 ETF 績效排行 —— 樣式表
 *
 * 響應式策略(規格 §5.4):窄螢幕凍結代號與名稱欄、其餘橫向捲動。
 * 刻意不拆成卡片:排行榜的價值就在並排比較,卡片化會摧毀這個價值。
 */

:root {
  --bg: #ffffff;
  --surface: #f7f8fa;
  --fg: #1a1d21;
  --fg-muted: #6b7280;
  --border: #e5e7eb;
  --accent: #2563eb;
  --gain: #c2410c;
  --loss: #15803d;
  --warn-bg: #fef3c7;
  --warn-fg: #92400e;
  --radius: 6px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --surface: #1a1d23;
    --fg: #e5e7eb;
    --fg-muted: #9ca3af;
    --border: #2d323b;
    --accent: #60a5fa;
    --gain: #fb923c;
    --loss: #4ade80;
    --warn-bg: #422006;
    --warn-fg: #fcd34d;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, "Noto Sans TC", sans-serif;
  font-size: 15px;
  line-height: 1.5;
}

.app { max-width: 1400px; margin: 0 auto; padding: 1rem; }

h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }

/* 健康狀態列 —— 規格 §5.5 */
.health-bar {
  font-size: 0.875rem;
  color: var(--fg-muted);
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border-radius: var(--radius);
}

.health-bar--warning {
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-weight: 600;
}

/* 期間按鈕列 */
.period-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 1rem 0;
}

.period-tabs button {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 0.875rem;
}

.period-tabs button[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* 控制列 */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.filters { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.filters__chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }

.filters__chips button {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 0.8125rem;
}

.filters__chips button[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.filters input[type="search"] {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--fg);
}

.filters__toggle {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8125rem;
  color: var(--fg-muted);
}

/* 欄位自選 */
.column-picker { position: relative; }

.column-picker > button {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
}

.column-picker__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
  min-width: 180px;
  padding: 0.5rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}

.column-picker__menu label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
}

/* 表格 —— 橫向捲動,不使 body 橫捲 */
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }

th, td {
  padding: 0.5rem 0.75rem;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
}

th:nth-child(1), td:nth-child(1),
th:nth-child(2), td:nth-child(2),
th:nth-child(3), td:nth-child(3) { text-align: left; }

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface);
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--fg-muted);
}

tbody tr:hover { background: var(--surface); }

/* 窄螢幕:凍結代號與名稱欄 */
@media (max-width: 768px) {
  th:nth-child(1), td:nth-child(1) {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--bg);
  }
  th:nth-child(2), td:nth-child(2) {
    position: sticky;
    left: 60px;
    z-index: 1;
    background: var(--bg);
  }
  thead th:nth-child(1), thead th:nth-child(2) { z-index: 3; background: var(--surface); }
  th, td { padding: 0.4rem 0.5rem; font-size: 0.8125rem; }
}

/* 指標說明 */
.metric-info { position: relative; display: inline-block; }

.metric-info__trigger {
  border: none;
  background: none;
  color: var(--fg-muted);
  cursor: pointer;
  padding: 0 0.15rem;
  font-size: 0.875rem;
}

.metric-info__popover {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 30;
  width: min(320px, 80vw);
  padding: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  text-align: left;
  white-space: normal;
  font-weight: 400;
  color: var(--fg);
}

.metric-info__popover h4 { margin: 0 0 0.5rem; font-size: 0.9375rem; }
.metric-info__popover dt {
  font-size: 0.75rem;
  color: var(--fg-muted);
  margin-top: 0.5rem;
}
.metric-info__popover dd { margin: 0.15rem 0 0; font-size: 0.8125rem; }

.empty-state, .error { padding: 2rem; text-align: center; color: var(--fg-muted); }
.error { color: var(--warn-fg); background: var(--warn-bg); border-radius: var(--radius); }

footer { margin-top: 1.5rem; font-size: 0.8125rem; color: var(--fg-muted); }
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd web && npm test -- styles`
Expected: 10 passed(原 6 個,加上:表格容器需有 max-height 否則 sticky 表頭
失效、凍結欄位移與寬度須共用同一變數、宣告的漲跌色必須真的被用到、
漲紅跌綠符合台股慣例)

- [ ] **Step 5: 人工檢查**

Run: `cd web && npm run dev`

在瀏覽器確認:
1. 表格正常顯示,資料不足處為「—」
2. 縮小視窗至手機寬度,代號與名稱欄凍結、其餘可橫捲,**body 本身不橫捲**
3. 切換系統深色模式,配色正確反轉
4. 點擊 ⓘ 顯示指標說明

> **這一步不是形式。** 2026-08-24 的實測抓到三個測試全綠但畫面壞掉的問題:
> - `--gain` / `--loss` 只宣告未使用,報酬完全沒有顏色。CSS 測試查得到變數
>   存在,查不到有沒有人用它 —— 要由元件吐出對應 class 才算數。
> - `.table-wrap` 只設 `overflow-x: auto` 時,`overflow-y` 會一併變成 `auto`,
>   使它成為捲動容器而擋掉 `thead` 的 sticky。要給 `max-height` 表頭才會黏住。
> - **指標說明彈窗被 `.table-wrap` 的 overflow 裁掉**,「怎麼算」那段從中間
>   切斷。就地 absolute 定位在有 overflow 的祖先裡必然如此,要用 portal
>   送到 body 並以 fixed 定位。
>
> 若環境無法縮放視窗(本次即是),可在 `public/` 放一個用 iframe 以固定寬度
> 載入 `/` 的暫存頁面來檢查窄版,檢查完刪除。

- [ ] **Step 6: Commit**

```bash
git add web/src/styles.css web/src/styles.test.ts
git commit -m "feat(web): 樣式、響應式凍結欄與深色主題"
```

---

## Task 11: 建置驗證與部署

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `web/vite.config.ts`

**Interfaces:**
- Consumes: Task 1–10
- Produces: 可部署的靜態站台

- [ ] **Step 1: 執行完整測試套件**

Run: `cd web && npm test`
Expected: 全數通過

- [ ] **Step 2: 驗證型別與建置**

Run: `cd web && npm run build`
Expected: 建置成功,無 TypeScript 錯誤,產出 `web/dist/`

- [ ] **Step 3: 預覽建置產物**

Run: `cd web && npm run preview`

確認建置後的站台行為與開發模式一致,特別是 JSON 載入路徑正確。

- [ ] **Step 4: 建立部署 workflow**

`.github/workflows/deploy.yml`:

```yaml
name: 部署網站

on:
  push:
    branches: [main]
    paths:
      - 'web/**'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: 安裝相依套件
        run: cd web && npm ci

      - name: 執行測試
        run: cd web && npm test

      - name: 建置
        run: cd web && npm run build

      - name: 部署至 Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy web/dist --project-name=alpha-track
```

- [ ] **Step 5: 設定 Cloudflare 憑證**

在 GitHub repo 的 Settings → Secrets and variables → Actions 新增:
- `CLOUDFLARE_API_TOKEN`(Cloudflare 儀表板產生,權限選 Cloudflare Pages: Edit)
- `CLOUDFLARE_ACCOUNT_ID`(Cloudflare 儀表板右側可見)

**此步驟需人工於瀏覽器操作,無法自動化。**

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml web/vite.config.ts
git commit -m "ci: Cloudflare Pages 部署流程"
```

---

## 完成標準

階段 1b 完成時,以下全部成立:

- [ ] `cd web && npm test` 全數通過
- [ ] `cd web && npm run build` 無 TypeScript 錯誤
- [ ] 排行榜顯示全部 ETF,資料不足處為「—」而非 0%
- [ ] 依任一期間升冪或降冪排序,資料不足者**都**在最末
- [ ] 欄位自選可勾選十一個期間,選擇於重新整理後保留
- [ ] 點擊未顯示的期間按鈕時,該欄位自動加入顯示
- [ ] 分類篩選、搜尋、槓桿反向開關皆正常運作
- [ ] 每個風險指標旁的 ⓘ 可點開四段說明
- [ ] 手機寬度下代號與名稱欄凍結,body 不橫向捲動
- [ ] 深色模式配色正確
- [ ] 站台部署後可透過 URL 存取
