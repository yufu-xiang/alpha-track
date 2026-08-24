/**
 * 把 fixture 寫成 JSON,供 npm run dev 在拿到真實資料前使用。
 *
 * pipeline 的 `python -m alpha_track.cli export` 會寫到同一個目錄,
 * 屆時真實產出會覆蓋這兩個檔案。
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
