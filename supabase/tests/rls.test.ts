import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, runAs } from './harness'

const GM = '00000000-0000-0000-0000-00000000000a'
const P1 = '00000000-0000-0000-0000-00000000000b'
const P2 = '00000000-0000-0000-0000-00000000000c'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
  await db.exec(`
    insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
    update public.profiles set role = 'gm' where id = '${GM}';
    insert into public.characters (owner_id, name, foundry_actor_id)
      values ('${P1}', 'Velian', 'actor1'), ('${P2}', 'Kairen', 'actor2');
  `)
})

describe('profiles', () => {
  it('are created automatically from the email', async () => {
    const r = await runAs(db, P1, 'select display_name, role from public.profiles')
    expect(r).toEqual({ ok: true, rows: [{ display_name: 'anya', role: 'player' }] })
  })

  it('gm sees all profiles', async () => {
    const r = await runAs(db, GM, 'select id from public.profiles')
    expect(r.ok && r.rows.length).toBe(3)
  })

  it('player edits own name and time zone', async () => {
    const r = await runAs(db, P1, `update public.profiles set display_name = 'Anya', timezone = 'Europe/Berlin' where id = '${P1}' returning id`)
    expect(r.ok && r.rows.length).toBe(1)
  })

  it('player cannot make themselves gm', async () => {
    const r = await runAs(db, P1, `update public.profiles set role = 'gm' where id = '${P1}'`)
    expect(r.ok).toBe(false)
  })

  it("player cannot edit someone else's profile", async () => {
    const r = await runAs(db, P1, `update public.profiles set display_name = 'x' where id = '${P2}' returning id`)
    expect(r).toEqual({ ok: true, rows: [] })
  })
})

describe('characters', () => {
  it('player sees only own character', async () => {
    const r = await runAs(db, P1, 'select name from public.characters')
    expect(r).toEqual({ ok: true, rows: [{ name: 'Velian' }] })
  })

  it('gm sees all characters', async () => {
    const r = await runAs(db, GM, 'select id from public.characters')
    expect(r.ok && r.rows.length).toBe(2)
  })

  it('player cannot create, change or delete characters', async () => {
    const insert = await runAs(db, P1, `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'x', 'x')`)
    expect(insert.ok).toBe(false)
    const update = await runAs(db, P1, `update public.characters set status = 'in_game' returning id`)
    expect(update).toEqual({ ok: true, rows: [] })
    const del = await runAs(db, P1, 'delete from public.characters returning id')
    expect(del).toEqual({ ok: true, rows: [] })
  })

  it('gm changes character status', async () => {
    const r = await runAs(db, GM, `update public.characters set status = 'in_game' returning id`)
    expect(r.ok && r.rows.length).toBe(2)
  })

  it('anonymous visitor sees nothing', async () => {
    expect(await runAs(db, null, 'select id from public.characters')).toEqual({ ok: true, rows: [] })
    expect(await runAs(db, null, 'select id from public.profiles')).toEqual({ ok: true, rows: [] })
  })
})

describe('migration on a project with existing users', () => {
  it('creates profiles for users added before it', async () => {
    const existing = await createDb(`insert into auth.users values ('${GM}', 'gm@example.com')`)
    const r = await existing.query('select display_name, role from public.profiles')
    expect(r.rows).toEqual([{ display_name: 'gm', role: 'player' }])
  })
})

