import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { supabaseAnonKey, supabaseUrl } from '../../lib/supabase'
import { BrushButton } from '../../components/BrushButton'

type CheckResult =
  | { state: 'no-keys' }
  | { state: 'checking' }
  | { state: 'ok'; ms: number }
  | { state: 'error'; message: string }

async function checkSupabase(url: string, key: string): Promise<CheckResult> {
  const started = performance.now()
  try {
    // Auth health endpoint: answers without any tables in the database
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
    if (!res.ok) return { state: 'error', message: `Сервер ответил кодом ${res.status}` }
    return { state: 'ok', ms: Math.round(performance.now() - started) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { state: 'error', message: `Нет связи: ${message}` }
  }
}

export function StatusPage() {
  const [result, setResult] = useState<CheckResult>(
    supabaseUrl && supabaseAnonKey ? { state: 'checking' } : { state: 'no-keys' },
  )

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return
    let cancelled = false
    checkSupabase(supabaseUrl, supabaseAnonKey).then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <AppHeader />
      <h1 style={{ fontSize: 32 }}>Проверка доступа</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-live="polite">
        {result.state === 'no-keys' && <span className="chip">Ключи Supabase не заданы</span>}
        {result.state === 'checking' && <span className="chip">Проверяю связь с Supabase…</span>}
        {result.state === 'ok' && <span className="chip chip-tech">Supabase доступен · {result.ms} мс</span>}
        {result.state === 'error' && (
          <>
            <span className="chip chip-blood">Supabase недоступен</span>
            <span className="muted">{result.message}</span>
          </>
        )}
        {supabaseUrl && <span className="muted">Адрес: {supabaseUrl}</span>}
      </div>
      <p className="muted">
        Если видишь красную метку, попробуй включить VPN, обнови страницу и напиши мастеру.
      </p>
      <BrushButton to="/">На главную</BrushButton>
    </>
  )
}
