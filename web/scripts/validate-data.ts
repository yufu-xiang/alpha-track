/** 用前端真正的執行期契約驗證所有已匯出 JSON。 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateBenchmark, validateDetail, validateMeta, validateRankings,
} from '../src/data/contract'

const root = join(process.cwd(), 'public', 'data')
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

validateMeta(read(join(root, 'meta.json')))
validateRankings(read(join(root, 'rankings.json')))
validateBenchmark(read(join(root, 'benchmark.json')))

const details = readdirSync(join(root, 'etf')).filter((name) => name.endsWith('.json'))
for (const name of details) validateDetail(read(join(root, 'etf', name)))

process.stdout.write(`Validated ${details.length} ETF detail files.\n`)
