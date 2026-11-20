import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ctx } from '../App'
import { Card, Legend, Tile, TT, axisProps } from '../components/ui'
import { REGION_STORY } from '../content'
import { MILESTONES, regionMix, summary } from '../selectors'
import { fmt, REGIONS, SOURCE_LABEL, SOURCES } from '../theme'
import type { Region, Source } from '../types'

export default function Profiles({ d, p, scenario, strategy }: Ctx) {
  const [region, setRegion] = useState<Region>('North')
  const story = REGION_STORY[region]
  const sum = summary(d, strategy, scenario).filter((r) => r.region === region)
  const s25 = sum.find((r) => r.year === 2025)!, s47 = sum.find((r) => r.year === 2047)!
  const mixRows = MILESTONES.map((y) => ({ year: String(y), ...regionMix(d, strategy, scenario, y, region) }))
  const m47 = mixRows.at(-1)!

  const res: Source[] = ['solar', 'wind', 'hydro']
  const potRows = res.map((s) => {
    const pot = d.potential.region.find((r) => r.region === region && r.source === s)?.twh_potential ?? 0
    const used = m47[s]
    return { source: SOURCE_LABEL[s], key: s, used, headroom: Math.max(pot - used, 0), pot }
  })
  const share = (s25.production_twh / d.strategy.summary.filter((r) => r.strategy === strategy && r.scenario === scenario && r.year === 2025).reduce((a, r) => a + r.production_twh, 0))
  const share47 = (s47.production_twh / d.strategy.summary.filter((r) => r.strategy === strategy && r.scenario === scenario && r.year === 2047).reduce((a, r) => a + r.production_twh, 0))
  const topSource = SOURCES.reduce((a, s) => (m47[s] > m47[a] ? s : a), 'coal' as Source)

  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Region">
        {REGIONS.map((r) => (
          <button key={r} className="chip" aria-pressed={r === region} onClick={() => setRegion(r)}>
            <i style={{ background: p.region[r] }} />{r}
          </button>
        ))}
      </div>
      <div>
        <h2 style={{ fontSize: 22 }}>{region}</h2>
        <p className="section-sub" style={{ marginTop: 4 }}>{story.tagline} <span style={{ color: 'var(--muted)' }}>States: {story.states}.</span></p>
      </div>
      <div className="tiles">
        <Tile label="BAU production requirement" value={fmt.num(s47.bau_requirement_twh)} unit="TWh 2047"
          note={`${(s47.bau_requirement_twh / s25.bau_requirement_twh).toFixed(1)}× 2025 (${fmt.num(s25.bau_requirement_twh)} TWh)`} />
        <Tile label="Optimised production 2047" value={fmt.num(s47.production_twh)} unit="TWh"
          note={`${s47.shift_vs_bau_twh >= 0 ? 'Exports' : 'Imports'} ${fmt.num(Math.abs(s47.shift_vs_bau_twh))} TWh vs BAU · ${fmt.pct(share, 0)} → ${fmt.pct(share47, 0)} of India`} />
        <Tile label="Clean share" value={fmt.pct(s47.clean_share)} note={`from ${fmt.pct(s25.clean_share)} in 2025 · lead source: ${SOURCE_LABEL[topSource]}`} />
        <Tile label="Carbon intensity" value={fmt.num(s47.intensity_g_per_kwh)} unit="g/kWh" note={`from ${fmt.num(s25.intensity_g_per_kwh)} in 2025`} />
      </div>

      <div className="grid g2">
        <Card title="Generation mix trajectory" desc={`${d.strategies[strategy].label} · ${scenario} demand`}
          table={{ columns: ['Year', ...SOURCES.map((s) => SOURCE_LABEL[s]), 'Total'], rows: mixRows.map((r) => [r.year, ...SOURCES.map((s) => Math.round(r[s])), Math.round(r.total)]) }}>
          <Legend items={SOURCES.map((s) => ({ label: SOURCE_LABEL[s], color: p.source[s] }))} />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mixRows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="year" {...axisProps(p)} />
              <YAxis {...axisProps(p)} axisLine={false} width={48} tickFormatter={(v) => fmt.num(v)} />
              {SOURCES.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={p.source[s]} stroke={p.surface} strokeWidth={1}
                radius={i === SOURCES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
              <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as Record<string, number>
                return <TT title={`${region} · ${label}`} rows={[...SOURCES].reverse().filter((s) => r[s] > 0.5).map((s) => ({ label: SOURCE_LABEL[s], value: `${fmt.num(r[s])} · ${fmt.pct(r[s] / r.total)}`, color: p.source[s] }))}
                  total={{ label: 'Total', value: fmt.twh(r.total) }} />
              }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Renewable resource use in 2047" desc="Generation used vs technical generation potential (TWh/yr), from NISE, NIWE, CEEW and CEA atlases converted to energy."
          table={{ columns: ['Resource', 'Used 2047', 'Potential', 'Utilisation'], rows: potRows.map((r) => [r.source, Math.round(r.used), Math.round(r.pot), r.pot ? fmt.pct(r.used / r.pot) : '—']) }}
          foot="Utilisation is capped by developable-share assumptions (solar 44%, wind 35%, hydro 65% of undeveloped potential by 2047).">
          <Legend items={[{ label: 'Used in 2047', color: p.accent }, { label: 'Remaining potential', color: p.grid }]} />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={potRows} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke={p.grid} horizontal={false} />
              <XAxis type="number" {...axisProps(p)} tickFormatter={(v) => fmt.num(v)} />
              <YAxis type="category" dataKey="source" {...axisProps(p)} width={56} axisLine={false} />
              <Bar dataKey="used" stackId="x" fill={p.accent} stroke={p.surface} strokeWidth={1} isAnimationActive={false} />
              <Bar dataKey="headroom" stackId="x" fill={p.grid} radius={[0, 4, 4, 0]} isAnimationActive={false} />
              <Tooltip cursor={{ fill: p.grid, opacity: 0.4 }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as typeof potRows[number]
                return <TT title={`${region} · ${r.source}`} rows={[{ label: 'Used 2047', value: fmt.twh(r.used) }, { label: 'Technical potential', value: fmt.twh(r.pot) }, { label: 'Utilisation', value: r.pot ? fmt.pct(r.used / r.pot) : '—' }]} />
              }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid g3">
        <Card title="Local strengths"><ul className="clean">{story.strengths.map((s) => <li key={s}>{s}</li>)}</ul></Card>
        <Card title="Constraints & risks"><ul className="clean">{story.constraints.map((s) => <li key={s}>{s}</li>)}</ul></Card>
        <Card title="Role in 2047 & policy hooks">
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>Role:</b> {story.role2047}</p>
          <ul className="clean">{story.policy.map((s) => <li key={s}>{s}</li>)}</ul>
        </Card>
      </div>
    </div>
  )
}
