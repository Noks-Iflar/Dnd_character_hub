import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { toSafeHtml } from '../../lib/enrichers/enrichers'
import {
  CATEGORY_LABEL,
  ADDABLE_TYPES,
  libraryDescription,
  listLibrary,
  parseLibraryExport,
  uploadLibrary,
  type LibraryCategory,
  type LibraryImportRow,
  type LibraryRow,
} from '../../lib/library'
import { listCharacters, type Character } from '../../lib/db'
import { useViewer } from '../lore/useViewer'
import { AddToInventory } from './AddToInventory'
import { matches, metaLine, priceInCopper, RARITY_LABEL, RARITY_ORDER, rarityRank, TYPE_LABEL } from './labels'

type Sort = 'name' | 'price' | 'rarity' | 'level'
const PAGE = 60
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Loaded once per visit; the catalogue is large and rarely changes
let cache: LibraryRow[] | null = null

function Entry({ row, characters }: { row: LibraryRow; characters: Character[] }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <details
      className="list-details"
      onToggle={(e) => {
        if (!e.currentTarget.open || html !== null) return
        libraryDescription(row.uuid)
          .then((d) => setHtml(toSafeHtml(d).trim()))
          .catch((err: unknown) => setError(errorText(err)))
      }}
    >
      <summary>
        <span className="grow spell-name">
          <span>{row.name}</span>
          <span className="muted small">
            {row.nameEn ? `${row.nameEn} · ` : ''}
            {metaLine(row)}
          </span>
        </span>
      </summary>
      {ADDABLE_TYPES.has(row.type) && <AddToInventory row={row} characters={characters} />}
      {error && <p className="error description">{error}</p>}
      {html === null && !error && <p className="muted description">Загружаю описание…</p>}
      {html !== null && (html ? <div className="description" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="muted description">Описания нет.</p>)}
    </details>
  )
}

