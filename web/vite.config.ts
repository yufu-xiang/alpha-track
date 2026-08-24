import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages 的專案站台位於 https://<帳號>.github.io/<repo>/,
  // 所以 base 必須是那個子路徑,不能是 '/'。
  //
  // 資料載入端吃 import.meta.env.BASE_URL(見 data/loader.ts),
  // 這一行對了 JSON 才會被抓成 /alpha-track/data/rankings.json;
  // 留成 '/' 的話會去抓 /data/rankings.json,畫面變成「資料載入失敗」。
  //
  // 改用自訂網域或改回根目錄部署時,這一行要跟著改。
  base: '/alpha-track/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
