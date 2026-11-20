import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { BrushButton } from '../../components/BrushButton'
import { ThemedIcon, type IconName } from '../../components/ThemedIcon'
import { useAuth } from '../../lib/auth-context'
import { checkSupabase, type CheckResult } from '../../lib/connection'
import { clearOffline } from '../../lib/offline'
import { ROLE_LABEL, updateOwnProfile, useProfile, type Profile } from '../../lib/profile'
import { supabase } from '../../lib/supabase'
import { chooseTheme, useTheme } from '../../lib/theme'
import { linkedAt, loadPrefs, PREFS_FOR, savePref, sendTest, setupBot, startLink, unlinkTelegram, type NotifyPref, type Prefs } from '../../lib/telegram'
import { allZones, deviceZone, formatInZone, offsetLabel } from '../../lib/timezone'
import { formatDateTime } from '../../lib/format-date'

type Section = 'account' | 'timezone' | 'telegram'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** "Asia/Tbilisi" -> "Tbilisi" */
const cityOf = (zone: string) => (zone.split('/').at(-1) ?? zone).replace(/_/g, ' ')

const LINE = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true } as const

function LineIcon({ children }: { children: ReactNode }) {
  return (
    <span className="settings-row-icon line">
      <svg {...LINE}>{children}</svg>
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? 'settings-chevron open' : 'settings-chevron'} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** A row that opens its panel below; one panel at a time, so the screen has a single main button. */
function ExpandRow({
  icon,
  title,
  value,
  open,
  onToggle,
  children,
}: {
  icon: IconName
  title: string
  value: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="settings-item">
      <button type="button" className="settings-row" aria-expanded={open} onClick={onToggle}>
        <ThemedIcon name={icon} size={32} className="settings-row-icon" />
        <span className="settings-row-title">{title}</span>
        <span className="settings-row-value">{value}</span>
        <Chevron open={open} />
      </button>
      {open && <div className="settings-panel">{children}</div>}
    </div>
  )
}

function AccountPanel({ profile, email, onSaved }: { profile: Profile; email: string | null; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile.display_name)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await updateOwnProfile(profile.id, { display_name: name.trim(), timezone: profile.timezone })
      onSaved({ ...profile, display_name: name.trim() })
      setStatus('Сохранено.')
    } catch (err) {
      setStatus(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <dl className="settings-facts">
        <dt>Почта</dt>
        <dd>{email ?? '—'}</dd>
        <dt>Роль</dt>
        <dd>{ROLE_LABEL[profile.role]}</dd>
      </dl>
      <label className="field">
        Имя (видно другим в планировщике и дневнике)
        <input value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
      </label>
      <BrushButton variant="primary" type="submit" block disabled={busy || !name.trim() || name.trim() === profile.display_name}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </BrushButton>
      {status && (
        <span className="muted small" aria-live="polite">
          {status}
        </span>
      )}
      <span className="muted small">Пароль меняет мастер: напиши ему, если забыл.</span>
    </form>
  )
}

function TimezonePanel({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
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
      await updateOwnProfile(profile.id, { display_name: profile.display_name, timezone: zone })
      onSaved({ ...profile, timezone: zone })
      setStatus('Сохранено.')
    } catch (err) {
      setStatus(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <span className="muted small">
        {zone} · {offsetLabel(now, zone)} · сейчас там {formatInZone(now, zone, { hour: '2-digit', minute: '2-digit', weekday: 'short' })}
      </span>
      {device !== zone && (
        <BrushButton block onClick={() => setZone(device)}>
          Взять с устройства: {cityOf(device)} ({offsetLabel(now, device)})
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
      <span className="muted small">По этому поясу планировщик показывает время сессий и твою сетку. Меняй его, когда переезжаешь.</span>
      <BrushButton variant="primary" type="submit" block disabled={busy || zone === profile.timezone}>
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

/**
 * «Уведомления в Telegram»: connect (one-time link to the bot), choose what to hear about,
 * send a test, disconnect. The GM also points the bot at the server once.
 */
function TelegramPanel({ profile, onLinked }: { profile: Profile; onLinked: (at: string | null) => void }) {
  const [linked, setLinked] = useState<string | null | undefined>(undefined)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const show = useCallback(
    (at: string | null) => {
      setLinked(at)
      onLinked(at)
      if (at) setLink(null)
    },
    [onLinked],
  )
  const refresh = useCallback(() => linkedAt(profile.id).then(show), [profile.id, show])

  useEffect(() => {
    linkedAt(profile.id).then(show, (e: unknown) => setStatus(errorText(e)))
    loadPrefs(profile.id).then(setPrefs, (e: unknown) => setStatus(errorText(e)))
  }, [profile.id, show])

  // While the link to the bot is out, look every few seconds whether the bot has answered
  useEffect(() => {
    if (!link) return
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 3000)
    const stop = window.setTimeout(() => setLink(null), 10 * 60 * 1000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [link, refresh])

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    setStatus(null)
    try {
      await action()
      if (done) setStatus(done)
    } catch (e) {
      setStatus(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    setBusy(true)
    setStatus(null)
    try {
      const url = await startLink()
      setLink(url)
      // try to open Telegram right away; if the browser blocks it, the link button below stays
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setStatus(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function toggle(key: NotifyPref, on: boolean) {
    if (!prefs) return
    const before = prefs
    setPrefs({ ...prefs, [key]: on })
    savePref(profile.id, key, on).catch((e: unknown) => {
      setPrefs(before)
      setStatus(errorText(e))
    })
  }

  return (
    <div className="form">
      {linked === undefined && <span className="muted small">Проверяю…</span>}
      {linked === null && (
        <>
          <span className="muted small">
            Ворон Длани будет писать тебе лично: о сборах, напоминаниях и новостях по листу. Время — в твоём часовом поясе.
          </span>
          <BrushButton icon="sealed-letter" block onClick={() => void connect()} disabled={busy}>
            {busy ? 'Создаю ссылку…' : 'Подключить Telegram'}
          </BrushButton>
          {link && (
            <>
              <BrushButton variant="link" href={link}>
                Открыть Telegram
              </BrushButton>
              <span className="muted small" aria-live="polite">
                В Telegram нажми «Старт». Ссылка одноразовая и действует 10 минут; как только бот ответит, здесь станет «Подключено».
              </span>
            </>
          )}
        </>
      )}
      {linked && (
        <>
          <span className="small">Подключено {formatDateTime(linked)}</span>
          {prefs && (
            <fieldset className="check-list">
              <legend className="muted small">О чём писать</legend>
              {PREFS_FOR[profile.role].map(({ key, label }) => (
                <label key={key} className="check-row">
                  <input type="checkbox" checked={prefs[key]} onChange={(e) => toggle(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <BrushButton block disabled={busy} onClick={() => void act(sendTest, 'Пробное отправлено — загляни в Telegram.')}>
            Отправить пробное
          </BrushButton>
          <BrushButton
            variant="link"
            danger
            className="settings-inline-link"
            disabled={busy}
            onClick={() => void act(() => unlinkTelegram(profile.id).then(() => refresh()))}
          >
            Отключить
          </BrushButton>
        </>
      )}
      {profile.role === 'gm' && (
        <div className="settings-note">
          <span className="muted small">
            Мастеру один раз после настройки секретов: связать бота с сервером. Без этого бот не услышит «Старт».
          </span>
          <BrushButton variant="link" className="settings-inline-link" disabled={busy} onClick={() => void act(setupBot, 'Бот связан с сервером.')}>
            Связать бота с сервером
          </BrushButton>
        </div>
      )}
      {status && (
        <span className="muted small" aria-live="polite">
          {status}
        </span>
      )}
    </div>
  )
}

function ThemeRow() {
  const theme = useTheme()
  return (
    <div className="settings-item">
      <div className="settings-row static">
        <LineIcon>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </LineIcon>
        <span className="settings-row-title">Тема</span>
        <span className="segmented settings-switch" role="group" aria-label="Тема">
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}>
            Тёмная
          </button>
          <button type="button" aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}>
            Пергамент
          </button>
        </span>
      </div>
    </div>
  )
}

function ConnectionRow() {
  const [result, setResult] = useState<CheckResult | null>(null)
  async function run() {
    setResult({ state: 'checking' })
    setResult(await checkSupabase())
  }
  const text =
    result === null
      ? null
      : result.state === 'checking'
        ? 'Проверяю…'
        : result.state === 'ok'
          ? `Связь есть · ${result.ms} мс`
          : result.state === 'no-keys'
            ? 'Ключи сервера не заданы'
            : result.message
  return (
    <div className="settings-item">
      <div className="settings-row static">
        <LineIcon>
          <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
          <circle cx="12" cy="19.5" r="1" />
          <path d="M2 9a14 14 0 0 1 20 0" />
        </LineIcon>
        <span className="settings-row-title">
          Проверка связи
          {text && (
            <span className={result?.state === 'error' || result?.state === 'no-keys' ? 'settings-row-result error' : 'settings-row-result'} aria-live="polite">
              {text}
            </span>
          )}
        </span>
        <BrushButton variant="link" onClick={run} disabled={result?.state === 'checking'}>
          Проверить
        </BrushButton>
      </div>
      {result?.state === 'error' && <p className="settings-panel muted small">Попробуй включить VPN, обнови страницу и напиши мастеру.</p>}
    </div>
  )
}

/** Account, time zone, theme, connection check and sign out — for the GM and players alike. */
export function SettingsPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : ''
  const email = auth.status === 'signed-in' ? (auth.session.user.email ?? null) : null
  const loaded = useProfile(userId)
  const [edited, setEdited] = useState<Profile | null>(null)
  const asked = params.get('open')
  const [open, setOpen] = useState<Section | null>(asked === 'timezone' || asked === 'telegram' ? asked : null)
  const [telegram, setTelegram] = useState<string | null | undefined>(undefined)
  const ready = loaded.status === 'ready' ? loaded : null
  const profile = edited ?? ready?.profile ?? null
  const online = !!ready && !ready.offline
  const toggle = (s: Section) => setOpen((o) => (o === s ? null : s))
  const [now] = useState(() => Date.now())

  return (
    <>
      <AppHeader settings={false} />
      <div>
        <h1 style={{ fontSize: 32 }}>Настройки</h1>
        <span className="brush-underline" aria-hidden="true" />
      </div>
      {loaded.status === 'loading' && <p className="muted">Загружаю…</p>}
      {loaded.status === 'error' && <p className="error">{loaded.message}</p>}
      {ready?.offline && <p className="chip chip-tech">Нет связи: аккаунт и пояс меняются только онлайн</p>}

      <div className="card settings-list">
        {profile && (
          <ExpandRow icon="signet-ring" title="Аккаунт" value={profile.display_name || email} open={open === 'account'} onToggle={() => toggle('account')}>
            {online ? <AccountPanel profile={profile} email={email} onSaved={setEdited} /> : <p className="muted small">Нужна связь с сервером.</p>}
          </ExpandRow>
        )}
        {profile && (
          <ExpandRow
            icon="hourglass"
            title="Часовой пояс"
            value={`${cityOf(profile.timezone)} · ${offsetLabel(now, profile.timezone)}`}
            open={open === 'timezone'}
            onToggle={() => toggle('timezone')}
          >
            {online ? <TimezonePanel profile={profile} onSaved={setEdited} /> : <p className="muted small">Нужна связь с сервером.</p>}
          </ExpandRow>
        )}
        {profile && (
          <ExpandRow
            icon="sealed-letter"
            title="Уведомления в Telegram"
            value={telegram === undefined ? '' : telegram ? 'Подключено' : 'Не подключено'}
            open={open === 'telegram'}
            onToggle={() => toggle('telegram')}
          >
            {online ? <TelegramPanel profile={profile} onLinked={setTelegram} /> : <p className="muted small">Нужна связь с сервером.</p>}
          </ExpandRow>
        )}
        <ThemeRow />
        <ConnectionRow />
      </div>

      <BrushButton
        variant="link"
        icon="door"
        iconSize={24}
        className="settings-signout"
        onClick={() => {
          clearOffline()
          void supabase?.auth.signOut()
          void navigate('/', { replace: true })
        }}
      >
        Выйти
      </BrushButton>
    </>
  )
}
