import type { Bundle, Region, ScenarioKey, Source, StrategyKey } from './types'
import { SOURCES } from './theme'

export const MILESTONES = [2025, 2030, 2035, 2040, 2047]

export function natForecast(d: Bundle, sc: ScenarioKey) {
  return d.forecast.national.filter((r) => r.scenario === sc)
}

export function mixFor(d: Bundle, st: StrategyKey, sc: ScenarioKey) {
  return d.strategy.mix.filter((r) => r.strategy === st && r.scenario === sc)
}

/** national mix per milestone year: { year, coal, ..., total } */
export function nationalMix(d: Bundle, st: StrategyKey, sc: ScenarioKey) {
  const m = mixFor(d, st, sc)
  return MILESTONES.map((y) => {
    const row: Record<string, number> = { year: y, total: 0 }
    for (const s of SOURCES) {
      row[s] = m.filter((r) => r.year === y && r.source === s).reduce((a, r) => a + r.twh, 0)
      row.total += row[s]
    }
    return row as Record<Source | 'year' | 'total', number>
  })
}

export function regionMix(d: Bundle, st: StrategyKey, sc: ScenarioKey, year: number, region: Region) {
  const m = mixFor(d, st, sc).filter((r) => r.year === year && r.region === region)
  const row: Record<string, number> = { total: 0 }
  for (const s of SOURCES) {
    row[s] = m.find((r) => r.source === s)?.twh ?? 0
    row.total += row[s]
  }
  return row as Record<Source | 'total', number>
}

export function summary(d: Bundle, st: StrategyKey, sc: ScenarioKey) {
  return d.strategy.summary.filter((r) => r.strategy === st && r.scenario === sc)
}

export function nationalSummary(d: Bundle, st: StrategyKey, sc: ScenarioKey) {
  const s = summary(d, st, sc)
  return MILESTONES.map((y) => {
    const rows = s.filter((r) => r.year === y)
    const prod = rows.reduce((a, r) => a + r.production_twh, 0)
    const em = rows.reduce((a, r) => a + r.emissions_mt, 0)
    const clean = rows.reduce((a, r) => a + r.clean_share * r.production_twh, 0) / prod
    const vre = rows.reduce((a, r) => a + r.vre_share * r.production_twh, 0) / prod
    return { year: y, production: prod, emissions: em, intensity: (em / prod) * 1000, clean, vre }
  })
}

export const cagr = (a: number, b: number, years: number) => Math.pow(b / a, 1 / years) - 1
