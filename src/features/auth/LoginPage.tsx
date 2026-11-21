import { useState, type FormEvent } from 'react'
import { BrushButton } from '../../components/BrushButton'
import { ArtHeader } from '../../components/ArtHeader'
import { ThemeToggle } from '../../components/ThemeToggle'
import { supabase } from '../../lib/supabase'

/** Maps Supabase auth errors to messages for players. */
function describeError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Неверная почта или пароль.'
  if (/email not confirmed/i.test(message)) return 'Почта не подтверждена. Напиши мастеру.'
  if (/failed to fetch|network/i.test(message)) return 'Нет связи с сервером. Попробуй включить VPN.'
  return `Не получилось войти: ${message}`
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(describeError(error.message))
  }

  if (!supabase) {
    return (
      <>
        <h1 style={{ fontSize: 40 }}>Dnd Hub</h1>
        <p className="muted">Приложение не подключено к серверу.</p>
        <BrushButton to="/status">Проверка доступа</BrushButton>
      </>
    )
  }

  return (
    <>
      <ArtHeader
        name="login"
        alt="Дайдэн, Муарен и Мерик бросают кубики при свече"
        focusY={0.35}
        priority
        top={
          <>
            <span />
            <span className="art-pill">
              <ThemeToggle />
            </span>
          </>
        }
      />
      {/* reaches at most 32 px into the header, only over its faded bottom */}
      <div className="art-title art-title-over">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={`${import.meta.env.BASE_URL}ui/d20.webp`} alt="" width={48} height={48} />
          <h1 className="hero-title">Dnd Hub</h1>
        </div>
        <span className="subtitle">Кампания «Хвор»</span>
        <span className="brush-underline" style={{ width: 200, height: 14 }} />
      </div>

      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          Почта
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <BrushButton variant="primary" type="submit" block disabled={busy}>
          {busy ? 'Вхожу…' : 'Войти'}
        </BrushButton>
      </form>

      <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
        Аккаунты создаёт мастер. Забыл пароль — напиши мастеру.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
        <BrushButton variant="link" to="/sheet">
          Лист из файла без входа
        </BrushButton>
        <BrushButton variant="link" to="/status">
          Проверка доступа
        </BrushButton>
      </div>
    </>
  )
}
