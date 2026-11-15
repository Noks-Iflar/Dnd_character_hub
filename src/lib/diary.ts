// Adventurers' diary: lore sections and session recaps (GM), entries by players.
import { arr, get, isObject, num, str } from './snapshot/read'
import { supabase } from './supabase'

export type EntryKind = 'memory' | 'lore' | 'general'

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  memory: 'Воспоминания и цитаты',
  lore: 'Дополнения к лору',
  general: 'Общие заметки',
}

export type LorePage = { id: string; title: string; body: string; sort: number; gmOnly: boolean; updatedAt: string }
export type DiarySession = { id: string; number: number; title: string | null; summary: string; highlights: string; updatedAt: string }
export type DiaryEntry = {
  id: string
  kind: EntryKind
  body: string
  characterName: string | null
  authorId: string | null
  createdAt: string
}
export type EntryTarget = { lorePageId: string } | { sessionId: string }

export function sessionTitle(s: Pick<DiarySession, 'number' | 'title'>): string {
  return `Сессия ${s.number}${s.title ? ` · ${s.title}` : ''}`
}

function client() {
  if (!supabase) throw new Error('Приложение не подключено к серверу.')
  return supabase
}

const kindOf = (v: unknown): EntryKind => (v === 'lore' || v === 'general' ? v : 'memory')

function toLore(row: unknown): LorePage | null {
  const id = str(get(row, 'id'))
  const title = str(get(row, 'title'))
  if (!id || title === null) return null
  return {
    id,
    title,
    body: str(get(row, 'body')) ?? '',
    sort: num(get(row, 'sort')) ?? 0,
    gmOnly: get(row, 'gm_only') === true,
    updatedAt: str(get(row, 'updated_at')) ?? '',
  }
}

function toSession(row: unknown): DiarySession | null {
  const id = str(get(row, 'id'))
  const number = num(get(row, 'number'))
  if (!id || number === null) return null
  return {
    id,
    number,
    title: str(get(row, 'title')),
    summary: str(get(row, 'summary')) ?? '',
    highlights: str(get(row, 'highlights')) ?? '',
    updatedAt: str(get(row, 'updated_at')) ?? '',
  }
}

function toEntry(row: unknown): DiaryEntry | null {
  const id = str(get(row, 'id'))
  const body = str(get(row, 'body'))
  if (!id || body === null) return null
  return {
    id,
    kind: kindOf(get(row, 'kind')),
    body,
    characterName: str(get(row, 'character_name')),
    authorId: str(get(row, 'author_id')),
    createdAt: str(get(row, 'created_at')) ?? '',
  }
}

const notNull = <T,>(v: T | null): v is T => v !== null

function fail(message: string): never {
  if (/row-level security/i.test(message)) throw new Error('Нет прав на это действие.')
  throw new Error(message)
}

export async function listLore(): Promise<LorePage[]> {
  const { data, error } = await client().from('lore_pages').select('id, title, body, sort, gm_only, updated_at').order('sort').order('title')
  if (error) fail(error.message)
  return (data ?? []).map(toLore).filter(notNull)
}

export async function listSessions(): Promise<DiarySession[]> {
  const { data, error } = await client()
    .from('diary_sessions')
    .select('id, number, title, summary, highlights, updated_at')
    .order('number', { ascending: false })
  if (error) fail(error.message)
  return (data ?? []).map(toSession).filter(notNull)
}

export async function getLorePage(id: string): Promise<LorePage | null> {
  const { data, error } = await client().from('lore_pages').select('id, title, body, sort, gm_only, updated_at').eq('id', id).maybeSingle()
  if (error) fail(error.message)
  return toLore(data)
}

export async function getSession(id: string): Promise<DiarySession | null> {
  const { data, error } = await client().from('diary_sessions').select('id, number, title, summary, highlights, updated_at').eq('id', id).maybeSingle()
  if (error) fail(error.message)
  return toSession(data)
}

export async function listEntries(target: EntryTarget): Promise<DiaryEntry[]> {
  const [column, value] = 'lorePageId' in target ? ['lore_page_id', target.lorePageId] : ['session_id', target.sessionId]
  const { data, error } = await client()
    .from('diary_entries')
    .select('id, kind, body, character_name, author_id, created_at')
    .eq(column, value)
    .order('created_at')
  if (error) fail(error.message)
  return (data ?? []).map(toEntry).filter(notNull)
}

export async function addEntry(target: EntryTarget, entry: { kind: EntryKind; body: string; characterName: string | null }) {
  const { error } = await client()
    .from('diary_entries')
    .insert({
      ...('lorePageId' in target ? { lore_page_id: target.lorePageId } : { session_id: target.sessionId }),
      kind: entry.kind,
      body: entry.body,
      character_name: entry.characterName,
    })
  if (error) fail(error.message)
}

