import { Link, Route, Routes } from 'react-router'
import { LoginPage } from './features/auth/LoginPage'
import { SheetPage } from './features/sheet/SheetPage'
import { StatusPage } from './features/status/StatusPage'
import { useAuth } from './lib/auth-context'
import { useProfile, type UserRole } from './lib/profile'
import { supabase } from './lib/supabase'

const ROLE_LABEL: Record<UserRole, string> = { gm: 'Мастер', player: 'Игрок' }

function Home({ userId, email }: { userId: string; email: string | undefined }) {
  const profile = useProfile(userId)
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
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {profile.status === 'loading' && <span className="muted">Загружаю профиль…</span>}
        {profile.status === 'ready' && (
          <span className={profile.profile.role === 'gm' ? 'chip chip-blood' : 'chip chip-tech'}>
            {ROLE_LABEL[profile.profile.role]}
          </span>
        )}
        {profile.status === 'error' && <p className="error">{profile.message}</p>}
        <span className="muted">Почта: {email}</span>
      </div>
      <Link className="btn btn-primary" to="/sheet">
        Открыть лист из файла
      </Link>
      <Link className="btn" to="/status">
        Проверка доступа
      </Link>
    </>
  )
}

function Protected() {
  const auth = useAuth()
  if (auth.status === 'loading') return <p className="muted">Загрузка…</p>
  if (auth.status === 'signed-out') return <LoginPage />
  return <Home userId={auth.session.user.id} email={auth.session.user.email} />
}

function App() {
  return (
    <main className="page">
      <Routes>
        <Route path="/status" element={<StatusPage />} />
        <Route path="/sheet" element={<SheetPage />} />
        <Route path="*" element={<Protected />} />
      </Routes>
    </main>
  )
}

export default App
