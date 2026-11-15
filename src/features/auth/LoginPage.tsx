import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
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
        <Link className="btn" to="/status">
          Проверка доступа
        </Link>
      </>
    )
  }

  return (
    <>
      <div style={{ marginTop: 24 }}>
        <h1 style={{ fontSize: 46 }}>Dnd Hub</h1>
        <span className="subtitle">Кампания «Хвор»</span>
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
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Вхожу…' : 'Войти'}
        </button>
      </form>

      <p className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
        Аккаунты создаёт мастер. Забыл пароль — напиши мастеру.
      </p>
      <Link to="/sheet" style={{ alignSelf: 'center', fontSize: 15 }}>
        Открыть лист из файла без входа
      </Link>
      <Link to="/status" style={{ alignSelf: 'center', fontSize: 14 }}>
        Проверка доступа
      </Link>
    </>
  )
}
