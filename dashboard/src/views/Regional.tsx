import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ctx } from '../App'
import { Card, DataTable, Legend, Seg, TT, axisProps } from '../components/ui'
import TileMap, { seqScale, type TileDatum } from '../components/TileMap'
import { cagr } from '../selectors'
import { fmt, REGIONS } from '../theme'
import type { Region } from '../types'

type Metric = 'twh' | 'growth' | 'kwhpc' | 'urban'
const METRIC_LABEL: Record<Metric, string> = { twh: '2047 TWh', growth: 'Growth ×', kwhpc: 'kWh / person', urban: 'Urban % 2047' }

const IMPORTER_NOTE = 'Generates almost nothing in-state and imports nearly all its electricity from the grid. Values are production, not consumption.'

export default function Regional({ d, p, scenario }: Ctx) {
  const [metric, setMetric] = useState<Metric>('twh')
  const [colorBy, setColorBy] = useState<'value' | 'region'>('value')
  const [sel, setSel] = useState<string>('UP')

  const rf = d.forecast.regional.filter((r) => r.scenario === scenario)
  const years = [...new Set(rf.map((r) => r.year))]
  const lines = years.map((y) => {
    const row: Record<string, number> = { year: y }
    for (const r of REGIONS) row[r] = rf.find((x) => x.year === y && x.region === r)!.twh
    return row
  })
  // end labels: push apart regions whose 2047 values nearly coincide (e.g. North and South)
  const last = lines[lines.length - 1]
  const ymax = Math.max(...REGIONS.map((r) => last[r]))
  const labelDy = (r: Region) => {
    const near = REGIONS.find((k) => k !== r && Math.abs(last[k] - last[r]) < 0.04 * ymax)
    if (!near) return 4
    return last[r] >= last[near] ? -3 : 11
  }

  const st = d.forecast.states.filter((r) => r.scenario === scenario)
  // production basis: states with almost no in-state plants look like zeros but are correct (they import)
  const nat47 = d.forecast.national.find((r) => r.scenario === scenario && r.year === 2047)!
  const natPc = (nat47.total * 1e9) / nat47.population
  const importer = (r: { twh: number; population: number }) => (r.twh * 1e9) / r.population < 0.1 * natPc
  const tiles: TileDatum[] = useMemo(() => d.states.map((s) => {
    const a = st.find((r) => r.state === s.name && r.year === 2025)!
    const b = st.find((r) => r.state === s.name && r.year === 2047)!
    const v = metric === 'twh' ? b.twh : metric === 'growth' ? b.twh / a.twh : metric === 'kwhpc' ? (b.twh * 1e9) / b.population : b.urban_pct
    const label = metric === 'twh' ? fmt.num(v) : metric === 'growth' ? `${v.toFixed(1)}×` : metric === 'kwhpc' ? fmt.num(v) : `${v.toFixed(0)}%`
    return { code: s.code, name: s.name, region: s.region, value: v, label, note: importer(b) ? IMPORTER_NOTE : undefined }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- importer depends only on scenario, which already changes st
  }), [d.states, st, metric])
  const vals = tiles.map((t) => t.value).sort((a, b) => a - b)
  // robust domain (5th–95th pct) so a few outliers don't wash the scale out
  const domain: [number, number] = [vals[Math.floor(vals.length * 0.05)], vals[Math.floor(vals.length * 0.95)]]

  const selState = d.states.find((s) => s.code === sel)!
  const s25 = st.find((r) => r.state === selState.name && r.year === 2025)!
  const s47 = st.find((r) => r.state === selState.name && r.year === 2047)!

  const regTable = REGIONS.map((r) => {
    const a = rf.find((x) => x.region === r && x.year === 2025)!
    const b = rf.find((x) => x.region === r && x.year === 2047)!
    const lo = d.forecast.regional.find((x) => x.scenario === 'low' && x.region === r && x.year === 2047)!
    const hi = d.forecast.regional.find((x) => x.scenario === 'high' && x.region === r && x.year === 2047)!
    return [r, Math.round(a.twh), Math.round(b.twh), `${Math.round(lo.twh)}–${Math.round(hi.twh)}`, fmt.pct(cagr(a.twh, b.twh, 22), 1),
      fmt.mn(b.population), Math.round(a.kwh_per_capita), Math.round(b.kwh_per_capita)]
  })

  return (
    <div className="stack">
      <p className="section-sub">
        Regional <b>production requirement</b> on a business-as-usual (BAU) basis: each state's 2025 generation grows with its own population,
        income and urbanisation (driver elasticities from the national model), then all states are reconciled to the national total.
        Where production <i>should</i> happen is decided in the Generation strategy tab.
      </p>
      <div className="grid g-2-1">
        <Card title="State-level production requirement"
          desc={`Click a state. ${scenario[0].toUpperCase() + scenario.slice(1)} scenario, 2047.`}
          action={<Seg label="Colour by" value={colorBy} onChange={setColorBy} options={[{ key: 'value', label: 'Metric' }, { key: 'region', label: 'Region' }]} />}
          table={{ columns: ['State', 'Region', METRIC_LABEL[metric]], rows: [...tiles].sort((a, b) => b.value - a.value).map((t) => [t.name, t.region, t.label]), numeric: [false, false, true] }}>
          <div style={{ marginBottom: 10 }}>
            <Seg label="Metric" value={metric} onChange={setMetric}
              options={(Object.keys(METRIC_LABEL) as Metric[]).map((k) => ({ key: k, label: METRIC_LABEL[k] }))} />
          </div>
          <TileMap data={tiles} p={p} colorBy={colorBy} selected={sel} onSelect={setSel} domain={domain} />
          {colorBy === 'value' ? (
            <div className="scale"><span>{metric === 'growth' ? domain[0].toFixed(1) + '×' : fmt.num(domain[0])}</span>
              <span className="bar" style={{ background: `linear-gradient(90deg, ${seqScale(p.mode).join(',')})` }} />
              <span>{metric === 'growth' ? domain[1].toFixed(1) + '×' : fmt.num(domain[1])}</span></div>
          ) : <Legend items={REGIONS.map((r) => ({ label: r, color: p.region[r] }))} />}
          {tiles.some((t) => t.note) && <div className="foot" style={{ marginTop: 8 }}>
            Near-zero production: {tiles.filter((t) => t.note).map((t) => t.name).join(', ')}. These states have almost no in-state
            plants and import their electricity; the map shows production, not consumption.</div>}
        </Card>

        <Card title={selState.name} desc={`${selState.region} region${selState.island ? ' · island UT (off-grid)' : ''}`}>
          <dl className="kv">
            <dt>2025 generation</dt><dd>{fmt.twh(s25.twh)}</dd>
            <dt>2047 requirement</dt><dd><b>{fmt.twh(s47.twh)}</b> ({(s47.twh / s25.twh).toFixed(1)}×)</dd>
            <dt>Growth rate</dt><dd>{fmt.pct(cagr(s25.twh, s47.twh, 22), 1)} / yr</dd>
            <dt>Population 2025 → 2047</dt><dd>{fmt.mn(s25.population)} → {fmt.mn(s47.population)}</dd>
            <dt>Urban share 2025 → 2047</dt><dd>{s25.urban_pct.toFixed(1)}% → {s47.urban_pct.toFixed(1)}%</dd>
            <dt>Income vs national avg</dt><dd>{(s47.gdppc_rel_usd2015 / (d.forecast.national.find((r) => r.scenario === scenario && r.year === 2047)!.gdp_pc_usd2015)).toFixed(2)}× (2047)</dd>
            <dt>Generation / person 2047</dt><dd>{fmt.num((s47.twh * 1e9) / s47.population)} kWh</dd>
          </dl>
          {importer(s47) && <div className="callout" style={{ marginTop: 12 }}>
            <b>Near-zero is correct here.</b> {selState.name} {IMPORTER_NOTE.charAt(0).toLowerCase() + IMPORTER_NOTE.slice(1)}</div>}
          <div className="foot" style={{ marginTop: 12 }}>
            State generation reflects where plants are sited today. Exporting states such as Chhattisgarh and Odisha show
            high per-capita production; importing states such as Delhi and Bihar show low.
          </div>
          <h4 style={{ fontSize: 13, margin: '16px 0 6px' }}>Largest 2047 requirements</h4>
          <DataTable columns={['State', 'TWh']}
            rows={[...st.filter((r) => r.year === 2047)].sort((a, b) => b.twh - a.twh).slice(0, 8).map((r) => [r.state, Math.round(r.twh)])} />
        </Card>
      </div>

      <Card title="Regional production requirement, 2025–2047"
        desc="Five grid regions (CEA convention). BAU production path, reconciled to the national forecast."
        table={{ columns: ['Region', '2025 TWh', '2047 TWh', '2047 Low–High', 'Growth/yr', 'Population 2047', 'kWh/person 2025', 'kWh/person 2047'], rows: regTable, numeric: [false, true, true, true, true, true, true, true] }}>
        <Legend items={REGIONS.map((r) => ({ label: r, color: p.region[r], line: true }))} />
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={lines} margin={{ top: 8, right: 90, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={p.grid} vertical={false} />
            <XAxis dataKey="year" type="number" domain={[2025, 2047]} ticks={[2025, 2030, 2035, 2040, 2047]} {...axisProps(p)} />
            <YAxis {...axisProps(p)} axisLine={false} width={48} tickFormatter={(v) => fmt.num(v)} />
            {REGIONS.map((r) => (
              <Line key={r} dataKey={r} stroke={p.region[r]} strokeWidth={2} dot={false} isAnimationActive={false}
                label={(props: { x: number; y: number; index: number }) => props.index === lines.length - 1
                  ? <text x={props.x + 6} y={props.y} dy={labelDy(r)} fontSize={12} fill={p.ink2}>{r}</text> : <g />} />
            ))}
            <Tooltip cursor={{ stroke: p.axis }} content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as Record<Region, number>
              return <TT title={label} rows={[...REGIONS].sort((a, b) => r[b] - r[a]).map((k) => ({ label: k, value: fmt.twh(r[k]), color: p.region[k] }))}
                total={{ label: 'India', value: fmt.twh(REGIONS.reduce((a, k) => a + r[k], 0)) }} />
            }} />
          </LineChart>
        </ResponsiveContainer>
        <DataTable columns={['Region', '2025 TWh', '2047 TWh', '2047 Low–High', 'Growth/yr', 'Population 2047', 'kWh/person 2025', 'kWh/person 2047']} rows={regTable}
          numeric={[false, true, true, true, true, true, true, true]} />
      </Card>
    </div>
  )
}
