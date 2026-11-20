import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ctx } from '../App'
import { Card, Legend, Tile, TT, axisProps } from '../components/ui'
import { cagr, natForecast, nationalMix, nationalSummary } from '../selectors'
import { fmt, SOURCE_LABEL, SOURCES } from '../theme'
import type { ScenarioKey } from '../types'

const SC_LABEL: Record<ScenarioKey, string> = { low: 'Low', base: 'Base', high: 'High' }

export default function Overview({ d, p, scenario, strategy }: Ctx) {
  const nf = natForecast(d, scenario)
  const f25 = nf[0], f47 = nf[nf.length - 1]
  const ns = nationalSummary(d, strategy, scenario)
  const n25 = ns[0], n47 = ns[ns.length - 1]
  const fan47 = d.forecast.fan[d.forecast.fan.length - 1]

  // ---------- history + forecast series
  const rows: Record<string, number | number[] | null>[] = []
  for (const h of d.history.national) {
    rows.push({ year: h.year, actual: h.grid ?? null, owid: h.total })
  }
  const byYear = new Map(rows.map((r) => [r.year as number, r]))
  for (const k of ['low', 'base', 'high'] as ScenarioKey[]) {
    for (const r of natForecast(d, k)) {
      const row = byYear.get(r.year) ?? { year: r.year }
      row[k] = r.total
      byYear.set(r.year, row)
    }
  }
  for (const f of d.forecast.fan) {
    const row = byYear.get(f.year)!
    row.p1090 = [f.p10, f.p90]
    row.p2575 = [f.p25, f.p75]
  }
  const series = [...byYear.values()].sort((a, b) => (a.year as number) - (b.year as number))

  // ---------- decomposition 2025 -> 2047 for the selected scenario
  const A = d.model.A
  const lnPop = Math.log(f47.population / f25.population)
  const lnInc = A.lg * Math.log(f47.gdp_pc_usd2015 / f25.gdp_pc_usd2015)
  const lnUrb = A.u * (f47.urban_pct - f25.urban_pct)
  const lnTot = Math.log(f47.trend / f25.trend)
  const lnRes = lnTot - lnPop - lnInc - lnUrb
  const dTrend = f47.trend - f25.trend
  const part = (x: number) => (dTrend * x) / lnTot
  const steps = [
    { name: '2025 generation', v: f25.total, kind: 'total' },
    { name: 'Population growth', v: part(lnPop), kind: 'step' },
    { name: 'Income growth', v: part(lnInc), kind: 'step' },
    { name: 'Urbanisation', v: part(lnUrb), kind: 'step' },
    { name: 'Model ensemble adj.', v: part(lnRes), kind: 'step' },
    { name: 'Green hydrogen', v: f47.green_hydrogen, kind: 'step' },
    { name: 'E-mobility', v: f47.e_mobility, kind: 'step' },
    { name: 'Data centres', v: f47.data_centres, kind: 'step' },
    { name: '2047 requirement', v: f47.total, kind: 'total' },
  ]
  let run = 0
  const wf = steps.map((s) => {
    if (s.kind === 'total') { run = s.v; return { ...s, base: 0, bar: s.v } }
    const base = s.v >= 0 ? run : run + s.v
    run += s.v
    return { ...s, base, bar: Math.abs(s.v) }
  }).map((s) => ({ ...s, lbl: s.kind === 'total' ? fmt.num(s.v) : `${s.v >= 0 ? '+' : '−'}${fmt.num(Math.abs(s.v))}` }))

  const mix = nationalMix(d, strategy, scenario)
  const m47 = mix[mix.length - 1]
  const m25 = mix[0]
  const mixRows = [
    { name: '2025', ...m25 },
    { name: '2047', ...m47 },
  ]

  return (
    <div className="stack">
      <div className="tiles">
        <Tile label={`2047 generation requirement · ${SC_LABEL[scenario]}`} value={fmt.num(f47.total)} unit="TWh"
          note={`${(f47.total / f25.total).toFixed(1)}× 2025 (${fmt.num(f25.total)} TWh)`} />
        <Tile label="Growth rate 2025–47" value={fmt.pct(cagr(f25.total, f47.total, 22), 1)} unit="/yr"
          note="Compound annual growth of generation" />
        <Tile label="Per-capita generation 2047" value={fmt.num(f47.kwh_per_capita)} unit="kWh"
          note={`vs ${fmt.num(f25.kwh_per_capita)} kWh in 2025`} />
        <Tile label="Uncertainty band (P10–P90)" value={`${fmt.num(fan47.p10 / 1000, 1)}–${fmt.num(fan47.p90 / 1000, 1)}`} unit="k TWh"
          note="3,000-run Monte Carlo around Base" />
        <Tile label={`Clean share 2047 · ${d.strategies[strategy].label.split(' (')[0]}`} value={fmt.pct(n47.clean)}
          note={`from ${fmt.pct(n25.clean)} in 2025`} />
        <Tile label="Grid carbon intensity 2047" value={fmt.num(n47.intensity)} unit="g/kWh"
          note={`from ${fmt.num(n25.intensity)} g/kWh in 2025`} />
      </div>

      <Card title="India's electricity generation: history and requirement to 2047"
        desc="Grid generation 2019–2025 from the provided National Power Portal data (plus Ember solar/wind/bio, which NPP does not publish); ensemble forecast 2025–2047 for three demand scenarios; shaded bands show the Monte Carlo P10–P90 and P25–P75 range around Base. Thin grey line: total incl. captive plants (OWID, supporting literature)."
        table={{ columns: ['Year', 'Grid actual', 'Incl. captive (OWID)', 'Low', 'Base', 'High', 'P10', 'P90'], rows: series.filter((r) => (r.year as number) % 5 === 0 || r.year === 2047 || r.year === 2019).map((r) => [r.year as number, (r.actual as number) ?? '', (r.owid as number) ?? '', (r.low as number) ?? '', (r.base as number) ?? '', (r.high as number) ?? '', (r.p1090 as number[])?.[0] ?? '', (r.p1090 as number[])?.[1] ?? '']) }}
        foot={`Forecast basis: grid generation (NPP + Ember RE), ${fmt.num(d.model.anchor_2025_twh)} TWh in 2025. Ensemble: ${fmt.pct(d.model.weights.P_provided)} provided-data trend model P, ${fmt.pct(1 - d.model.weights.P_provided)} literature models (driver regression, cross-country curve, damped-trend ETS). Captive generation (${fmt.num(d.model.captive.twh_2025)} TWh in 2025) is outside the grid basis: at its 2019–25 trend it would add about ${fmt.num(d.model.captive.twh_2047_trend)} TWh in 2047.`}>
        <Legend items={[
          { label: 'Grid actual (NPP)', color: p.ink, line: true },
          { label: 'Incl. captive (OWID)', color: p.axis, line: true },
          { label: 'Low (dashed)', color: p.muted, line: true },
          { label: 'Base', color: p.accent, line: true },
          { label: 'High (dashed)', color: p.ink2, line: true },
          { label: 'P10–P90 band', color: p.band + '33' },
        ]} />
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={series} margin={{ top: 8, right: 56, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={p.grid} vertical={false} />
            <XAxis dataKey="year" type="number" domain={[1990, 2047]} ticks={[1990, 2000, 2010, 2020, 2025, 2030, 2040, 2047]} {...axisProps(p)} />
            <YAxis {...axisProps(p)} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} width={44} />
            <ReferenceLine x={2025} stroke={p.axis} label={{ value: 'Forecast →', position: 'insideTopLeft', fill: p.muted, fontSize: 11 }} />
            <Area dataKey="p1090" stroke="none" fill={p.band} fillOpacity={0.12} isAnimationActive={false} />
            <Area dataKey="p2575" stroke="none" fill={p.band} fillOpacity={0.16} isAnimationActive={false} />
            <Line dataKey="owid" stroke={p.axis} strokeWidth={1.25} dot={false} isAnimationActive={false} />
            <Line dataKey="actual" stroke={p.ink} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="low" stroke={p.muted} strokeDasharray="5 4" strokeWidth={scenario === 'low' ? 2.5 : 1.5} dot={false} isAnimationActive={false}
              label={endLabel(series.length - 1, 'Low', p.muted)} />
            <Line dataKey="base" stroke={p.accent} strokeWidth={scenario === 'base' ? 2.5 : 1.5} dot={false} isAnimationActive={false}
              label={endLabel(series.length - 1, 'Base', p.accent)} />
            <Line dataKey="high" stroke={p.ink2} strokeDasharray="5 4" strokeWidth={scenario === 'high' ? 2.5 : 1.5} dot={false} isAnimationActive={false}
              label={endLabel(series.length - 1, 'High', p.ink2)} />
            <Tooltip cursor={{ stroke: p.axis }} content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as Record<string, number | number[]>
              const rowsTT = [] as { label: string; value: string; color?: string }[]
              if (r.actual != null) rowsTT.push({ label: 'Grid actual (NPP)', value: fmt.twh(r.actual as number), color: p.ink })
              if (r.owid != null) rowsTT.push({ label: 'Incl. captive (OWID)', value: fmt.twh(r.owid as number), color: p.axis })
              for (const k of ['high', 'base', 'low'] as ScenarioKey[]) if (r[k] != null && label !== 2025) rowsTT.push({ label: SC_LABEL[k], value: fmt.twh(r[k] as number), color: k === 'base' ? p.accent : k === 'low' ? p.muted : p.ink2 })
              if (r.p1090 && label !== 2025) rowsTT.push({ label: 'P10–P90', value: `${fmt.num((r.p1090 as number[])[0])}–${fmt.num((r.p1090 as number[])[1])}` })
              return <TT title={label} rows={rowsTT} />
            }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid g-2-1">
        <Card title={`What drives the 2047 requirement · ${SC_LABEL[scenario]}`}
          desc="2025 → 2047 change attributed to population, income and urbanisation (driver-model elasticities), plus new structural loads absent from history."
          table={{ columns: ['Component', 'TWh'], rows: steps.map((s) => [s.name, Math.round(s.v)]) }}
          foot={`Elasticities: generation per capita rises ${A.lg.toFixed(2)}% per 1% income and ${(A.u * 100).toFixed(2)}% per percentage-point urbanisation. The ensemble adjustment is the gap between these elasticities and the full ensemble (provided-data trend P, cross-country saturation curve, ETS).`}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={wf} margin={{ top: 18, right: 8, left: 4, bottom: 0 }} barCategoryGap="24%">
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="name" {...axisProps(p)} interval={0} tick={{ fill: p.muted, fontSize: 11 }} height={54} angle={-20} textAnchor="end" />
              <YAxis {...axisProps(p)} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} width={40} />
              <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="bar" stackId="w" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {wf.map((s) => <Cell key={s.name} fill={s.kind === 'total' ? p.ink2 : s.v < 0 ? p.critical : p.accent} />)}
                <LabelList dataKey="lbl" position="top" fill={p.ink2} fontSize={11} />
              </Bar>
              <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const s = payload[0].payload as typeof wf[number]
                return <TT title={s.name} rows={[{ label: s.kind === 'total' ? 'Generation' : 'Contribution', value: `${s.v >= 0 && s.kind !== 'total' ? '+' : ''}${fmt.twh(s.v)}` }]} />
              }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="How it is produced: national mix"
          desc={`${d.strategies[strategy].label}, ${SC_LABEL[scenario]} demand. 2025 actual vs 2047 optimised.`}
          table={{ columns: ['Source', '2025 TWh', '2047 TWh'], rows: SOURCES.map((s) => [SOURCE_LABEL[s], Math.round(m25[s]), Math.round(m47[s])]) }}>
          <Legend items={SOURCES.map((s) => ({ label: SOURCE_LABEL[s], color: p.source[s] }))} />
          <ResponsiveContainer width="100%" height={268}>
            <BarChart data={mixRows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="name" {...axisProps(p)} />
              <YAxis {...axisProps(p)} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} width={40} />
              {SOURCES.map((s, i) => (
                <Bar key={s} dataKey={s} stackId="m" fill={p.source[s]} stroke={p.surface} strokeWidth={1}
                  radius={i === SOURCES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
              ))}
              <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as Record<string, number>
                return <TT title={label} rows={[...SOURCES].reverse().map((s) => ({ label: SOURCE_LABEL[s], value: `${fmt.num(r[s])} TWh · ${fmt.pct(r[s] / r.total)}`, color: p.source[s] }))}
                  total={{ label: 'Total', value: fmt.twh(r.total) }} />
              }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="callout">
        <b>Bottom line.</b> Under Base assumptions the grid must generate about <b>{fmt.num(natForecast(d, 'base').at(-1)!.total)} TWh</b> in 2047,
        {' '}{(natForecast(d, 'base').at(-1)!.total / f25.total).toFixed(1)}× today. Rising incomes explain most of the growth, followed by
        population growth and urbanisation. Green hydrogen, e-mobility and data centres (sized on NITI Aayog 2026 projections) add about a sixth on top. The recommended Balanced strategy meets it
        with solar and wind as the backbone, hydro and nuclear as clean firm power, and coal output that peaks by 2035, holds to 2040, then declines.
        Grid carbon intensity falls by about two-thirds. Absolute power-sector CO₂ peaks around 2040 and in 2047 is still above
        today's level, because generation more than triples: full decarbonisation lies beyond 2047, on the net-zero 2070 path.
      </div>
    </div>
  )
}

function endLabel(lastIndex: number, text: string, color: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => {
    const { x, y, index } = props
    if (index !== lastIndex) return <g />
    return <text x={x + 6} y={y} dy={4} fontSize={12} fill={color} fontWeight={600}>{text}</text>
  }
}