export async function updateEntry(id: string, entry: { kind: EntryKind; body: string; characterName: string | null }) {
  const { error } = await client()
    .from('diary_entries')
    .update({ kind: entry.kind, body: entry.body, character_name: entry.characterName, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) fail(error.message)
}

export async function deleteEntry(id: string) {
  const { error } = await client().from('diary_entries').delete().eq('id', id)
  if (error) fail(error.message)
}

// ---- GM: lore pages and sessions ----

export type LoreInput = { title: string; body: string; sort: number; gmOnly: boolean }
export type SessionInput = { number: number; title: string | null; summary: string; highlights: string }

export async function saveLorePage(id: string | null, page: LoreInput): Promise<string> {
  const row = { title: page.title, body: page.body, sort: page.sort, gm_only: page.gmOnly, updated_at: new Date().toISOString() }
  const q = id ? client().from('lore_pages').update(row).eq('id', id).select('id').single() : client().from('lore_pages').insert(row).select('id').single()
  const { data, error } = await q
  if (error) fail(error.message)
  return str(get(data, 'id')) ?? ''
}

export async function saveSession(id: string | null, s: SessionInput): Promise<string> {
  const row = { number: s.number, title: s.title, summary: s.summary, highlights: s.highlights, updated_at: new Date().toISOString() }
  const q = id
    ? client().from('diary_sessions').update(row).eq('id', id).select('id').single()
    : client().from('diary_sessions').insert(row).select('id').single()
  const { data, error } = await q
  if (error) fail(/duplicate key|unique/i.test(error.message) ? `Сессия ${s.number} уже есть.` : error.message)
  return str(get(data, 'id')) ?? ''
}

export async function deleteLorePage(id: string) {
  const { error } = await client().from('lore_pages').delete().eq('id', id)
  if (error) fail(error.message)
}

export async function deleteSession(id: string) {
  const { error } = await client().from('diary_sessions').delete().eq('id', id)
  if (error) fail(error.message)
}

// ---- GM: one-time import from the old table ----

export type ImportEntry = { kind: EntryKind; body: string; characterName: string | null }
export type DiaryImport = {
  lore: (LoreInput & { entries: ImportEntry[] })[]
  sessions: (SessionInput & { entries: ImportEntry[] })[]
}

function parseEntries(value: unknown): ImportEntry[] {
  return arr(value)
    .filter(isObject)
    .map((e) => ({ kind: kindOf(e.kind), body: (str(e.body) ?? '').trim(), characterName: str(e.character)?.trim() || null }))
    .filter((e) => e.body !== '')
}

/** Validates a diary import file: { kind: "dndhub-diary", lore: [...], sessions: [...] }. */
export function parseDiaryImport(text: string): { ok: true; data: DiaryImport } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Это не JSON-файл.' }
  }
  if (!isObject(raw) || raw.kind !== 'dndhub-diary') return { ok: false, error: 'Это не файл импорта дневника.' }
  const lore = arr(raw.lore)
    .filter(isObject)
    .map((p, i) => ({
      title: (str(p.title) ?? '').trim(),
      body: str(p.body) ?? '',
      sort: num(p.sort) ?? i,
      gmOnly: p.gmOnly === true,
      entries: parseEntries(p.entries),
    }))
    .filter((p) => p.title !== '')
  const sessions = arr(raw.sessions)
    .filter(isObject)
    .map((s) => ({
      number: num(s.number) ?? 0,
      title: str(s.title)?.trim() || null,
      summary: str(s.summary) ?? '',
      highlights: arr(s.highlights).map((h) => str(h)?.trim() ?? '').filter(Boolean).join('\n'),
      entries: parseEntries(s.entries),
    }))
    .filter((s) => s.number > 0)
  const numbers = sessions.map((s) => s.number)
  if (new Set(numbers).size !== numbers.length) return { ok: false, error: 'В файле повторяются номера сессий.' }
  if (!lore.length && !sessions.length) return { ok: false, error: 'В файле нет ни лора, ни сессий.' }
  return { ok: true, data: { lore, sessions } }
}

export async function importDiary(data: DiaryImport): Promise<{ lore: number; sessions: number; entries: number }> {
  let entries = 0
  for (const page of data.lore) {
    const id = await saveLorePage(null, page)
    for (const e of page.entries) {
      await addEntry({ lorePageId: id }, e)
      entries++
    }
  }
  for (const s of data.sessions) {
    const id = await saveSession(null, s)
    for (const e of s.entries) {
      await addEntry({ sessionId: id }, e)
      entries++
    }
  }
  return { lore: data.lore.length, sessions: data.sessions.length, entries }
}
