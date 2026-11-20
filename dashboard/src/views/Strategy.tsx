import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ctx } from '../App'
import { Card, Legend, TT, axisProps } from '../components/ui'
import { MILESTONES, nationalMix, nationalSummary, regionMix, summary } from '../selectors'
import { fmt, REGIONS, SOURCE_LABEL, SOURCES } from '../theme'
import type { StrategyKey } from '../types'

const STRATS: StrategyKey[] = ['balanced', 'accelerated', 'security']

export default function Strategy({ d, p, scenario, strategy, setStrategy }: Ctx) {
  const mix = nationalMix(d, strategy, scenario)
  const run = d.runs[`${strategy}|${scenario}`]
  const sum = summary(d, strategy, scenario)
  const regRows = REGIONS.map((r) => ({ region: r, ...regionMix(d, strategy, scenario, 2047, r) }))
  const shift = REGIONS.map((r) => {
    const s = sum.find((x) => x.region === r && x.year === 2047)!
    return { region: r, shift: s.shift_vs_bau_twh, prod: s.production_twh, bau: s.bau_requirement_twh, clean: s.clean_share, intensity: s.intensity_g_per_kwh, vre: s.vre_share }
  })
  const em = MILESTONES.map((y) => {
    const row: Record<string, number> = { year: y }
    for (const k of STRATS) row[k] = nationalSummary(d, k, scenario).find((x) => x.year === y)!.emissions
    return row
  })
  const stratColor: Record<StrategyKey, string> = { balanced: p.accent, accelerated: p.region.South, security: p.region.West }

  const flags: { kind: 'ok' | 'warn' | 'crit'; text: React.ReactNode }[] = []
  const unserved = Object.entries(run.unserved).filter(([, v]) => v > 1)
  if (unserved.length) flags.push({ kind: 'crit', text: <><b>Supply gap:</b> {unserved.map(([y, v]) => `${y}: ${fmt.twh(v)}`).join(', ')}. Build-rate limits under this strategy cannot keep pace with this demand scenario.</> })
  const t2 = Object.entries(run.vre_tier2).filter(([, v]) => v > 1)
  if (t2.length) flags.push({ kind: 'warn', text: <><b>Storage-intensive VRE:</b> {t2.map(([y, v]) => `${y}: ${fmt.twh(v)}`).join(', ')} of solar/wind above the strategy's balancing limit, priced at ₹3/kWh extra firming (multi-hour batteries, pumped hydro).</> })
  const co = Object.entries(run.coal_over).filter(([, v]) => v > 1)
  if (co.length) flags.push({ kind: 'warn', text: <><b>Coal above strategy cap:</b> {co.map(([y, v]) => `${y}: ${fmt.twh(v)}`).join(', ')}. Demand outruns clean build-out in this combination.</> })
  const shorts = Object.entries(run.self_shortfall).filter(([k, v]) => v > 1 && k.endsWith('2047'))
  if (shorts.length) flags.push({ kind: 'warn', text: <><b>Below 70% of BAU production in 2047:</b> {shorts.map(([k, v]) => `${k.split('|')[0]} (${fmt.twh(v)})`).join(', ')}. Resource-limited, so these regions import.</> })
  if (!flags.length) flags.push({ kind: 'ok', text: <>All constraints met within strategy limits. No supply gap, no coal-cap breach, no storage-tier VRE.</> })

  return (
    <div className="stack">
      <p className="section-sub">
        A linear programme chooses generation by region and source for 2030, 2035, 2040 and 2047. It minimises cost plus carbon cost, subject to
        resource ceilings (converted to TWh), build-rate limits, grid-balancing limits, coal-fleet survival, committed projects and
        inter-regional transfer limits. Pick a strategy:
      </p>
      <div className="strategy-cards">
        {STRATS.map((k) => {
          const ns = nationalSummary(d, k, scenario).at(-1)!
          return (
            <button key={k} className="strategy-card" aria-pressed={k === strategy} onClick={() => setStrategy(k)}>
              <h4>{d.strategies[k].label}</h4>
              <p>{d.strategies[k].desc}</p>
              <div className="metrics">
                <span><b>{fmt.pct(ns.clean)}</b>clean 2047</span>
                <span><b>{fmt.num(ns.intensity)}</b>g CO₂/kWh</span>
                <span><b>{fmt.num(ns.emissions)}</b>Mt CO₂</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {flags.map((f, i) => <div key={i} className={`flag ${f.kind}`}><span className="ico">{f.kind === 'ok' ? '✓' : f.kind === 'warn' ? '!' : '×'}</span><span>{f.text}</span></div>)}
      </div>

      <div className="grid g2">
        <Card title="National generation mix by milestone" desc="Optimised TWh by source. 2025 is actual."
          table={{ columns: ['Year', ...SOURCES.map((s) => SOURCE_LABEL[s]), 'Total'], rows: mix.map((r) => [r.year, ...SOURCES.map((s) => Math.round(r[s])), Math.round(r.total)]) }}>
          <Legend items={SOURCES.map((s) => ({ label: SOURCE_LABEL[s], color: p.source[s] }))} />
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={mix} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="year" {...axisProps(p)} />
              <YAxis {...axisProps(p)} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} width={40} />
              {SOURCES.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={p.source[s]} stroke={p.surface} strokeWidth={1}
                radius={i === SOURCES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
              <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as Record<string, number>
                return <TT title={label} rows={[...SOURCES].reverse().map((s) => ({ label: SOURCE_LABEL[s], value: `${fmt.num(r[s])} · ${fmt.pct(r[s] / r.total)}`, color: p.source[s] }))}
                  total={{ label: 'Total TWh', value: fmt.num(r.total) }} />
              }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Power-sector CO₂ by strategy" desc={`Direct emissions from coal and gas generation, ${scenario} demand.`}
          table={{ columns: ['Year', ...STRATS.map((k) => d.strategies[k].label)], rows: em.map((r) => [r.year, ...STRATS.map((k) => Math.round(r[k]))]) }}
          foot={<>Emission factors from Ember India: coal 0.82, gas 0.49 tCO₂/MWh. <b>Why coal still rises to ~2035 in Balanced:</b> in 2025–35 the requirement
            grows by about 1,750 TWh while clean sources can add about 1,400 TWh, limited by how fast resource sites can be developed and by grid-balancing limits; the coal fleet is
            young (median age under 15 years) with units under construction commissioning to ~2032, and India's target is net zero by 2070, not 2050.
            Coal output peaks by 2035, holds to 2040 and is cut after (staying below its cap), so power-sector emissions peak by 2035–40.{' '}
            <b>Absolute emissions:</b> in the selected strategy, 2047 emissions are {fmt.num(em.at(-1)![strategy])} Mt against {fmt.num(em[0][strategy])} Mt in 2025
            ({em.at(-1)![strategy] >= em[0][strategy] ? '+' : '−'}{fmt.pct(Math.abs(em.at(-1)![strategy] / em[0][strategy] - 1))}), while generation more than triples. Intensity falls much faster than the total.</>}>
          <Legend items={STRATS.map((k) => ({ label: d.strategies[k].label, color: stratColor[k], line: true }))} />
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={em} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="year" type="number" domain={[2025, 2047]} ticks={MILESTONES} {...axisProps(p)} />
              <YAxis {...axisProps(p)} axisLine={false} width={48} tickFormatter={(v) => fmt.num(v)} />
              {STRATS.map((k) => <Line key={k} dataKey={k} stroke={stratColor[k]} strokeWidth={k === strategy ? 2.5 : 1.5}
                dot={{ r: 4, strokeWidth: 2, stroke: p.surface, fill: stratColor[k] }} isAnimationActive={false} />)}
              <Tooltip cursor={{ stroke: p.axis }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as Record<string, number>
                return <TT title={label} rows={STRATS.map((k) => ({ label: d.strategies[k].label, value: `${fmt.num(r[k])} Mt`, color: stratColor[k] }))} />
              }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="2047 generation mix by region" desc="Where each source is produced, reflecting local resource strengths."
        table={{ columns: ['Region', ...SOURCES.map((s) => SOURCE_LABEL[s]), 'Total', 'Clean %', 'g/kWh'], rows: regRows.map((r) => [r.region, ...SOURCES.map((s) => Math.round(r[s])), Math.round(r.total), fmt.pct(shift.find((x) => x.region === r.region)!.clean), Math.round(shift.find((x) => x.region === r.region)!.intensity)]) }}>
        <Legend items={SOURCES.map((s) => ({ label: SOURCE_LABEL[s], color: p.source[s] }))} />
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={regRows} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 0 }} barCategoryGap="26%">
            <CartesianGrid stroke={p.grid} horizontal={false} />
            <XAxis type="number" {...axisProps(p)} tickFormatter={(v) => fmt.num(v)} />
            <YAxis type="category" dataKey="region" {...axisProps(p)} width={84} axisLine={false} />
            {SOURCES.map((s, i) => <Bar key={s} dataKey={s} stackId="r" fill={p.source[s]} stroke={p.surface} strokeWidth={1}
              radius={i === SOURCES.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false} />)}
            <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as Record<string, number>
              const sh = shift.find((x) => x.region === label)!
              return <TT title={`${label} · 2047`} rows={[...SOURCES].reverse().filter((s) => r[s] > 0.5).map((s) => ({ label: SOURCE_LABEL[s], value: `${fmt.num(r[s])} · ${fmt.pct(r[s] / r.total)}`, color: p.source[s] }))}
                total={{ label: `Total · ${fmt.pct(sh.clean)} clean`, value: fmt.twh(r.total) }} />
            }} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid g-2-1">
        <Card title="Re-allocation of production vs BAU path, 2047"
          desc="Positive: the region produces more than its BAU requirement (resource-rich, exports). Negative: production shifts out (resource-limited, imports)."
          table={{ columns: ['Region', 'Optimised TWh', 'BAU TWh', 'Shift TWh'], rows: shift.map((r) => [r.region, Math.round(r.prod), Math.round(r.bau), Math.round(r.shift)]) }}
          foot={`Net sum equals storage/curtailment losses on VRE. Transfers carry a ₹${d.optimizer.wheeling}/kWh wheeling cost; the North-East may produce up to 3× its requirement (hydro export hub), others up to 1.5×.`}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={shift} margin={{ top: 16, right: 8, left: 4, bottom: 0 }} barCategoryGap="34%">
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="region" {...axisProps(p)} />
              <YAxis {...axisProps(p)} axisLine={false} width={48} tickFormatter={(v) => fmt.num(v)} />
              <ReferenceLine y={0} stroke={p.axis} />
              <Bar dataKey="shift" isAnimationActive={false} radius={[4, 4, 4, 4]}
                label={{ position: 'top', fill: p.ink2, fontSize: 11, formatter: (v: number) => `${v > 0 ? '+' : ''}${fmt.num(v)}` }}>
                {shift.map((r) => <Cell key={r.region} fill={r.shift >= 0 ? p.accent : p.region.West} />)}
              </Bar>
              <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as typeof shift[number]
                return <TT title={r.region} rows={[{ label: 'Optimised production', value: fmt.twh(r.prod) }, { label: 'BAU requirement', value: fmt.twh(r.bau) }, { label: 'Shift', value: `${r.shift > 0 ? '+' : ''}${fmt.twh(r.shift)}` }]} />
              }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Strategy levers" desc={d.strategies[strategy].label}>
          <div className="table-wrap"><table>
            <thead><tr><th>Lever</th>{MILESTONES.slice(1).map((y) => <th key={y} className="num">{y}</th>)}</tr></thead>
            <tbody>
              <tr><td>Carbon price ₹/t</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{fmt.num(d.strategies[strategy].carbon[y])}</td>)}</tr>
              <tr><td>VRE share limit</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{fmt.pct(d.strategies[strategy].vre_max[y])}</td>)}</tr>
              <tr><td>Solar share limit</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{fmt.pct(d.strategies[strategy].solar_max[y])}</td>)}</tr>
              <tr><td>Nuclear ceiling TWh</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{fmt.num(d.strategies[strategy].nuclear_max[y])}</td>)}</tr>
              <tr><td>Coal cap TWh</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{fmt.num(d.strategies[strategy].coal_cap[y])}</td>)}</tr>
              <tr><td>Coal fleet retained</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{fmt.pct(d.strategies[strategy].coal_survival[y])}</td>)}</tr>
              <tr><td>Marginal cost ₹/kWh</td>{MILESTONES.slice(1).map((y) => <td key={y} className="num">{run.marginal_cost[y] > 50 ? '—' : run.marginal_cost[y].toFixed(2)}</td>)}</tr>
            </tbody>
          </table></div>
          <div className="foot">Marginal cost is the dual price of the national requirement: the system cost of one more kWh, including carbon and firming.</div>
        </Card>
      </div>
    </div>
  )
}
