import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Ctx } from '../App'
import { Card, DataTable, Legend, TT, axisProps } from '../components/ui'
import { ASSUMPTIONS, UNCERTAINTIES } from '../content'
import { fmt } from '../theme'
import type { SensRow } from '../types'

export default function Method({ d, p, scenario }: Ctx) {
  const bt = d.backtest.national
  const m = d.model
  const col = { A_driver: p.accent, B_crosscountry: p.region.West, C_ets: p.region.South }
  const name = { A_driver: 'A · Driver regression', B_crosscountry: 'B · Cross-country curve', C_ets: 'C · Damped-trend ETS' }
  const keys = ['A_driver', 'B_crosscountry', 'C_ets'] as const
  const wkeys = ['P_provided', 'A_driver', 'C_ets', 'B_crosscountry'] as const
  const wname = { P_provided: 'P · Provided-data trend', ...name }
  const wcol = { P_provided: p.ink, ...col }

  return (
    <div className="stack">
      <div className="callout">
        <b>Compliance with the challenge rule.</b> Every energy quantity used for forecasting or comparison is <b>electricity generated (TWh)</b>.
        The supplied GitHub dataset's energy columns are installed capacity (MW), so only its population, GSDP and zone columns are used. From the National Power Portal only generation (GWh) reports are used, not its capacity dashboard.
        Published resource potentials (GW) are converted to annual <i>generation</i> ceilings (TWh) before entering the optimiser. They never enter the demand forecast.
        No consumption or demand data is used.
        <br /><b>Provided data lead the forecast.</b> The 2025 anchor is grid generation from the National Power Portal, and half of the ensemble weight sits on model P, which is fitted only on the provided datasets. Literature models (A, B, C) share the other half: they supply the income, urbanisation and saturation relationships that seven years of provided data cannot identify.
      </div>

      <Card title="Pipeline">
        <div className="flow">
          <div className="step"><b>1 · Ingest</b>National Power Portal state × fuel generation (2020–25) + Ember RE, national generation 1985–2025, UN population and urbanisation, World Bank GDP, GSDP/population by state</div>
          <div className="arrow">→</div>
          <div className="step"><b>2 · National forecast</b>Model P (provided data, 50%) + three literature models (50%, inverse backtest-error weighted); plus explicit new loads; 3,000-run Monte Carlo</div>
          <div className="arrow">→</div>
          <div className="step"><b>3 · Regional forecast</b>State drivers projected (pop, income, urban); shift-share growth; reconciled to national</div>
          <div className="arrow">→</div>
          <div className="step"><b>4 · Strategy LP</b>Region × source × milestone; cost + carbon minimised under resource, build, balancing and policy constraints</div>
          <div className="arrow">→</div>
          <div className="step"><b>5 · Dashboard</b>Static JSON; the national model is re-implemented in the browser for what-if analysis</div>
        </div>
      </Card>

      <Card title="Where the forecast comes from: ensemble weights"
        desc="Weight of each model in the national trend. Model P uses only the provided datasets; A, B and C are literature-based and down-weighted, as the panel advised."
        table={{ columns: ['Model', 'Data', 'Weight'], rows: wkeys.map((k) => [wname[k], k === 'P_provided' ? 'Provided (NPP + challenge dataset)' : 'Supporting literature', fmt.pct(m.weights[k])]) }}>
        <div className="wbar" style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', border: `1px solid ${p.grid}` }}>
          {wkeys.map((k) => (
            <div key={k} title={`${wname[k]}: ${fmt.pct(m.weights[k])}`} style={{ width: `${m.weights[k] * 100}%`, background: wcol[k], borderRight: `2px solid ${p.surface}` }} />
          ))}
        </div>
        <Legend items={wkeys.map((k) => ({ label: `${wname[k]} · ${fmt.pct(m.weights[k])}`, color: wcol[k] }))} />
        <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6 }}>Provided data: <b>{fmt.pct(m.weights.P_provided)}</b> of the trend, plus the 2025 anchor ({fmt.num(m.anchor_2025_twh)} TWh) and the state base-year generation and population/income drivers behind the regional split. Model P has only seven years of data (2019–25), so it cannot be backtested over 2015–25 like A, B and C; its weight is set by design, not by error.</p>
      </Card>

      {(() => {
        const nat = d.forecast.national
        const r = nat.find((x) => x.scenario === scenario && x.year === 2047)!
        const b = nat.find((x) => x.scenario === 'base' && x.year === 2047)!
        const r25 = nat.find((x) => x.scenario === scenario && x.year === 2025)!
        const k = (r.A_driver + r.B_crosscountry) / (b.A_driver + b.B_crosscountry)
        const sc = d.scenarios[scenario]
        const w = m.weights
        const val = { P_provided: r.P_provided * k, A_driver: r.A_driver, C_ets: r.C_ets * k, B_crosscountry: r.B_crosscountry }
        const how = {
          P_provided: `${fmt.num(r25.kwh_per_capita)} kWh/person (2025) grown ${(m.P.slope * 100).toFixed(2)}%/yr × ${fmt.num(b.population / 1e9, 3)} bn people (UN)`,
          A_driver: `Income ${fmt.num(r25.gdp_pc_usd2015)} → ${fmt.num(r.gdp_pc_usd2015)} US$/person (elasticity ${m.A.lg.toFixed(2)}), urban ${r25.urban_pct.toFixed(1)}% → ${r.urban_pct.toFixed(1)}%`,
          C_ets: 'Damped trend of 1990–2025 generation',
          B_crosscountry: `${m.B_countries}-country curve, same income and urbanisation path as A`,
        }
        const loads = r.green_hydrogen + r.e_mobility + r.data_centres
        const cagrV = (r.total / r25.total) ** (1 / 22) - 1
        return (
          <Card title={`How the 2047 number is built (${sc.label})`}
            desc="Three steps: each model's 2047 trend, the weighted blend, then explicit new loads. All models start from the same 2025 grid anchor. Follows the demand-scenario switch."
            foot={`${scenario === 'base' ? '' : `In this scenario P and C (no drivers) are scaled by A+B relative to Base (×${k.toFixed(2)}). `}EV and data-centre loads are end-use and are divided by ${(1 - d.calculator.loss).toFixed(2)} (${fmt.pct(d.calculator.loss)} grid and plant losses); the hydrogen figure is already generation. Captive generation (~${fmt.num(m.captive.twh_2047_trend)} TWh in 2047) is outside the grid basis and not included.`}>
            <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Step 1–2 · Model trends and weighted blend (TWh, 2047)</h4>
            <DataTable columns={['Model', 'How it gets to 2047', '2047 trend', 'Weight', 'Contribution']} numeric={[false, false, true, true, true]}
              rows={[
                ...wkeys.map((key) => [wname[key], how[key], fmt.num(val[key]), fmt.pct(w[key], 1), fmt.num(w[key] * val[key])]),
                ['Trend (weighted blend)', '', '', '100%', fmt.num(r.trend)],
              ]} />
            <h4 style={{ fontSize: 13, margin: '14px 0 6px' }}>Step 3 · New loads not in the history (NITI Aayog 2026 path)</h4>
            <DataTable columns={['Load', '2047 end-use', 'Generation needed (TWh)']} numeric={[false, true, true]}
              rows={[
                ['Green hydrogen', `${sc.h2_mt_2047} Mt × ${d.calculator.h2_kwh_per_kg} kWh/kg`, fmt.num(r.green_hydrogen)],
                ['Electric vehicles', `${fmt.num(sc.ev_twh_2047)} TWh`, fmt.num(r.e_mobility)],
                ['Data centres', `${fmt.num(sc.dc_twh_2047)} TWh`, fmt.num(r.data_centres)],
                ['New loads', '', fmt.num(loads)],
              ]} />
            <div className="callout" style={{ marginTop: 12 }}>
              Trend <b>{fmt.num(r.trend)}</b> + new loads <b>{fmt.num(loads)}</b> = <b>{fmt.num(r.total)} TWh</b> in 2047
              ({(r.total / r25.total).toFixed(1)}× 2025, {fmt.pct(cagrV, 1)}/yr; {fmt.num(r.kwh_per_capita)} kWh/person).
              Model P (provided data) contributes {fmt.num(w.P_provided * val.P_provided)} TWh, {fmt.pct((w.P_provided * val.P_provided) / r.trend)} of the trend.
            </div>
          </Card>
        )
      })()}

      <div className="grid g2">
        <Card title="Out-of-sample backtest, 2015–2025"
          desc="Each model trained on data to 2014, then forecast 2015–2025 using realised drivers. Actual = OWID total rescaled to the 2025 grid level (a level shift that leaves the error percentages unchanged)."
          table={{ columns: ['Year', 'Actual', ...keys.map((k) => name[k])], rows: bt.map((r) => [r.year, Math.round(r.actual), ...keys.map((k) => Math.round(r[k]))]) }}
          foot={`MAPE: ${keys.map((k) => `${name[k].split(' · ')[0]} ${m.backtest_mape[k].toFixed(1)}%`).join(' · ')}. Ensemble weights: P ${fmt.pct(m.weights.P_provided)} (provided data, not backtestable) · ${keys.map((k) => `${name[k].split(' · ')[0]} ${fmt.pct(m.weights[k])}`).join(' · ')}.`}>
          <Legend items={[{ label: 'Actual', color: p.ink, line: true }, ...keys.map((k) => ({ label: name[k], color: col[k], line: true }))]} />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={bt} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} vertical={false} />
              <XAxis dataKey="year" {...axisProps(p)} />
              <YAxis {...axisProps(p)} axisLine={false} width={48} domain={['auto', 'auto']} tickFormatter={(v) => fmt.num(v)} />
              <Line dataKey="actual" stroke={p.ink} strokeWidth={2.5} dot={{ r: 4, fill: p.ink, stroke: p.surface, strokeWidth: 2 }} isAnimationActive={false} />
              {keys.map((k) => <Line key={k} dataKey={k} stroke={col[k]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
              <Tooltip cursor={{ stroke: p.axis }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as typeof bt[number]
                return <TT title={label} rows={[{ label: 'Actual', value: fmt.twh(r.actual), color: p.ink }, ...keys.map((k) => ({ label: name[k], value: `${fmt.num(r[k])} (${(((r[k] - r.actual) / r.actual) * 100).toFixed(1)}%)`, color: col[k] }))]} />
              }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Model specification">
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
            <p><b style={{ color: 'var(--ink)' }}>P · Provided-data trend (2019–2025).</b> ln(kWh/person) = a + g·year, where generation = NPP state generation (+ Ember solar/wind/bio, not on NPP)
              and population = challenge dataset. g = <b>{(m.P.slope * 100).toFixed(2)}%/yr</b> (se {(m.P.se * 100).toFixed(2)}). Continued from the 2025 anchor and, like C, scaled by the driver models' scenario response.
              An income elasticity cannot be fitted on provided data alone: the dataset's 2021–24 GSDP is imputed, which gives an implausible elasticity of about 2.5.</p>
            <p style={{ marginTop: 8 }}><b style={{ color: 'var(--ink)' }}>A · Driver regression (India, 2000–2025).</b> ln(kWh/person) = a + β·ln(GDP/person) + γ·Urban%.
              β = <b>{m.A.lg.toFixed(3)}</b> (se {m.A_bse.lg.toFixed(3)}), R² {m.A_r2.toFixed(3)}. γ is fixed at the panel estimate because
              India's urbanisation and income are collinear in time.</p>
            <p style={{ marginTop: 8 }}><b style={{ color: 'var(--ink)' }}>B · Cross-country development curve.</b> {m.B_countries} economies, 1985–2022, country + year fixed effects:
              ln(kWh/person) = αᵢ + τₜ + b₁·ln y + b₂·(ln y)² + γ·Urban%. b₁ {m.B.lg.toFixed(2)}, b₂ {m.B.lg2.toFixed(3)}, γ <b>{m.B.urban.toFixed(4)}</b> (se {m.B_bse.urban.toFixed(4)}).
              The income elasticity falls as countries get richer, giving saturation.</p>
            <p style={{ marginTop: 8 }}><b style={{ color: 'var(--ink)' }}>C · Damped-trend exponential smoothing</b> on ln(total generation), 1990–2025 (OWID history rescaled to the 2025 grid level). It has no drivers, so in scenarios
              it is scaled by the driver models' relative response.</p>
            <p style={{ marginTop: 8 }}><b style={{ color: 'var(--ink)' }}>Regional.</b> State 2025 generation × (Pop ratio) × (GSDP/person ratio)^β × e^(γ·ΔUrban), reconciled to the national total.
              State population shares follow a damped 2015–24 trend; income differentials (observed 2015–19 GSDP; the dataset's 2021–24 values are imputed) decay with a 15-year half-life, capped at ±1.5%/yr; state urbanisation is logit-shifted to match the national path.</p>
            <p style={{ marginTop: 8 }}><b style={{ color: 'var(--ink)' }}>Uncertainty.</b> 3,000 Monte Carlo draws over GDP growth (σ 1.2 pp), urbanisation (39–50%), population (σ 2.5%),
              coefficient covariance, the model P growth rate (its standard error) and new-load scale (0.3–1.7×).</p>
          </div>
          <h4 style={{ fontSize: 13, margin: '14px 0 6px' }}>Regional backtest (2019 → 2024 shares)</h4>
          <DataTable columns={['Region', 'Actual 2024', 'Shift-share', 'Constant 2019']}
            rows={d.backtest.regional.map((r) => [r.region, fmt.pct(r.actual_share_2024, 1), fmt.pct(r.shift_share_pred, 1), fmt.pct(r.naive_2019_share, 1)])} />
        </Card>
      </div>

      <Card title="Assumptions register" desc="Every number in the dashboard traces to one of these, or to a source dataset.">
        <div className="stack-sm"><DataTable columns={['Area', 'Item', 'Value', 'Basis']} numeric={[false, false, false, false]} rows={ASSUMPTIONS.map((a) => [a.area, a.item, a.value, a.basis])} /></div>
      </Card>

      <Card title="Sensitivity of the recommended plan (Balanced, Base demand)"
        desc="Each analyst assumption group is moved −20% and +20% on its own and the optimiser is re-run. Values shown as −20% / +20%; central case in the first row."
        foot={(() => {
          const dev = d.sensitivity.find((r) => r.assumption === 'Developable RE share' && r.case === '-20%')!
          return `LCOE, storage cost, build-rate and committed-pipeline changes move system cost but barely change the 2047 mix: the plan is set by resource, balancing and policy limits, not by cost ranking. The binding risk is resource development: if only 80% of the assumed developable solar/wind/hydro is realised, ${fmt.num(dev.unserved_2047_twh)} TWh (${fmt.pct(dev.unserved_2047_twh / dev.req_2047_twh)}) of the 2047 requirement is unserved unless coal or nuclear limits are relaxed. New loads (green H2, EVs, data centres) are scaled on the requirement side. System cost includes the carbon price.`
        })()}>
        <DataTable columns={['Assumption', 'Clean share 2047', 'g CO₂/kWh 2047', 'Coal 2047 (TWh)', 'Coal peak (TWh, year)', 'Unserved 2047 (TWh)', 'System cost (₹/kWh)']}
          numeric={[false, true, true, true, true, true, true]}
          rows={(() => {
            const S = d.sensitivity
            const c = S.find((r) => r.case === 'central')!
            const one = (r: SensRow) => [fmt.pct(r.clean_share_2047), Math.round(r.g_per_kwh_2047), fmt.num(r.coal_2047_twh), `${fmt.num(r.coal_peak_twh)} (${r.coal_peak_year})`, fmt.num(r.unserved_2047_twh), r.system_cost_rs_kwh.toFixed(2)]
            const rows: (string | number)[][] = [['Central case', ...one(c).map(String)]]
            for (const a of [...new Set(S.filter((r) => r.case !== 'central').map((r) => r.assumption))]) {
              const lo = one(S.find((r) => r.assumption === a && r.case === '-20%')!)
              const hi = one(S.find((r) => r.assumption === a && r.case === '+20%')!)
              rows.push([a, ...lo.map((v, i) => `${v} / ${hi[i]}`)])
            }
            return rows
          })()} />
      </Card>

      <div>
        <h3 className="section-title">Uncertainties and limitations</h3>
        <div className="grid g2">
          {UNCERTAINTIES.map((u) => <Card key={u.title} title={u.title}><p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{u.body}</p></Card>)}
        </div>
      </div>

      <Card title="Data sources">
        <ul className="clean">
          <li><b>National Power Portal (provided dataset):</b> CEA monthly generation reports, state × station × fuel, Jul 2019–Dec 2025: coal, lignite, gas, nuclear, large hydro. NPP publishes no solar, wind, bio, small hydro or captive generation.</li>
          <li><b>Renewable India dataset (provided, GitHub):</b> state population and GSDP (capacity columns excluded).</li>
          <li>Ember India electricity data (CC-BY), only for what NPP does not publish: state solar, wind, bio and small-hydro generation, and 2019. Equal to NPP to 0.0% wherever both publish.</li>
          <li>Supporting literature for growth relationships: Our World in Data energy dataset (Energy Institute Statistical Review, Ember): India generation incl. captive 1985–2025 (rescaled to the grid level to fit models A and C; shown unscaled as the captive-inclusive reference); 41-country peer panel with Maddison GDP. Together these carry half the ensemble weight.</li>
          <li>UN World Population Prospects 2024 (medium variant); UN World Urbanization Prospects; World Bank WDI GDP (constant 2015 USD).</li>
          <li>Census of India 2011 state urbanisation.</li>
          <li>NIWE wind atlas at 150 m (state × CUF band); NISE solar potential (2025 ground-mounted, state-wise; 2026 floating); CEEW rooftop solar (2023); CEA hydro reassessment 2017–23 (state-wise, PIB 2024).</li>
        </ul>
      </Card>
    </div>
  )
}
