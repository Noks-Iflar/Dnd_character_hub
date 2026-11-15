import { Link, Route, Routes } from 'react-router'
import { StatusPage } from './features/status/StatusPage'

function Home() {
  return (
    <>
      <h1>Хвор</h1>
      <p>Листы персонажей между сессиями. Скоро здесь что-то будет.</p>
      <Link to="/status">Проверка доступа</Link>
    </>
  )
}

function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/status" element={<StatusPage />} />
      </Routes>
    </main>
  )
}

export default App