describe('snapshots', () => {
  let snapDb: PGlite
  let velian = ''

  beforeAll(async () => {
    snapDb = await createDb()
    await snapDb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const r = await runAs(
      snapDb,
      GM,
      `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'Velian', 'a1'), ('${P2}', 'Kairen', 'a2') returning id, name`,
    )
    if (!r.ok) throw new Error(r.error)
    velian = String(r.rows.find((row) => row.name === 'Velian')?.id)
    const kairen = String(r.rows.find((row) => row.name === 'Kairen')?.id)
    const ins = await runAs(
      snapDb,
      GM,
      `insert into public.snapshots (character_id, data) values ('${velian}', '{"n":1}'), ('${velian}', '{"n":2}'), ('${kairen}', '{"n":3}') returning created_by`,
    )
    if (!ins.ok) throw new Error(ins.error)
    expect(ins.rows.every((row) => row.created_by === GM)).toBe(true)
  })

  it('player sees only snapshots of own character', async () => {
    const r = await runAs(snapDb, P1, `select data->>'n' as n from public.snapshots order by n`)
    expect(r).toEqual({ ok: true, rows: [{ n: '1' }, { n: '2' }] })
  })

  it('gm sees all snapshots', async () => {
    const r = await runAs(snapDb, GM, 'select id from public.snapshots')
    expect(r.ok && r.rows.length).toBe(3)
  })

  it('player cannot upload snapshots', async () => {
    const r = await runAs(snapDb, P1, `insert into public.snapshots (character_id, data) values ('${velian}', '{}')`)
    expect(r.ok).toBe(false)
  })

  it('nobody can change or delete snapshots, not even the gm', async () => {
    for (const uid of [GM, P1]) {
      expect((await runAs(snapDb, uid, `update public.snapshots set data = '{}'`)).ok).toBe(false)
      expect((await runAs(snapDb, uid, 'delete from public.snapshots')).ok).toBe(false)
    }
  })

  it('anonymous visitor sees nothing', async () => {
    expect(await runAs(snapDb, null, 'select id from public.snapshots')).toEqual({ ok: true, rows: [] })
  })
})

describe('changes', () => {
  let cdb: PGlite
  let velian = ''
  let kairen = ''
  let velianSnap = ''
  let kairenSnap = ''
  const ITEM = 'abcdefghij012345'

  const insert = (uid: string, character: string, snapshot: string, path: string, value: string) =>
    runAs(
      cdb,
      uid,
      `insert into public.changes (character_id, snapshot_id, path, old_value, new_value) values ('${character}', '${snapshot}', '${path}', '0', '${value}') returning id`,
    )

  beforeAll(async () => {
    cdb = await createDb()
    await cdb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const chars = await runAs(
      cdb,
      GM,
      `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'Velian', 'a1'), ('${P2}', 'Kairen', 'a2') returning id, name`,
    )
    if (!chars.ok) throw new Error(chars.error)
    velian = String(chars.rows.find((r) => r.name === 'Velian')?.id)
    kairen = String(chars.rows.find((r) => r.name === 'Kairen')?.id)
    const snaps = await runAs(
      cdb,
      GM,
      `insert into public.snapshots (character_id, data) values ('${velian}', '{}'), ('${kairen}', '{}') returning id, character_id`,
    )
    if (!snaps.ok) throw new Error(snaps.error)
    velianSnap = String(snaps.rows.find((r) => r.character_id === velian)?.id)
    kairenSnap = String(snaps.rows.find((r) => r.character_id === kairen)?.id)
  })

  it('owner edits allowed fields of own character between sessions', async () => {
    for (const [path, value] of [
      ['system.attributes.hp.value', '22'],
      ['system.attributes.inspiration', 'false'],
      ['system.spells.spell1.value', '1'],
      ['system.currency.gp', '15'],
      [`items.${ITEM}.system.uses.spent`, '1'],
      [`items.${ITEM}.system.equipped`, 'true'],
    ]) {
      const r = await insert(P1, velian, velianSnap, String(path), String(value))
      expect(r.ok, `${path}: ${r.ok ? '' : r.error}`).toBe(true)
    }
  })

  it('rejects fields outside the allowed list', async () => {
    for (const path of ['system.abilities.str.value', 'system.attributes.hp.max', 'items.short.system.quantity', 'name']) {
      expect((await insert(P1, velian, velianSnap, path, '99')).ok, path).toBe(false)
    }
  })

  it('rejects non-number, non-boolean values', async () => {
    expect((await insert(P1, velian, velianSnap, 'system.currency.gp', '"lots"')).ok).toBe(false)
  })

  it("player cannot edit someone else's character or use its snapshot", async () => {
    expect((await insert(P1, kairen, kairenSnap, 'system.currency.gp', '1')).ok).toBe(false)
    expect((await insert(P1, velian, kairenSnap, 'system.currency.gp', '1')).ok).toBe(false)
  })

  it('player cannot write as another author or pre-mark as applied', async () => {
    const r1 = await runAs(
      cdb,
      P1,
      `insert into public.changes (character_id, snapshot_id, path, new_value, author_id) values ('${velian}', '${velianSnap}', 'system.currency.gp', '1', '${P2}')`,
    )
    expect(r1.ok).toBe(false)
    const r2 = await runAs(
      cdb,
      P1,
      `insert into public.changes (character_id, snapshot_id, path, new_value, applied_at) values ('${velian}', '${velianSnap}', 'system.currency.gp', '1', now())`,
    )
    expect(r2.ok).toBe(false)
  })

  it('edits are locked while the character is in game, except for the gm', async () => {
    await runAs(cdb, GM, `update public.characters set status = 'in_game' where id = '${velian}'`)
    expect((await insert(P1, velian, velianSnap, 'system.currency.gp', '2')).ok).toBe(false)
    expect((await insert(GM, velian, velianSnap, 'system.currency.gp', '2')).ok).toBe(true)
    await runAs(cdb, GM, `update public.characters set status = 'between_sessions' where id = '${velian}'`)
  })

  it('players see only edits of own character', async () => {
    await insert(P2, kairen, kairenSnap, 'system.currency.sp', '3')
    const r = await runAs(cdb, P1, 'select distinct character_id from public.changes')
    expect(r).toEqual({ ok: true, rows: [{ character_id: velian }] })
  })

  it('only the gm marks edits applied; nobody rewrites or deletes them', async () => {
    expect(await runAs(cdb, P1, 'update public.changes set applied_at = now() returning id')).toEqual({ ok: true, rows: [] })
    const applied = await runAs(cdb, GM, `update public.changes set applied_at = now() where character_id = '${velian}' returning id`)
    expect(applied.ok && applied.rows.length).toBeGreaterThan(0)
    expect((await runAs(cdb, GM, `update public.changes set new_value = '5'`)).ok).toBe(false)
    expect((await runAs(cdb, GM, 'delete from public.changes')).ok).toBe(false)
    expect((await runAs(cdb, P1, 'delete from public.changes')).ok).toBe(false)
  })
})

