import { useEffect, useState } from 'react'
import type { Bundle, ScenarioKey, StrategyKey } from './types'
import { useTheme, type Palette } from './theme'
import { Seg } from './components/ui'
import Overview from './views/Overview'
import Regional from './views/Regional'
import Strategy from './views/Strategy'
import Profiles from './views/Profiles'
import WhatIf from './views/WhatIf'
import Method from './views/Method'

export interface Ctx { d: Bundle; p: Palette; scenario: ScenarioKey; strategy: StrategyKey; setStrategy: (s: StrategyKey) => void }

const TABS = [
  { key: 'overview', label: 'National forecast' },
  { key: 'regional', label: 'Regional forecast' },
  { key: 'strategy', label: 'Generation strategy' },
  { key: 'profiles', label: 'Region profiles' },
  { key: 'whatif', label: 'What-if lab' },
  { key: 'method', label: 'Method & assumptions' },
] as const
type TabKey = typeof TABS[number]['key']

function readHash(): TabKey {
  const h = window.location.hash.replace('#', '')
  return (TABS.find((t) => t.key === h)?.key ?? 'overview') as TabKey
}

export default function App() {
  const [d, setD] = useState<Bundle | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [p, mode, setMode] = useTheme()
  const [scenario, setScenario] = useState<ScenarioKey>('base')
  const [strategy, setStrategy] = useState<StrategyKey>('balanced')
  const [tab, setTab] = useState<TabKey>(readHash)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/dashboard.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setD)
      .catch((e) => setErr(String(e)))
  }, [])
  useEffect(() => {
    const on = () => setTab(readHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (k: TabKey) => { window.location.hash = k; setTab(k) }

  if (err) return <div style={{ padding: 40 }}>Could not load model outputs: {err}. Run the Python pipeline (see README).</div>
  if (!d) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading model outputs…</div>
  const ctx: Ctx = { d, p, scenario, strategy, setStrategy }

  return (
    <>
      <header className="header">
        <div>
          <div className="eyebrow">India · Electricity generation outlook · 2025 → 2047</div>
          <h1>Powering Viksit Bharat: India's generation requirement and regional mix to 2047</h1>
          <p className="sub">
            A data-driven forecast of how much electricity India must <b>generate</b> by 2047 (national and by grid region),
            and an optimised, region-specific plan for producing it. All figures are generation (TWh), never capacity or consumption.
          </p>
        </div>
        <div className="controls">
          <label className="control"><span>Demand scenario</span>
            <Seg label="Demand scenario" value={scenario} onChange={setScenario}
              options={[{ key: 'low', label: 'Low' }, { key: 'base', label: 'Base' }, { key: 'high', label: 'High' }]} />
          </label>
          <label className="control"><span>Supply strategy</span>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKey)} aria-label="Supply strategy">
              {(Object.keys(d.strategies) as StrategyKey[]).map((k) => <option key={k} value={k}>{d.strategies[k].label}</option>)}
            </select>
          </label>
          <label className="control"><span>Theme</span>
            <button className="icon-btn" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
              {mode === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
          </label>
        </div>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)}>{t.label}</button>
        ))}
      </nav>
      <main>
        {tab === 'overview' && <Overview {...ctx} />}
        {tab === 'regional' && <Regional {...ctx} />}
        {tab === 'strategy' && <Strategy {...ctx} />}
        {tab === 'profiles' && <Profiles {...ctx} />}
        {tab === 'whatif' && <WhatIf {...ctx} />}
        {tab === 'method' && <Method {...ctx} />}
      </main>
      <footer className="foot" style={{ marginTop: 40 }}>
        Model outputs generated {d.generated}. Sources: National Power Portal (CEA), Renewable India dataset, Ember India electricity data, Energy Institute/Ember via Our World in Data, UN WPP 2024 & WUP,
        World Bank, NISE, NIWE, CEA, CEEW, NITI Aayog (new loads), IEA. Built for the ExxonMobil Innothon.
      </footer>
    </>
  )
}
