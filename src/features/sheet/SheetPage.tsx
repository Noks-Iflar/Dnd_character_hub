import { useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { parseSnapshotJson } from '../../lib/snapshot/parse'
import { buildSheet } from '../../lib/snapshot/sheet'
import { SUPPORTED, type Snapshot } from '../../lib/snapshot/types'
import { SheetView } from './SheetView'

/** Phase 2: view a sheet from a local file (snapshot or Export Data). Nothing is uploaded. */
export function SheetPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const result = parseSnapshotJson(await file.text())
    if (result.ok) {
      setSnapshots(result.snapshots)
      setIndex(0)
      setError(null)
    } else {
      setError(result.error)
    }
    e.target.value = ''
  }

  const current = snapshots[index]
  const sheet = useMemo(() => (current ? buildSheet(current) : null), [current])
  const versionMismatch =
    current &&
    ((current.meta.foundryVersion && current.meta.foundryVersion !== SUPPORTED.foundryVersion) ||
      (current.meta.systemVersion && current.meta.systemVersion !== SUPPORTED.systemVersion))

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Link className="brand" to="/" style={{ textDecoration: 'none' }}>
          Dnd Hub
        </Link>
        <label className="btn" style={{ minHeight: 40 }}>
          Открыть файл
          <input type="file" accept=".json,application/json" onChange={onFile} hidden />
        </label>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!sheet && !error && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ fontSize: 28 }}>Лист из файла</h1>
          <p className="muted">
            Открой снимок из макроса «Снимок персонажа» или файл Export Data из Foundry. Файл остаётся на этом устройстве.
          </p>
        </div>
      )}

      {snapshots.length > 1 && (
        <label className="field">
          Персонаж
          <select className="select" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {snapshots.map((s, i) => (
              <option key={i} value={i}>
                {String(s.source.name ?? `Персонаж ${i + 1}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      {versionMismatch && current && (
        <p className="chip chip-blood">
          Снимок из Foundry {current.meta.foundryVersion ?? '?'} / dnd5e {current.meta.systemVersion ?? '?'}, приложение проверено на{' '}
          {SUPPORTED.foundryVersion} / {SUPPORTED.systemVersion}
        </p>
      )}

      {sheet && !sheet.hasComputed && (
        <p className="card muted small">
          Это обычный экспорт Foundry. Значения со знаком <span className="approx">≈</span> посчитаны приложением по правилам, КД и
          атаки появятся в снимке из макроса.
        </p>
      )}

      {sheet && <SheetView sheet={sheet} />}
    </>
  )
}