describe('character notes', () => {
  let ndb: PGlite
  let velian = ''
  let kairen = ''

  const upsert = (uid: string, character: string, body: string) =>
    runAs(
      ndb,
      uid,
      `insert into public.character_notes (character_id, body, updated_by) values ('${character}', '${body}', '${uid}')
       on conflict (character_id) do update set body = excluded.body, updated_at = now(), updated_by = excluded.updated_by
       returning body`,
    )

  beforeAll(async () => {
    ndb = await createDb()
    await ndb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const r = await runAs(
      ndb,
      GM,
      `insert into public.characters (owner_id, name, foundry_actor_id, status) values ('${P1}', 'Velian', 'a1', 'in_game'), ('${P2}', 'Kairen', 'a2', 'between_sessions') returning id, name`,
    )
    if (!r.ok) throw new Error(r.error)
    velian = String(r.rows.find((x) => x.name === 'Velian')?.id)
    kairen = String(r.rows.find((x) => x.name === 'Kairen')?.id)
  })

  it('owner writes and rewrites notes, even during the game', async () => {
    expect(await upsert(P1, velian, 'первая')).toEqual({ ok: true, rows: [{ body: 'первая' }] })
    expect(await upsert(P1, velian, 'вторая')).toEqual({ ok: true, rows: [{ body: 'вторая' }] })
  })

  it("player cannot read or write someone else's notes", async () => {
    await upsert(P2, kairen, 'секрет')
    expect(await runAs(ndb, P1, `select body from public.character_notes where character_id = '${kairen}'`)).toEqual({ ok: true, rows: [] })
    expect((await upsert(P1, kairen, 'взлом')).ok).toBe(false)
  })

  it('gm reads all notes; nobody deletes', async () => {
    const r = await runAs(ndb, GM, 'select body from public.character_notes order by body')
    expect(r).toEqual({ ok: true, rows: [{ body: 'вторая' }, { body: 'секрет' }] })
    expect((await runAs(ndb, P1, 'delete from public.character_notes')).ok).toBe(false)
  })
})

