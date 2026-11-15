import { Link, Route, Routes } from 'react-router'
import { StatusPage } from './features/status/StatusPage'

function Home() {
  return (
    <>
      <div>
        <h1 style={{ fontSize: 40 }}>Dnd Hub</h1>
        <span className="subtitle">Кампания «Хвор»</span>
      </div>
      <p className="muted">Листы персонажей между сессиями. Скоро здесь что-то будет.</p>
      <Link className="btn" to="/status">
        Проверка доступа
      </Link>
    </>
  )
}

function App() {
  return (
    <main className="page">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/status" element={<StatusPage />} />
      </Routes>
    </main>
  )
}

export default App
