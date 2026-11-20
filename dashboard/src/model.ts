import type { Calculator } from './types'

/** Browser re-implementation of src/forecast.py national_paths + ensemble + structural loads.
 *  Verified against the Python base scenario (see scripts/check_model.mjs). */
export interface WhatIfInputs {
  g1: number // real GDP growth 2026-30
  g2: number // 2031-40
  g3: number // 2041-47
  urban2047: number // %
  popMult: number // multiplier on UN medium population in 2047
  h2Mt: number // green hydrogen Mt/yr in 2047
  evTwh: number // incremental e-mobility end-use TWh
  dcTwh: number // incremental data-centre end-use TWh
}

export interface WhatIfResult {
  years: number[]; total: number[]; trend: number[]; A: number[]; B: number[]; C: number[]; P: number[]
  h2: number[]; ev: number[]; dc: number[]; pop: number[]; gdppc: number[]; urban: number[]
}

function ramp(years: number[], v2047: number): number[] {
  const s = years.map((t) => 1 / (1 + Math.exp(-(t - 2036) / 3)))
  const s0 = s[0], s1 = s[s.length - 1]
  return s.map((x) => (v2047 * (x - s0)) / (s1 - s0))
}

export function runWhatIf(c: Calculator, x: WhatIfInputs): WhatIfResult {
  const Y = c.years
  const n = Y.length
  const pop = Y.map((t, i) => c.pop_un[i] * (1 + ((x.popMult - 1) * (t - 2025)) / (2047 - 2025)))
  const gdp: number[] = [c.gdp0_usd2015]
  for (let i = 1; i < n; i++) {
    const t = Y[i]
    const r = t <= 2030 ? x.g1 : t <= 2040 ? x.g2 : x.g3
    gdp.push(gdp[i - 1] * (1 + r))
  }
  const gdppc = gdp.map((g, i) => g / pop[i])
  const u25 = c.urban_un[0]
  const un47 = c.urban_un[n - 1]
  const urban = c.urban_un.map((u) => u25 + ((u - u25) * (x.urban2047 - u25)) / (un47 - u25))
  const A = Y.map((_, i) =>
    (c.epc0 * Math.exp(c.A.lg * Math.log(gdppc[i] / gdppc[0]) + c.A.u * (urban[i] - urban[0])) * pop[i]) / 1e9)
  const lg = gdppc.map((g) => c.lg_anchor + Math.log(g) - Math.log(c.gdppc_wb_anchor))
  const f = (l: number, u: number) => c.B.lg * l + c.B.lg2 * l * l + c.B.urban * u
  const f0 = f(lg[0], urban[0])
  const B = Y.map((_, i) => (c.epc0 * Math.exp(f(lg[i], urban[i]) - f0) * pop[i]) / 1e9)
  const C = Y.map((_, i) => (c.C_path[i] * (A[i] + B[i])) / c.AB_base[i])
  // P: provided-data per-capita trend, scaled by the driver models' relative response (same rule as C)
  const P = Y.map((_, i) => (c.P_path[i] * (A[i] + B[i])) / c.AB_base[i])
  const w = c.weights
  const trend = Y.map((_, i) => w.A_driver * A[i] + w.B_crosscountry * B[i] + w.C_ets * C[i] + w.P_provided * P[i])
  const h2 = ramp(Y, (x.h2Mt * c.h2_kwh_per_kg))
  const ev = ramp(Y, x.evTwh / (1 - c.loss))
  const dc = ramp(Y, x.dcTwh / (1 - c.loss))
  const total = Y.map((_, i) => trend[i] + h2[i] + ev[i] + dc[i])
  return { years: Y, total, trend, A, B, C, P, h2, ev, dc, pop, gdppc, urban }
}
