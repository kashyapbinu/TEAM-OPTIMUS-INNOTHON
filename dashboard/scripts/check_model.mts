// Verifies the browser what-if model reproduces the Python forecast for all three scenarios.
import { readFileSync } from 'node:fs'
import { runWhatIf } from '../src/model.ts'
const b = JSON.parse(readFileSync(new URL('../public/data/dashboard.json', import.meta.url), 'utf8'))
let worst = 0
for (const k of ['low', 'base', 'high']) {
  const s = b.scenarios[k]
  const g = (y: number) => s.gdp_growth.find(([a, z]: number[]) => y >= a && y <= z)[2]
  const r = runWhatIf(b.calculator, { g1: g(2027), g2: g(2035), g3: g(2045), urban2047: s.urban_2047, popMult: s.pop_mult_2047, h2Mt: s.h2_mt_2047, evTwh: s.ev_twh_2047, dcTwh: s.dc_twh_2047 })
  const py = b.forecast.national.filter((x: any) => x.scenario === k)
  r.years.forEach((y, i) => { const e = Math.abs(r.total[i] - py[i].total) / py[i].total; worst = Math.max(worst, e) })
  console.log(k, '2047 js', r.total.at(-1)!.toFixed(1), 'py', py.at(-1).total.toFixed(1))
}
console.log('max relative error', (worst * 100).toFixed(4) + '%')
if (worst > 0.001) process.exit(1)
