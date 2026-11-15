import { Link, Route, Routes } from 'react-router'

function Home() {
  return (
    <>
      <h1>Хвор</h1>
      <p>Листы персонажей между сессиями. Скоро здесь что-то будет.</p>
      <Link to="/status">Проверка доступа</Link>
    </>
  )
}

function Status() {
  return (
    <>
      <h1>Проверка доступа</h1>
      <p>Здесь будет проверка связи с Supabase.</p>
      <Link to="/">На главную</Link>
    </>
  )
}

function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/status" element={<Status />} />
      </Routes>
    </main>
  )
}

export default App
