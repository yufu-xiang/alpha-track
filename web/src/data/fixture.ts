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
      excess: periods({
        D1: 0.0012, Y1: 0.0421, Y3: 0.2103, Y5: 0.4412, Y10: 0.9887,
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
      excess: periods({
        D1: -0.0031, Y1: -0.0168, Y3: 0.0688, Y5: 0.1201, Y10: 0.0344,
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
      excess: periods({
        D1: 0.0066, Y1: 0.0598, Y3: 0.1466, INCEPTION: 0.0912,
      }),
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
      excess: periods({
        D1: -0.0006, Y1: -0.1091, Y3: -0.5933, Y5: -0.7422,
      }),
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
      excess: periods({
        D1: 0.0063, Y1: 0.2409, Y3: 0.6466, Y5: 1.8602, Y10: 5.6941,
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
      excess: periods({
        D1: -0.0091, Y1: -0.3224, Y3: -0.7433, Y5: -1.1135, Y10: -3.2314,
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
      excess: periods({
        D1: -0.0027,
      }),
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
