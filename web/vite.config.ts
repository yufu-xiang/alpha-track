import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // 部署於網域根目錄(Cloudflare Pages 的預設)。
  //
  // 若改成部署在子路徑(例如 GitHub Pages 的 /alpha-track/),這裡要改成
  // 該子路徑。資料載入端已經吃 import.meta.env.BASE_URL(見 data/loader.ts),
  // 所以改這一行就夠 —— 但**不改就會壞**:JSON 會被抓成 /data/rankings.json
  // 而不是 /alpha-track/data/rankings.json,畫面變成「資料載入失敗」。
  base: '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
