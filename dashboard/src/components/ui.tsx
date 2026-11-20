import { useState, type ReactNode } from 'react'
import type { Palette } from '../theme'

export function Card(props: {
  title: string; desc?: ReactNode; children: ReactNode; foot?: ReactNode
  table?: { columns: string[]; rows: (string | number)[][]; numeric?: boolean[] }
  action?: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{props.title}</h3>
          {props.desc && <div className="desc">{props.desc}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {props.action}
          {props.table && (
            <button className="link-btn" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? 'Show chart' : 'Show table'}
            </button>
          )}
        </div>
      </div>
      {showTable && props.table ? <DataTable {...props.table} /> : props.children}
      {props.foot && <div className="foot">{props.foot}</div>}
    </section>
  )
}

export function DataTable({ columns, rows, numeric }: { columns: string[]; rows: (string | number)[][]; numeric?: boolean[] }) {
  const isNum = (i: number) => numeric?.[i] ?? i > 0
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((c, i) => <th key={c} className={isNum(i) ? 'num' : ''}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j}>{r.map((v, i) => <td key={i} className={isNum(i) ? 'num' : ''}>{typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Tile({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      {note && <div className="note">{note}</div>}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="legend" role="list">
      {items.map((it) => (
        <span key={it.label} role="listitem">
          <i className={it.line ? 'line' : ''} style={{ background: it.color, opacity: it.dashed ? 0.6 : 1 }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} aria-pressed={o.key === value} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  )
}

/** Recharts custom tooltip body. */
export function TT({ title, rows, total }: {
  title: ReactNode
  rows: { label: string; value: string; color?: string }[]
  total?: { label: string; value: string }
}) {
  return (
    <div className="tt">
      <div className="tt-title">{title}</div>
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span className="k">{r.color && <i style={{ background: r.color }} />}{r.label}</span><b>{r.value}</b>
        </div>
      ))}
      {total && (<><div className="sep" /><div className="row"><span>{total.label}</span><b>{total.value}</b></div></>)}
    </div>
  )
}

export function axisProps(p: Palette) {
  return {
    stroke: p.axis,
    tick: { fill: p.muted, fontSize: 12 },
    tickLine: false,
  }
}
