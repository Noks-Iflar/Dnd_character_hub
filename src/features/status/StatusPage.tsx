import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabaseAnonKey, supabaseUrl } from '../../lib/supabase'

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
      <h1>Проверка доступа</h1>
      <p>
        {result.state === 'no-keys' && '⚪ Ключи Supabase не заданы.'}
        {result.state === 'checking' && '⏳ Проверяю связь с Supabase…'}
        {result.state === 'ok' && `🟢 Supabase доступен (ответ за ${result.ms} мс).`}
        {result.state === 'error' && `🔴 Supabase недоступен. ${result.message}`}
      </p>
      <p>
        Если видишь красный кружок, попробуй включить VPN и обновить страницу, и напиши мастеру.
      </p>
      <Link to="/">На главную</Link>
    </>
  )
}
