import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { checkSupabase, hasKeys, type CheckResult } from '../../lib/connection'
import { supabaseUrl } from '../../lib/supabase'
import { BrushButton } from '../../components/BrushButton'

export function StatusPage() {
  const [result, setResult] = useState<CheckResult>(hasKeys() ? { state: 'checking' } : { state: 'no-keys' })

  useEffect(() => {
    if (!hasKeys()) return
    let cancelled = false
    checkSupabase().then((r) => {
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
