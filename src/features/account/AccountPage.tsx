import { useMemo, useState, type FormEvent } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { useAuth } from '../../lib/auth-context'
import { updateOwnProfile, useProfile, type Profile } from '../../lib/profile'
import { allZones, deviceZone, formatInZone, offsetLabel } from '../../lib/timezone'
import { BrushButton } from '../../components/BrushButton'

function AccountForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.display_name)
  const [zone, setZone] = useState(profile.timezone)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Captured once: offsets shown on this screen are for "now"
  const [now] = useState(() => Date.now())
  const device = deviceZone()
  const zones = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = allZones()
    return q ? list.filter((z) => z.toLowerCase().includes(q)) : list
  }, [filter])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await updateOwnProfile(profile.id, { display_name: name.trim(), timezone: zone })
      setStatus('Сохранено.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <label className="field">
        Имя (видно другим в планировщике и дневнике)
        <input value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
      </label>

      <h2 className="section-title">Часовой пояс</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="row-number">{zone}</span>
        <span className="muted small">
          {offsetLabel(now, zone)} · сейчас там {formatInZone(now, zone, { hour: '2-digit', minute: '2-digit', weekday: 'short' })}
        </span>
      </div>
      {device !== zone && (
        <BrushButton onClick={() => setZone(device)}>
          Взять с устройства: {device} ({offsetLabel(now, device)})
        </BrushButton>
      )}
      <label className="field">
        Найти пояс (город по-английски: Berlin, Tbilisi, Bangkok…)
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      <label className="field">
        Пояс
        <select className="select" value={zone} onChange={(e) => setZone(e.target.value)}>
          {!zones.includes(zone) && <option value={zone}>{zone}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z} ({offsetLabel(now, z)})
            </option>
          ))}
        </select>
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        По этому поясу планировщик показывает время сессий и твою сетку. Меняй его, когда переезжаешь.
      </p>

      <BrushButton variant="primary" type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </BrushButton>
      {status && (
        <span className="muted small" aria-live="polite">
          {status}
        </span>
      )}
    </form>
  )
}

/** Own name and time zone. */
export function AccountPage() {
  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : ''
  const profile = useProfile(userId)
  return (
    <>
      <AppHeader />
      <div>
        <h1 style={{ fontSize: 32 }}>Аккаунт</h1>
        <span className="brush-underline" aria-hidden="true" />
      </div>
      {profile.status === 'loading' && <p className="muted">Загружаю…</p>}
      {profile.status === 'error' && <p className="error">{profile.message}</p>}
      {profile.status === 'ready' && (profile.offline ? <p className="muted">Нет связи: изменить настройки можно только онлайн.</p> : <AccountForm profile={profile.profile} />)}
    </>
  )
}
