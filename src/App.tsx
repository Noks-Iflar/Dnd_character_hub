import { useEffect, useState } from 'react'
import { Link, Outlet, Route, Routes } from 'react-router'
import { LoginPage } from './features/auth/LoginPage'
import { CharacterPage } from './features/character/CharacterPage'
import { GmPage } from './features/gm-dashboard/GmPage'
import { SheetPage } from './features/sheet/SheetPage'
import { StatusPage } from './features/status/StatusPage'
import { useAuth } from './lib/auth-context'
import { listCharacters, type Character } from './lib/db'
import { formatDateTime } from './lib/format-date'
import { useProfile, type UserRole } from './lib/profile'
import { supabase } from './lib/supabase'

const ROLE_LABEL: Record<UserRole, string> = { gm: 'Мастер', player: 'Игрок' }

function MyCharacters({ isGm }: { isGm: boolean }) {
  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listCharacters()
      .then(setCharacters)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!characters) return <p className="muted">Загружаю персонажей…</p>
  if (!characters.length) {
    return (
      <p className="muted">
        {isGm
          ? 'Персонажей пока нет. Загрузи снимок партии на экране мастера.'
          : 'Персонажей пока нет. Мастер привяжет тебя к персонажу после загрузки снимка.'}
      </p>
    )
  }
  return (
    <div className="attack-list">
      {characters.map((c) => (
        <Link key={c.id} to={`/character/${c.id}`} className="card character-card">
          <span className="row-number">{c.name}</span>
          <span className="muted small">Снимок: {formatDateTime(c.lastSnapshotAt)}</span>
        </Link>
      ))}
    </div>
  )
}

function Home({ userId, email }: { userId: string; email: string | undefined }) {
  const profile = useProfile(userId)
  const isGm = profile.status === 'ready' && profile.profile.role === 'gm'
  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="brand">Dnd Hub</span>
        <button className="btn" style={{ minHeight: 40 }} onClick={() => supabase?.auth.signOut()}>
          Выйти
        </button>
      </header>
      <div>
        <h1 style={{ fontSize: 40 }}>
          {profile.status === 'ready' && profile.profile.display_name ? profile.profile.display_name : 'Dnd Hub'}
        </h1>
        <span className="subtitle">Кампания «Хвор»</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {profile.status === 'ready' && (
          <span className={isGm ? 'chip chip-blood' : 'chip chip-tech'}>{ROLE_LABEL[profile.profile.role]}</span>
        )}
        {profile.status === 'error' && <span className="error">{profile.message}</span>}
        <span className="muted small">{email}</span>
      </div>

      {isGm && (
        <Link className="btn btn-primary" to="/gm">
          Экран мастера
        </Link>
      )}

      <h2 className="section-title">{isGm ? 'Все персонажи' : 'Мои персонажи'}</h2>
      {profile.status === 'ready' && <MyCharacters isGm={isGm} />}

      <Link className="btn" to="/sheet">
        Открыть лист из файла
      </Link>
      <Link to="/status" className="small" style={{ alignSelf: 'center' }}>
        Проверка доступа
      </Link>
    </>
  )
}

/** Renders child routes only for a signed-in user, otherwise the login form. */
function RequireAuth() {
  const auth = useAuth()
  if (auth.status === 'loading') return <p className="muted">Загрузка…</p>
  if (auth.status === 'signed-out') return <LoginPage />
  return <Outlet context={auth.session} />
}

function HomeRoute() {
  const auth = useAuth()
  if (auth.status !== 'signed-in') return null
  return <Home userId={auth.session.user.id} email={auth.session.user.email} />
}

function App() {
  return (
    <main className="page">
      <Routes>
        <Route path="/status" element={<StatusPage />} />
        <Route path="/sheet" element={<SheetPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/gm" element={<GmPage />} />
          <Route path="/character/:id" element={<CharacterPage />} />
          <Route path="*" element={<HomeRoute />} />
        </Route>
      </Routes>
    </main>
  )
}

export default App
