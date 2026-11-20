import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { LoginPage } from './features/auth/LoginPage'
import { CharacterPage } from './features/character/CharacterPage'
import { HistoryPage } from './features/character/HistoryPage'
import { VersionPage } from './features/character/VersionPage'
import { GmPage } from './features/gm-dashboard/GmPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LibraryPage } from './features/library/LibraryPage'
import { useNextSessionLabel } from './features/planner/use-next-session'
import { PlannerPage } from './features/planner/PlannerPage'
import { DiaryPage } from './features/lore/DiaryPage'
import { LorePageView } from './features/lore/LorePageView'
import { SessionView } from './features/lore/SessionView'
import { SheetPage } from './features/sheet/SheetPage'
import { StatusPage } from './features/status/StatusPage'
import { useAuth } from './lib/auth-context'
import { listCharacters, type Character } from './lib/db'
import { isOffline, loadOffline, offlineSnapshot, onlineOr, saveCharacters } from './lib/offline'
import { parseSnapshotJson } from './lib/snapshot/parse'
import { buildSheet } from './lib/snapshot/sheet'
import { loadSummaries, type CharacterSummary } from './lib/summary'
import { ROLE_LABEL, useProfile } from './lib/profile'
import { AppHeader } from './components/AppHeader'
import { BrushButton } from './components/BrushButton'
import { CharacterCard } from './components/CharacterCard'
import { MenuTile } from './components/MenuTile'
import { Sidebar } from './components/NavMenu'
import { useHasAccount } from './lib/use-account'
import { useWide } from './lib/use-wide'
import { EmptyState } from './components/EmptyState'

function MyCharacters({ isGm, userId }: { isGm: boolean; userId: string }) {
  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [summaries, setSummaries] = useState<Record<string, CharacterSummary>>({})
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let cancelled = false
    onlineOr(listCharacters)
      .then((list) => {
        if (cancelled) return
        saveCharacters(userId, list)
        setCharacters(list)
        return loadSummaries(list.map((c) => c.id)).then((sum) => !cancelled && setSummaries(sum))
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const cached = loadOffline()
        if (cached?.userId === userId && cached.characters.length) {
          setCharacters(cached.characters)
          setSummaries(offlineSummaries(cached.characters))
          setOffline(true)
        } else {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (error) return <p className="error">{error}</p>
  if (!characters) return <p className="muted">Загружаю персонажей…</p>
  if (!characters.length) {
    return isGm ? (
      <p className="muted">Персонажей пока нет. Загрузи снимок партии на экране мастера.</p>
    ) : (
      <EmptyState image="empty-scroll" alt="Свёрнутый свиток и перо в чернильнице" title="Снимка ещё нет">
        Мастер выгрузит твоего персонажа после ближайшей сессии. Тогда лист появится здесь.
      </EmptyState>
    )
  }
  return (
    <div className="attack-list card-grid">
      {offline && <p className="chip chip-tech">Нет связи: показаны сохранённые персонажи</p>}
      {characters.map((c, i) => (
        <CharacterCard key={c.id} id={c.id} name={c.name} summary={summaries[c.id]} index={i} />
      ))}
    </div>
  )
}

/** Summaries from snapshots saved on this device, for offline use. */
function offlineSummaries(characters: Character[]): Record<string, CharacterSummary> {
  const out: Record<string, CharacterSummary> = {}
  for (const c of characters) {
    const saved = offlineSnapshot(c.id)
    const parsed = saved ? parseSnapshotJson(JSON.stringify(saved.data)) : null
    if (saved && parsed?.ok && parsed.snapshots[0]) out[c.id] = { sheet: buildSheet(parsed.snapshots[0]), snapshotAt: saved.createdAt }
  }
  return out
}

function Home({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  const ready = profile.status === 'ready' ? profile : null
  const isGm = ready?.profile.role === 'gm'
  const nextSession = useNextSessionLabel(ready && !ready.offline ? ready.profile.timezone : null)
  return (
    <>
      <AppHeader
        menu={false}
        badge={ready && <span className={isGm ? 'chip chip-blood' : 'chip chip-tech'}>{ROLE_LABEL[ready.profile.role]}</span>}
      />
      <div>
        <h1 style={{ fontSize: 40 }}>{ready?.profile.display_name || 'Dnd Hub'}</h1>
        <span className="subtitle">Кампания «Хвор»</span>
      </div>
      {profile.status === 'error' && <p className="error">{profile.message}</p>}
      {ready?.offline && <p className="chip chip-tech">Нет связи с сервером: офлайн-режим, только просмотр</p>}

      {isGm && (
        <BrushButton variant="primary" icon="dm-screen" block to="/gm">
          Экран мастера
        </BrushButton>
      )}

      <h2 className="section-title">{isGm ? 'Все персонажи' : 'Мои персонажи'}</h2>
      {ready && <MyCharacters isGm={isGm} userId={userId} />}

      <nav className="menu-grid" aria-label="Разделы">
        <MenuTile to="/planner" icon="pocket-watch" label="Планировщик сессий" note={nextSession} />
        <MenuTile to="/diary" icon="journal" label="Дневник" />
        <MenuTile to="/library" icon="bookshelf" label="Библиотека" />
        <MenuTile to="/map" icon="map" label="Карта мира" />
      </nav>

      {/* an action, not a section: a button rather than a tile */}
      <BrushButton icon="character-sheet" block to="/sheet">
        Открыть лист из файла
      </BrushButton>
    </>
  )
}

/** Renders child routes only for a signed-in user, otherwise the login form. */
function RequireAuth() {
  const auth = useAuth()
  if (auth.status === 'loading') return <p className="muted">Загрузка…</p>
  // Offline and signed out (e.g. the session could not be refreshed): show the saved copy.
  if (auth.status === 'signed-out') return isOffline() && loadOffline() ? <Outlet /> : <LoginPage />
  return <Outlet />
}

function HomeRoute() {
  const auth = useAuth()
  if (auth.status === 'signed-in') return <Home userId={auth.session.user.id} />
  const cached = loadOffline()
  return cached ? <Home userId={cached.userId} /> : null
}

function App() {
  const wide = useWide()
  const hasAccount = useHasAccount()
  const sidebar = wide && hasAccount
  return (
    <div className={sidebar ? 'shell with-sidebar' : 'shell'}>
      {sidebar && <Sidebar />}
    <main className="page">
      <Routes>
        <Route path="/status" element={<StatusPage />} />
        <Route path="/sheet" element={<SheetPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/gm" element={<GmPage />} />
          <Route path="/diary" element={<DiaryPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* the old address of account settings */}
          <Route path="/account" element={<Navigate to="/settings" replace />} />
          <Route path="/diary/lore/:id" element={<LorePageView />} />
          <Route path="/diary/session/:id" element={<SessionView />} />
          <Route path="/character/:id" element={<CharacterPage />} />
          <Route path="/character/:id/history" element={<HistoryPage />} />
          <Route path="/character/:id/v/:snapshotId" element={<VersionPage />} />
          <Route path="*" element={<HomeRoute />} />
        </Route>
      </Routes>
    </main>
    </div>
  )
}

export default App
