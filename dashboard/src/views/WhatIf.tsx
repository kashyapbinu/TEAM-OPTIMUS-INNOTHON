import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ctx } from '../App'
import { Card, Legend, Tile, TT, axisProps } from '../components/ui'
import { runWhatIf, type WhatIfInputs } from '../model'
import { fmt } from '../theme'
import type { ScenarioKey } from '../types'

function preset(d: Ctx['d'], k: ScenarioKey): WhatIfInputs {
  const s = d.scenarios[k]
  const g = (y: number) => s.gdp_growth.find(([a, b]) => y >= a && y <= b)![2]
  return { g1: g(2027), g2: g(2035), g3: g(2045), urban2047: s.urban_2047, popMult: s.pop_mult_2047, h2Mt: s.h2_mt_2047, evTwh: s.ev_twh_2047, dcTwh: s.dc_twh_2047 }
}

const SLIDERS: { key: keyof WhatIfInputs; label: string; min: number; max: number; step: number; show: (v: number) => string; hint: string }[] = [
  { key: 'g1', label: 'Real GDP growth 2026–30', min: 0.03, max: 0.09, step: 0.0025, show: (v) => fmt.pct(v, 2), hint: 'IMF/RBI consensus ≈ 6.5%' },
  { key: 'g2', label: 'Real GDP growth 2031–40', min: 0.03, max: 0.09, step: 0.0025, show: (v) => fmt.pct(v, 2), hint: 'Base 6.0%' },
  { key: 'g3', label: 'Real GDP growth 2041–47', min: 0.02, max: 0.09, step: 0.0025, show: (v) => fmt.pct(v, 2), hint: 'Base 5.0% (maturing economy)' },
  { key: 'urban2047', label: 'Urban population share in 2047', min: 38, max: 60, step: 0.5, show: (v) => `${v.toFixed(1)}%`, hint: 'UN WUP 42.2%. Some national estimates exceed 50%.' },
  { key: 'popMult', label: 'Population vs UN medium (2047)', min: 0.94, max: 1.06, step: 0.005, show: (v) => `${((v - 1) * 100).toFixed(1)}%`, hint: 'UN medium: 1.67 billion' },
  { key: 'h2Mt', label: 'Green hydrogen output 2047 (Mt/yr)', min: 0, max: 30, step: 0.5, show: (v) => `${v.toFixed(1)} Mt`, hint: '≈55 TWh per Mt via electrolysis (NITI)' },
  { key: 'evTwh', label: 'E-mobility load beyond trend (TWh)', min: 0, max: 600, step: 10, show: (v) => `${v} TWh`, hint: 'End-use. Grossed up for 12% losses.' },
  { key: 'dcTwh', label: 'Data-centre load beyond trend (TWh)', min: 0, max: 500, step: 10, show: (v) => `${v} TWh`, hint: 'End-use. Grossed up for 12% losses.' },
]

export default function WhatIf({ d, p }: Ctx) {
  const [x, setX] = useState<WhatIfInputs>(() => preset(d, 'base'))
  const res = useMemo(() => runWhatIf(d.calculator, x), [d.calculator, x])
  const base = d.forecast.national.filter((r) => r.scenario === 'base')
  const fan = d.forecast.fan
  const rows = res.years.map((y, i) => ({ year: y, you: res.total[i], base: base[i].total, band: [fan[i].p10, fan[i].p90] }))
  const t47 = res.total.at(-1)!, b47 = base.at(-1)!.total
  const loads = res.h2.at(-1)! + res.ev.at(-1)! + res.dc.at(-1)!
  const pct = (fan: number[], v: number) => v < fan[0] ? 'Below P10' : v > fan[1] ? 'Above P90' : 'Within band'

  return (
    <div className="stack">
      <p className="section-sub">
        This page re-runs the national ensemble model in your browser (the same equations and coefficients as the Python pipeline, verified to
        match exactly). Change the drivers and watch the 2047 generation requirement respond.
      </p>
      <div className="grid g-1-2">
        <Card title="Drivers" action={
          <div className="seg" role="group" aria-label="Presets">
            {(['low', 'base', 'high'] as ScenarioKey[]).map((k) => <button key={k} onClick={() => setX(preset(d, k))}>{k[0].toUpperCase() + k.slice(1)}</button>)}
          </div>}>
          {SLIDERS.map((s) => (
            <div className="slider" key={s.key}>
              <label htmlFor={s.key}>{s.label}</label>
              <output htmlFor={s.key}>{s.show(x[s.key])}</output>
              <input id={s.key} type="range" min={s.min} max={s.max} step={s.step} value={x[s.key]}
                onChange={(e) => setX({ ...x, [s.key]: Number(e.target.value) })} />
              <span className="hint">{s.hint}</span>
            </div>
          ))}
        </Card>
        <div className="stack">
          <div className="tiles">
            <Tile label="Your 2047 requirement" value={fmt.num(t47)} unit="TWh" note={`${t47 >= b47 ? '+' : ''}${fmt.num(t47 - b47)} TWh vs Base (${fmt.pct(t47 / b47 - 1, 1)})`} />
            <Tile label="Per person 2047" value={fmt.num((t47 * 1e9) / res.pop.at(-1)!)} unit="kWh" note={`GDP per capita $${fmt.num(res.gdppc.at(-1)!)} (2015 USD)`} />
            <Tile label="New structural loads" value={fmt.num(loads)} unit="TWh" note={`${fmt.pct(loads / t47)} of 2047 total`} />
            <Tile label="Position in Monte Carlo" value={pct([fan.at(-1)!.p10, fan.at(-1)!.p90], t47)} note={`P10–P90: ${fmt.num(fan.at(-1)!.p10)}–${fmt.num(fan.at(-1)!.p90)} TWh`} />
          </div>
          <Card title="Your path vs Base" desc="Shaded: Base-scenario Monte Carlo P10–P90."
            table={{ columns: ['Year', 'Your TWh', 'Base TWh'], rows: rows.filter((r) => r.year % 5 === 0 || r.year === 2047).map((r) => [r.year, Math.round(r.you), Math.round(r.base)]) }}>
            <Legend items={[{ label: 'Your scenario', color: p.ink, line: true }, { label: 'Base', color: p.accent, line: true }, { label: 'P10–P90', color: p.band + '33' }]} />
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={p.grid} vertical={false} />
                <XAxis dataKey="year" type="number" domain={[2025, 2047]} ticks={[2025, 2030, 2035, 2040, 2047]} {...axisProps(p)} />
                <YAxis {...axisProps(p)} axisLine={false} width={48} tickFormatter={(v) => `${+(v / 1000).toFixed(1)}k`} />
                <Area dataKey="band" stroke="none" fill={p.band} fillOpacity={0.12} isAnimationActive={false} />
                <Line dataKey="base" stroke={p.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="you" stroke={p.ink} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Tooltip cursor={{ stroke: p.axis }} content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const r = payload[0].payload as typeof rows[number]
                  return <TT title={label} rows={[{ label: 'Your scenario', value: fmt.twh(r.you), color: p.ink }, { label: 'Base', value: fmt.twh(r.base), color: p.accent }, { label: 'P10–P90', value: `${fmt.num(r.band[0])}–${fmt.num(r.band[1])}` }]} />
                }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </div>
  )
}
