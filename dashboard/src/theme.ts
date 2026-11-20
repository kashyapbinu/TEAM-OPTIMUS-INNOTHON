import { useEffect, useState } from 'react'
import type { Region, Source } from './types'

/** Stack / legend order. Validated (adjacent CVD ΔE >= 8, normal-vision >= 15) in light AND dark. */
export const SOURCES: Source[] = ['coal', 'nuclear', 'gas', 'bio', 'hydro', 'wind', 'solar']
export const SOURCE_LABEL: Record<Source, string> = {
  coal: 'Coal', nuclear: 'Nuclear', gas: 'Gas', bio: 'Bioenergy', hydro: 'Hydro', wind: 'Wind', solar: 'Solar',
}
export const REGIONS: Region[] = ['North', 'West', 'South', 'East', 'North-East']

type Mode = 'light' | 'dark'

const SOURCE_COLORS: Record<Mode, Record<Source, string>> = {
  light: { coal: '#eb6834', nuclear: '#6250d6', gas: '#e87ba4', bio: '#008300', hydro: '#2a78d6', wind: '#1baf7a', solar: '#eda100' },
  dark: { coal: '#d95926', nuclear: '#9085e9', gas: '#d55181', bio: '#0ca30c', hydro: '#3987e5', wind: '#199e70', solar: '#c98500' },
}
// regions take categorical slots 1..5 in fixed order (adjacent-validated in the reference palette)
const REGION_COLORS: Record<Mode, Record<Region, string>> = {
  light: { North: '#2a78d6', West: '#eb6834', South: '#1baf7a', East: '#eda100', 'North-East': '#e87ba4' },
  dark: { North: '#3987e5', West: '#d95926', South: '#199e70', East: '#c98500', 'North-East': '#d55181' },
}
export const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

export interface Palette {
  mode: Mode
  source: Record<Source, string>
  region: Record<Region, string>
  ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string; page: string
  accent: string; band: string; good: string; critical: string; warning: string
}

export function palette(mode: Mode): Palette {
  const d = mode === 'dark'
  return {
    mode,
    source: SOURCE_COLORS[mode],
    region: REGION_COLORS[mode],
    ink: d ? '#f0efec' : '#0b0b0b',
    ink2: d ? '#c3c2b7' : '#52514e',
    muted: '#898781',
    grid: d ? '#2c2c2a' : '#e1e0d9',
    axis: d ? '#383835' : '#c3c2b7',
    surface: d ? '#1a1a19' : '#fcfcfb',
    page: d ? '#0d0d0d' : '#f9f9f7',
    accent: d ? '#3987e5' : '#2a78d6',
    band: d ? '#3987e5' : '#2a78d6',
    good: '#0ca30c', critical: '#d03b3b', warning: '#fab219',
  }
}

export function useTheme(): [Palette, Mode, (m: Mode) => void] {
  const initial = (): Mode => {
    const q = new URLSearchParams(window.location.search).get('theme')
    if (q === 'light' || q === 'dark') return q
    try {
      const s = localStorage.getItem('theme')
      if (s === 'light' || s === 'dark') return s
    } catch { /* storage unavailable */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  const [mode, setMode] = useState<Mode>(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = mode
    try { localStorage.setItem('theme', mode) } catch { /* ignore */ }
  }, [mode])
  return [palette(mode), mode, setMode]
}

export const fmt = {
  twh: (v: number) => `${Math.round(v).toLocaleString('en-IN')} TWh`,
  num: (v: number, d = 0) => v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }),
  pct: (v: number, d = 0) => `${(v * 100).toFixed(d)}%`,
  mn: (v: number) => `${(v / 1e6).toFixed(1)} M`,
  cr: (v: number) => `${(v / 1e7).toFixed(1)} Cr`,
}