/** Compendium catalogue: search, sections, filters, sorting; the GM uploads the export here. */
export function LibraryPage() {
  const { isGm, userId } = useViewer()
  const [characters, setCharacters] = useState<Character[]>([])
  const [rows, setRows] = useState<LibraryRow[] | null>(cache)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<LibraryCategory>('items')
  const [type, setType] = useState('')
  const [rarity, setRarity] = useState('')
  const [level, setLevel] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [shown, setShown] = useState(PAGE)
  const [upload, setUpload] = useState<{ rows: LibraryImportRow[]; total: number; duplicates: number } | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  useEffect(() => {
    if (cache && version === 0) return
    let cancelled = false
    listLibrary()
      .then((list) => {
        cache = list
        if (!cancelled) setRows(list)
      })
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [version])

  // Characters the viewer may add items to: own ones (the GM: all)
  useEffect(() => {
    let cancelled = false
    listCharacters()
      .then((list) => !cancelled && setCharacters(isGm ? list : list.filter((c) => c.ownerId === userId)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isGm, userId])

  const inCategory = useMemo(() => (rows ?? []).filter((r) => r.category === category), [rows, category])
  const types = useMemo(() => [...new Set(inCategory.map((r) => r.type))].sort(), [inCategory])
  const counts = useMemo(() => {
    const c: Partial<Record<LibraryCategory, number>> = {}
    for (const r of rows ?? []) c[r.category] = (c[r.category] ?? 0) + 1
    return c
  }, [rows])

  const result = useMemo(() => {
    const list = inCategory.filter(
      (r) =>
        matches(r, query) &&
        (!type || r.type === type) &&
        (!rarity || r.rarity === rarity) &&
        (!level || String(r.level) === level),
    )
    const byName = (a: LibraryRow, b: LibraryRow) => a.name.localeCompare(b.name, 'ru')
    const cmp: Record<Sort, (a: LibraryRow, b: LibraryRow) => number> = {
      name: byName,
      price: (a, b) => priceInCopper(a) - priceInCopper(b) || byName(a, b),
      rarity: (a, b) => rarityRank(a) - rarityRank(b) || byName(a, b),
      level: (a, b) => (a.level ?? 99) - (b.level ?? 99) || byName(a, b),
    }
    return [...list].sort(cmp[sort])
  }, [inCategory, query, type, rarity, level, sort])

  function chooseCategory(c: LibraryCategory) {
    setCategory(c)
    setType('')
    setRarity('')
    setLevel('')
    setShown(PAGE)
    if (c !== 'items' && sort === 'price') setSort('name')
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProgress('Читаю файл…')
    const parsed = parseLibraryExport(await file.text())
    if (parsed.ok) {
      setUpload({ rows: parsed.rows, total: parsed.total, duplicates: parsed.duplicates })
      setProgress(null)
    } else {
      setUpload(null)
      setProgress(parsed.error)
    }
  }

  async function runUpload() {
    if (!upload) return
    const all = upload.rows.length
    try {
      const removed = await uploadLibrary(upload.rows, (done) => setProgress(`Загружаю: ${done} из ${all}…`))
      setProgress(`Готово: ${all} записей${removed ? `, удалено устаревших: ${removed}` : ''}.`)
      setUpload(null)
      cache = null
      setVersion((v) => v + 1)
    } catch (err) {
      setProgress(`Загрузка прервалась: ${errorText(err)}. Можно запустить ещё раз — уже загруженное не задвоится.`)
    }
  }

  return (
    <>
      <AppHeader />
      <div>
        <h1 style={{ fontSize: 32 }}>Библиотека</h1>
        <span className="brush-underline" aria-hidden="true" />
        {rows && <span className="muted small">{rows.length.toLocaleString('ru-RU')} записей из AG Fifthpendium и Laaru</span>}
      </div>

      {isGm && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="btn">
            Загрузить выгрузку библиотеки
            <input type="file" accept=".json,application/json" onChange={onFile} hidden />
          </label>
          {upload && (
            <>
              <span className="small">
                В файле {upload.total} записей; повторов из Laaru убрано {upload.duplicates}; будет загружено {upload.rows.length}.
              </span>
              <div className="action-row">
                <button type="button" className="btn btn-primary" onClick={runUpload}>
                  Загрузить
                </button>
                <button type="button" className="btn" onClick={() => setUpload(null)}>
                  Отмена
                </button>
              </div>
            </>
          )}
          {progress && (
            <span className="muted small" aria-live="polite">
              {progress}
            </span>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Загружаю каталог…</p>}
      {rows && rows.length === 0 && <p className="muted">Библиотека пуста. Мастер загрузит её из Foundry.</p>}

      {rows && rows.length > 0 && (
        <>
          <label className="field">
            Поиск
            <input type="search" placeholder="Название по-русски или по-английски" value={query} onChange={(e) => (setQuery(e.target.value), setShown(PAGE))} />
          </label>

          <div className="chip-row" role="group" aria-label="Раздел">
            {(Object.keys(CATEGORY_LABEL) as LibraryCategory[])
              .filter((c) => counts[c])
              .map((c) => (
                <button key={c} type="button" className="toggle" aria-pressed={category === c} onClick={() => chooseCategory(c)}>
                  {CATEGORY_LABEL[c]} · {counts[c]}
                </button>
              ))}
          </div>

          <div className="filter-grid">
            {types.length > 1 && (
              <label className="field">
                Тип
                <select className="select" value={type} onChange={(e) => (setType(e.target.value), setShown(PAGE))}>
                  <option value="">Все</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t] ?? t}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {category === 'items' && (
              <label className="field">
                Редкость
                <select className="select" value={rarity} onChange={(e) => (setRarity(e.target.value), setShown(PAGE))}>
                  <option value="">Любая</option>
                  {RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {RARITY_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {category === 'spells' && (
              <label className="field">
                Круг
                <select className="select" value={level} onChange={(e) => (setLevel(e.target.value), setShown(PAGE))}>
                  <option value="">Любой</option>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={String(i)}>
                      {i === 0 ? 'Заговоры' : `${i} круг`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Сортировка
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="name">По названию</option>
                {category === 'items' && <option value="price">По цене</option>}
                {category === 'items' && <option value="rarity">По редкости</option>}
                {category === 'spells' && <option value="level">По кругу</option>}
              </select>
            </label>
          </div>

          <span className="muted small">Найдено: {result.length}</span>
          {result.length > 0 && (
            <div className="card list">
              {result.slice(0, shown).map((r) => (
                <Entry key={r.uuid} row={r} characters={characters} />
              ))}
            </div>
          )}
          {result.length > shown && (
            <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
              Показать ещё ({result.length - shown})
            </button>
          )}
        </>
      )}
    </>
  )
}
