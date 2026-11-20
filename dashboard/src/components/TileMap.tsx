import type { Palette } from '../theme'
import { SEQ } from '../theme'
import type { Region } from '../types'

/** Schematic tile-grid map of India (one equal-size tile per state/UT, placed by approximate geography).
 *  Avoids boundary disputes and gives small states equal visual weight. */
const POS: Record<string, [number, number]> = {
  JK: [2, 0], LA: [3, 0],
  CH: [1, 1], PB: [2, 1], HP: [3, 1], UK: [4, 1], AR: [9, 1],
  RJ: [1, 2], HR: [2, 2], DL: [3, 2], UP: [4, 2], BR: [5, 2], SK: [6, 2], AS: [8, 2], NL: [9, 2],
  GJ: [1, 3], MP: [2, 3], CG: [3, 3], JH: [4, 3], WB: [5, 3], ML: [8, 3], MN: [9, 3],
  DD: [0, 4], MH: [1, 4], TS: [2, 4], OD: [4, 4], TR: [8, 4], MZ: [9, 4],
  GA: [1, 5], KA: [2, 5], AP: [3, 5],
  LD: [0, 6], KL: [2, 6], TN: [3, 6], PY: [4, 6], AN: [7, 6],
}

/** light: pale→dark blue; dark: deep→bright blue (high values stand out from the dark surface) */
export function seqScale(mode: 'light' | 'dark') {
  return mode === 'dark' ? SEQ.slice(2, 13).reverse() : SEQ.slice(0, 11)
}

export interface TileDatum { code: string; name: string; region: Region; value: number; label: string; note?: string }

export default function TileMap({ data, p, colorBy, selected, onSelect, domain }: {
  data: TileDatum[]; p: Palette; colorBy: 'value' | 'region'; selected?: string; onSelect: (code: string) => void
  domain: [number, number]
}) {
  const S = 54, G = 4
  const W = 10 * (S + G), H = 7 * (S + G)
  const [lo, hi] = domain
  const color = (d: TileDatum) => {
    if (colorBy === 'region') return p.region[d.region]
    const t = Math.max(0, Math.min(1, (d.value - lo) / (hi - lo || 1)))
    const scale = seqScale(p.mode)
    return scale[Math.min(scale.length - 1, Math.floor(t * scale.length))]
  }
  const inkOn = (d: TileDatum) => {
    if (colorBy === 'region') return d.region === 'East' ? '#0b0b0b' : '#ffffff'
    const t = (d.value - lo) / (hi - lo || 1)
    return p.mode === 'dark' ? (t > 0.55 ? '#0b0b0b' : '#ffffff') : t > 0.5 ? '#ffffff' : '#0b0b0b'
  }
  return (
    <svg className="tilemap" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tile map of Indian states">
      {data.map((d) => {
        const pos = POS[d.code]
        if (!pos) return null
        const x = pos[0] * (S + G), y = pos[1] * (S + G)
        const sel = selected === d.code
        return (
          <g key={d.code} className="t" tabIndex={0} role="button" aria-label={`${d.name}: ${d.label}${d.note ? `. ${d.note}` : ''}`}
            onClick={() => onSelect(d.code)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(d.code) }}>
            <title>{`${d.name} (${d.region}) — ${d.label}${d.note ? `. ${d.note}` : ''}`}</title>
            <rect x={x} y={y} width={S} height={S} rx={8} fill={color(d)}
              stroke={sel ? p.ink : p.surface} strokeWidth={sel ? 2.5 : 1} />
            <text x={x + S / 2} y={y + 23} textAnchor="middle" fontSize={13} fontWeight={700} fill={inkOn(d)}>{d.code}</text>
            <text x={x + S / 2} y={y + 40} textAnchor="middle" fontSize={10} fill={inkOn(d)} opacity={0.85}>{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
