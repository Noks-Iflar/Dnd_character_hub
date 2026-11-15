import { Link, Route, Routes } from 'react-router'
import { LoginPage } from './features/auth/LoginPage'
import { StatusPage } from './features/status/StatusPage'
import { useAuth } from './lib/auth-context'
import { supabase } from './lib/supabase'

function Home({ email }: { email: string | undefined }) {
  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="brand">Dnd Hub</span>
        <button className="btn" style={{ minHeight: 40 }} onClick={() => supabase?.auth.signOut()}>
          Выйти
        </button>
      </header>
      <div>
        <h1 style={{ fontSize: 40 }}>Dnd Hub</h1>
        <span className="subtitle">Кампания «Хвор»</span>
      </div>
      <p className="muted">Ты вошёл как {email}. Скоро здесь будет лист персонажа.</p>
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
  return <Home email={auth.session.user.email} />
}

function App() {
  return (
    <main className="page">
      <Routes>
        <Route path="/status" element={<StatusPage />} />
        <Route path="*" element={<Protected />} />
      </Routes>
    </main>
  )
}

export default App
