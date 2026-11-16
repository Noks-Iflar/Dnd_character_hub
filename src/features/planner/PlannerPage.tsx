import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { BrandLink, NavButtons } from '../../components/NavMenu'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useAuth } from '../../lib/auth-context'
import { listProfiles } from '../../lib/db'
import {
  addDays,
  addPlannedSession,
  BLOCK_HOURS,
  blockSlots,
  DAY_SHORT,
  deletePlannedSession,
  freeUsers,
  listPlannedSessions,
  loadAvailability,
  nextSession,
  setMyAvailability,
  weekMonday,
  type PlannedSession,
  type WallDate,
} from '../../lib/planner'
import { useProfile, type Profile } from '../../lib/profile'
import { deviceZone, formatInZone, fromWall, offsetLabel } from '../../lib/timezone'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function weekLabel(monday: WallDate): string {
  const sunday = addDays(monday, 6)
  return monday.month === sunday.month
    ? `${monday.day}–${sunday.day} ${MONTHS[sunday.month - 1]}`
    : `${monday.day} ${MONTHS[monday.month - 1]} – ${sunday.day} ${MONTHS[sunday.month - 1]}`
}

function NextSessionCard({ session, profiles, zone }: { session: PlannedSession | null; profiles: Profile[]; zone: string }) {
  if (!session) return <div className="card muted">Сессия ещё не назначена. Отметь, когда ты свободен, — мастер выберет время.</div>
  return (
    <div className="card next-session">
      <div className="next-session-head">
        <span className="next-session-date">
          {formatInZone(session.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}
        </span>
        <span>
          <strong>{formatInZone(session.startsAt, zone, { hour: '2-digit', minute: '2-digit' })}</strong> <span className="muted">у тебя</span>
        </span>
      </div>
      {session.note && <span className="muted small">{session.note}</span>}
      <div className="people-times">
        {profiles.map((p) => (
          <span key={p.id} className="person-time">
            <span className="muted">{p.display_name || 'без имени'}</span>
            <span>{formatInZone(session.startsAt, p.timezone, { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function ScheduleForm({ zone, onDone }: { zone: string; onDone: () => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('19:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time.split(':').map(Number)
    if (!y || !m || !d || hh === undefined || mm === undefined) return
    setBusy(true)
    setError(null)
    try {
      await addPlannedSession(fromWall({ year: y, month: m, day: d, hour: hh, minute: mm }, zone), note.trim() || null)
      setDate('')
      setNote('')
      onDone()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      <span className="label-caps">Назначить сессию</span>
      <div className="filter-grid">
        <label className="field">
          Дата
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Время ({offsetLabel(Date.parse(date || '2026-01-01'), zone)})
          <input type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Заметка (необязательно)
        <input value={note} maxLength={500} placeholder="Например: сессия 6, Врата Дагота" onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !date}>
        {busy ? 'Сохраняю…' : 'Назначить'}
      </button>
    </form>
  )
}

/** Session planner: next session in everyone's time, weekly free-time grid, GM scheduling. */
export function PlannerPage() {
  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : ''
  const profileState = useProfile(userId)
  const me = profileState.status === 'ready' ? profileState.profile : null
  const zone = me?.timezone ?? deviceZone()
  const isGm = me?.role === 'gm'

  const [now] = useState(() => Date.now())
  const [weekOffset, setWeekOffset] = useState(0)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<PlannedSession[]>([])
  const [availability, setAvailability] = useState<Map<string, Set<number>>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const monday = useMemo(() => addDays(weekMonday(now, zone), weekOffset * 7), [now, zone, weekOffset])
  const grid = useMemo(
    () =>
      BLOCK_HOURS.map((hour) => ({
        hour,
        cells: Array.from({ length: 7 }, (_, i) => {
          const date = addDays(monday, i)
          return { date, slots: blockSlots(date, hour, zone) }
        }),
      })),
    [monday, zone],
  )

  useEffect(() => {
    const first = grid[0]?.cells[0]?.slots[0] ?? 0
    const last = (grid.at(-1)?.cells.at(-1)?.slots.at(-1) ?? 0) + 30 * 60 * 1000
    let cancelled = false
    Promise.all([listProfiles(), listPlannedSessions(), loadAvailability(first, last)])
      .then(([p, s, a]) => {
        if (cancelled) return
        setProfiles(p)
        setSessions(s)
        setAvailability(a)
        setError(null)
      })
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [grid, version])

  const total = profiles.length
  const mine = availability.get(userId) ?? new Set<number>()
  const upcoming = sessions.filter((s) => s.startsAt + 4 * 3600 * 1000 > now)

  async function toggle(slots: number[], free: boolean) {
    // Optimistic: update the grid at once, roll back on error
    const before = availability
    const next = new Map(availability)
    const set = new Set(next.get(userId) ?? [])
    for (const s of slots) if (free) set.add(s); else set.delete(s)
    next.set(userId, set)
    setAvailability(next)
    try {
      await setMyAvailability(slots, free)
    } catch (e) {
      setAvailability(before)
      setError(errorText(e))
    }
  }

  return (
    <>
      <div className="art-header">
        <img src={`${import.meta.env.BASE_URL}ui/art/planner.jpg`} alt="Путники у костра, рядом песочные часы" style={{ objectPosition: 'center 40%' }} />
        <div className="art-header-bar">
          <span className="app-header-nav">
            <NavButtons />
            <BrandLink />
          </span>
          <ThemeToggle />
        </div>
      </div>
      <div className="art-title art-title-short">
        <h1 style={{ fontSize: 32 }}>Следующая сессия</h1>
        <span className="brush-underline" aria-hidden="true" />
      </div>

      {error && <p className="error">{error}</p>}
      <NextSessionCard session={nextSession(sessions, now)} profiles={profiles} zone={zone} />

      {isGm && <ScheduleForm zone={zone} onDone={() => setVersion((v) => v + 1)} />}
      {isGm && upcoming.length > 0 && (
        <div className="card list">
          {upcoming.map((s) => (
            <div key={s.id} className="list-row static">
              <span className="grow">
                {formatInZone(s.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                {s.note ? <span className="muted small"> · {s.note}</span> : null}
              </span>
              <button
                type="button"
                className="text-btn danger"
                onClick={() => deletePlannedSession(s.id).then(() => setVersion((v) => v + 1), (e: unknown) => setError(errorText(e)))}
              >
                Отменить
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Когда ты свободен</h2>
      <div className="week-nav">
        <button type="button" className="icon-btn" aria-label="Предыдущая неделя" disabled={weekOffset <= 0} onClick={() => setWeekOffset((w) => w - 1)}>
          ‹
        </button>
        <span className="muted small" style={{ textAlign: 'center' }}>
          Неделя {weekLabel(monday)}, время твоё ({offsetLabel(now, zone)}). <Link to="/account">Сменить пояс</Link>
        </span>
        <button type="button" className="icon-btn" aria-label="Следующая неделя" onClick={() => setWeekOffset((w) => w + 1)}>
          ›
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Нажми на клетку, если свободен эти два часа. Цифра — сколько человек свободно.
      </p>

      <div className="planner-grid" role="grid" aria-label="Свободное время на неделе">
        <span />
        {DAY_SHORT.map((d, i) => (
          <span key={d} className="planner-day">
            {d}
            <span>{addDays(monday, i).day}</span>
          </span>
        ))}
        {grid.map((row) => [
          <span key={`l${row.hour}`} className="planner-hour">
            {String(row.hour).padStart(2, '0')}–{String((row.hour + 2) % 24).padStart(2, '0')}
          </span>,
          ...row.cells.map((cell, i) => {
            const free = freeUsers(cell.slots, availability)
            const isMine = cell.slots.every((s) => mine.has(s))
            const past = (cell.slots.at(-1) ?? 0) < now
            const level = total ? free.length / total : 0
            const names = free.map((id) => profiles.find((p) => p.id === id)?.display_name ?? '?').join(', ')
            return (
              <button
                key={`${row.hour}-${i}`}
                type="button"
                className={`planner-cell${isMine ? ' mine' : ''}${free.length > 0 && free.length === total ? ' all' : ''}`}
                style={{ ['--level' as string]: String(level) }}
                aria-pressed={isMine}
                aria-label={`${DAY_SHORT[i]} ${addDays(monday, i).day}, ${row.hour}:00–${row.hour + 2}:00: свободно ${free.length} из ${total}${names ? ` (${names})` : ''}`}
                title={names || undefined}
                disabled={past}
                onClick={() => void toggle(cell.slots, !isMine)}
              >
                {free.length || ''}
              </button>
            )
          }),
        ])}
      </div>
      <div className="planner-legend">
        <span>
          <span className="legend-box mine" /> ты свободен
        </span>
        <span>
          <span className="legend-box all" /> свободны все {total}
        </span>
      </div>
      <div className="card hint">
        <span className="muted small">Мастер назначит дату, когда отметятся все. Каждый увидит её в своём времени.</span>
      </div>
    </>
  )
}