describe('diary', () => {
  let ddb: PGlite
  let openPage = ''
  let secretPage = ''
  let session = ''

  beforeAll(async () => {
    ddb = await createDb()
    await ddb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const pages = await runAs(
      ddb,
      GM,
      `insert into public.lore_pages (title, body, gm_only) values ('География', 'Арс', false), ('Тайна', 'Хвор — болезнь', true) returning id, gm_only`,
    )
    if (!pages.ok) throw new Error(pages.error)
    openPage = String(pages.rows.find((r) => r.gm_only === false)?.id)
    secretPage = String(pages.rows.find((r) => r.gm_only === true)?.id)
    const s = await runAs(ddb, GM, `insert into public.diary_sessions (number, summary) values (1, 'Экзамен в Муртаге') returning id`)
    if (!s.ok) throw new Error(s.error)
    session = String(s.rows[0]?.id)
    await runAs(ddb, GM, `insert into public.diary_entries (lore_page_id, body, character_name) values ('${secretPage}', 'заметка мастера', null)`)
  })

  it('players read open lore and sessions, but not GM-only pages or their entries', async () => {
    expect(await runAs(ddb, P1, 'select title from public.lore_pages')).toEqual({ ok: true, rows: [{ title: 'География' }] })
    expect(await runAs(ddb, P1, 'select number from public.diary_sessions')).toEqual({ ok: true, rows: [{ number: 1 }] })
    expect(await runAs(ddb, P1, 'select body from public.diary_entries')).toEqual({ ok: true, rows: [] })
    const gm = await runAs(ddb, GM, 'select title from public.lore_pages')
    expect(gm.ok && gm.rows.length).toBe(2)
  })

  it('only the GM writes lore and sessions', async () => {
    expect((await runAs(ddb, P1, `insert into public.lore_pages (title) values ('x')`)).ok).toBe(false)
    expect(await runAs(ddb, P1, `update public.diary_sessions set summary = 'взлом' returning id`)).toEqual({ ok: true, rows: [] })
    expect(await runAs(ddb, P1, `delete from public.lore_pages returning id`)).toEqual({ ok: true, rows: [] })
  })

  it('players add entries as themselves to visible pages and sessions', async () => {
    const memory = await runAs(
      ddb,
      P1,
      `insert into public.diary_entries (session_id, kind, body, character_name) values ('${session}', 'memory', 'травма гнома', 'Дайдэн') returning author_id`,
    )
    expect(memory).toEqual({ ok: true, rows: [{ author_id: P1 }] })
    expect((await runAs(ddb, P1, `insert into public.diary_entries (lore_page_id, kind, body) values ('${openPage}', 'lore', 'догадка')`)).ok).toBe(true)
    expect((await runAs(ddb, P1, `insert into public.diary_entries (lore_page_id, body) values ('${secretPage}', 'подглядел')`)).ok).toBe(false)
    expect((await runAs(ddb, P1, `insert into public.diary_entries (session_id, body, author_id) values ('${session}', 'чужое', '${P2}')`)).ok).toBe(false)
  })

  it('an entry needs exactly one target', async () => {
    expect((await runAs(ddb, P1, `insert into public.diary_entries (body) values ('никуда')`)).ok).toBe(false)
    expect(
      (await runAs(ddb, P1, `insert into public.diary_entries (lore_page_id, session_id, body) values ('${openPage}', '${session}', 'везде')`)).ok,
    ).toBe(false)
  })

  it("authors edit and delete their own entries, not other players'", async () => {
    expect(await runAs(ddb, P2, `update public.diary_entries set body = 'испорчено' where character_name = 'Дайдэн' returning id`)).toEqual({ ok: true, rows: [] })
    expect(await runAs(ddb, P2, `delete from public.diary_entries where character_name = 'Дайдэн' returning id`)).toEqual({ ok: true, rows: [] })
    const own = await runAs(ddb, P1, `update public.diary_entries set body = 'травма гнома (исправлено)' where character_name = 'Дайдэн' returning body`)
    expect(own).toEqual({ ok: true, rows: [{ body: 'травма гнома (исправлено)' }] })
    expect((await runAs(ddb, P1, `update public.diary_entries set author_id = '${P2}' where character_name = 'Дайдэн'`)).ok).toBe(false)
  })

  it('the GM edits and deletes any entry', async () => {
    const r = await runAs(ddb, GM, `update public.diary_entries set character_name = 'Дайдэн (Аня)' where character_name = 'Дайдэн' returning id`)
    expect(r.ok && r.rows.length).toBe(1)
    const d = await runAs(ddb, GM, `delete from public.diary_entries where body = 'догадка' returning id`)
    expect(d.ok && d.rows.length).toBe(1)
  })
})
