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
    const r = await runAs(db, P1, `select display_name, role from public.profiles where id = '${P1}'`)
    expect(r).toEqual({ ok: true, rows: [{ display_name: 'anya', role: 'player' }] })
  })

  it('names and time zones of others are visible to players (0008), not to anonymous visitors', async () => {
    const r = await runAs(db, P1, 'select id from public.profiles')
    expect(r.ok && r.rows.length).toBe(3)
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

describe('library', () => {
  let ldb: PGlite
  const row = (uuid: string) =>
    `insert into public.library (uuid, source, pack, pack_label, category, type, name) values ('${uuid}', 'ag', 'p', 'P', 'items', 'weapon', 'Кинжал')`

  beforeAll(async () => {
    ldb = await createDb()
    await ldb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
  })

  it('the GM loads and replaces entries; players only read', async () => {
    expect((await runAs(ldb, GM, row('u1'))).ok).toBe(true)
    expect((await runAs(ldb, P1, row('u2'))).ok).toBe(false)
    expect(await runAs(ldb, P1, 'select name from public.library')).toEqual({ ok: true, rows: [{ name: 'Кинжал' }] })
    expect(await runAs(ldb, P1, `update public.library set name = 'x' returning uuid`)).toEqual({ ok: true, rows: [] })
    expect(await runAs(ldb, P1, 'delete from public.library returning uuid')).toEqual({ ok: true, rows: [] })
    const upsert = await runAs(ldb, GM, `${row('u1')} on conflict (uuid) do update set name = 'Кинжал +1' returning name`)
    expect(upsert).toEqual({ ok: true, rows: [{ name: 'Кинжал +1' }] })
  })

  it('anonymous visitors see nothing', async () => {
    expect(await runAs(ldb, null, 'select uuid from public.library')).toEqual({ ok: true, rows: [] })
  })

  it('unknown categories are rejected', async () => {
    const bad = await runAs(ldb, GM, `insert into public.library (uuid, source, pack, pack_label, category, type, name) values ('u9', 'ag', 'p', 'P', 'monsters', 'npc', 'x')`)
    expect(bad.ok).toBe(false)
  })
})

describe('adding library items through the journal', () => {
  let adb: PGlite
  let velian = ''
  let snap = ''

  const add = (uid: string, uuid: string, qty: string, extra = '') =>
    runAs(
      adb,
      uid,
      `insert into public.changes (character_id, snapshot_id, kind, path, new_value, item_uuid, item_name, item_type${extra ? ', old_value' : ''})
       values ('${velian}', '${snap}', 'add_item', 'add-item', '${qty}', '${uuid}', 'Зелье лечения', 'consumable'${extra ? `, '${extra}'` : ''}) returning id`,
    )

  beforeAll(async () => {
    adb = await createDb()
    await adb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    await runAs(adb, GM, `insert into public.library (uuid, source, pack, pack_label, category, type, name) values ('Compendium.x.Item.potion', 'ag', 'x', 'X', 'items', 'consumable', 'Зелье лечения')`)
    const c = await runAs(adb, GM, `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'Velian', 'a1') returning id`)
    if (!c.ok) throw new Error(c.error)
    velian = String(c.rows[0]?.id)
    const s = await runAs(adb, GM, `insert into public.snapshots (character_id, data) values ('${velian}', '{}') returning id`)
    if (!s.ok) throw new Error(s.error)
    snap = String(s.rows[0]?.id)
  })

  it('the owner adds an existing library item with a quantity', async () => {
    expect((await add(P1, 'Compendium.x.Item.potion', '2')).ok).toBe(true)
  })

  it('rejects unknown items, bad quantities and other characters', async () => {
    expect((await add(P1, 'Compendium.x.Item.fake', '1')).ok).toBe(false)
    expect((await add(P1, 'Compendium.x.Item.potion', '0')).ok).toBe(false)
    expect((await add(P1, 'Compendium.x.Item.potion', '1.5')).ok).toBe(false)
    expect((await add(P1, 'Compendium.x.Item.potion', 'true')).ok).toBe(false)
    expect((await add(P2, 'Compendium.x.Item.potion', '1')).ok).toBe(false)
  })

  it('old "set" edits still work and cannot carry an item', async () => {
    const ok = await runAs(adb, P1, `insert into public.changes (character_id, snapshot_id, path, new_value) values ('${velian}', '${snap}', 'system.currency.gp', '5') returning kind`)
    expect(ok).toEqual({ ok: true, rows: [{ kind: 'set' }] })
    const bad = await runAs(
      adb,
      P1,
      `insert into public.changes (character_id, snapshot_id, path, new_value, item_uuid) values ('${velian}', '${snap}', 'system.currency.gp', '5', 'Compendium.x.Item.potion')`,
    )
    expect(bad.ok).toBe(false)
    const wrongPath = await runAs(
      adb,
      P1,
      `insert into public.changes (character_id, snapshot_id, kind, path, new_value, item_uuid, item_name) values ('${velian}', '${snap}', 'add_item', 'system.currency.gp', '1', 'Compendium.x.Item.potion', 'x')`,
    )
    expect(wrongPath.ok).toBe(false)
  })

  it('adding is locked during the game', async () => {
    await runAs(adb, GM, `update public.characters set status = 'in_game'`)
    expect((await add(P1, 'Compendium.x.Item.potion', '1')).ok).toBe(false)
    await runAs(adb, GM, `update public.characters set status = 'between_sessions'`)
  })
})

describe('deleting a character', () => {
  it('the GM deletes a character with its snapshots, edits and notes; players cannot', async () => {
    const xdb = await createDb()
    await xdb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const c = await runAs(xdb, GM, `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'Вася', 'a1') returning id`)
    if (!c.ok) throw new Error(c.error)
    const id = String(c.rows[0]?.id)
    const s = await runAs(xdb, GM, `insert into public.snapshots (character_id, data) values ('${id}', '{}') returning id`)
    if (!s.ok) throw new Error(s.error)
    await runAs(xdb, P1, `insert into public.changes (character_id, snapshot_id, path, new_value) values ('${id}', '${String(s.rows[0]?.id)}', 'system.currency.gp', '1')`)
    await runAs(xdb, P1, `insert into public.character_notes (character_id, body, updated_by) values ('${id}', 'заметка', '${P1}')`)

    expect(await runAs(xdb, P1, `delete from public.characters where id = '${id}' returning id`)).toEqual({ ok: true, rows: [] })
    const del = await runAs(xdb, GM, `delete from public.characters where id = '${id}' returning id`)
    expect(del.ok && del.rows.length).toBe(1)
    for (const table of ['snapshots', 'changes', 'character_notes']) {
      const left = await xdb.query(`select count(*)::int as n from public.${table}`)
      expect(left.rows, table).toEqual([{ n: 0 }])
    }
  })
})

describe('planner', () => {
  let pdb: PGlite

  beforeAll(async () => {
    pdb = await createDb()
    await pdb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
  })

  it('a player sets a real time zone, not a made-up one', async () => {
    expect((await runAs(pdb, P1, `update public.profiles set timezone = 'Europe/Berlin' where id = '${P1}' returning id`)).ok).toBe(true)
    expect((await runAs(pdb, P1, `update public.profiles set timezone = 'Mars/Olympus' where id = '${P1}'`)).ok).toBe(false)
  })

  it('everyone marks only their own free time, in 30-minute UTC slots, and sees everyone else', async () => {
    expect((await runAs(pdb, P1, `insert into public.availability (slot_start) values ('2026-12-05 16:00+00'), ('2026-12-05 16:30+00') returning user_id`)).ok).toBe(true)
    expect((await runAs(pdb, P2, `insert into public.availability (slot_start) values ('2026-12-05 16:00+00')`)).ok).toBe(true)
    expect((await runAs(pdb, P1, `insert into public.availability (user_id, slot_start) values ('${P2}', '2026-12-05 17:00+00')`)).ok).toBe(false)
    expect((await runAs(pdb, P1, `insert into public.availability (slot_start) values ('2026-12-05 16:10+00')`)).ok).toBe(false)
    const all = await runAs(pdb, P2, 'select user_id from public.availability')
    expect(all.ok && all.rows.length).toBe(3)
    expect(await runAs(pdb, P2, `delete from public.availability where user_id = '${P1}' returning slot_start`)).toEqual({ ok: true, rows: [] })
    const own = await runAs(pdb, P1, `delete from public.availability where user_id = '${P1}' returning slot_start`)
    expect(own.ok && own.rows.length).toBe(2)
  })

  it('only the GM sets sessions; everyone signed in sees them', async () => {
    expect((await runAs(pdb, P1, `insert into public.planned_sessions (starts_at) values ('2026-12-05 16:00+00')`)).ok).toBe(false)
    expect((await runAs(pdb, GM, `insert into public.planned_sessions (starts_at, note) values ('2026-12-05 16:00+00', 'Сессия 6')`)).ok).toBe(true)
    expect(await runAs(pdb, P2, 'select note from public.planned_sessions')).toEqual({ ok: true, rows: [{ note: 'Сессия 6' }] })
    expect(await runAs(pdb, null, 'select note from public.planned_sessions')).toEqual({ ok: true, rows: [] })
  })
})

describe('GM review of edits', () => {
  let rdb: PGlite
  let velian = ''
  let snap = ''

  const edit = (uid: string, extra = '') =>
    runAs(
      rdb,
      uid,
      `insert into public.changes (character_id, snapshot_id, path, old_value, new_value${extra ? ', review' : ''})
       values ('${velian}', '${snap}', 'system.attributes.hp.value', '59', '40'${extra ? `, '${extra}'` : ''}) returning id, review`,
    )

  beforeAll(async () => {
    rdb = await createDb()
    await rdb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const c = await runAs(rdb, GM, `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'Velian', 'a1') returning id`)
    if (!c.ok) throw new Error(c.error)
    velian = String(c.rows[0]?.id)
    const s = await runAs(rdb, GM, `insert into public.snapshots (character_id, data) values ('${velian}', '{}') returning id`)
    if (!s.ok) throw new Error(s.error)
    snap = String(s.rows[0]?.id)
  })

  it('a player edit starts without a decision; the player cannot decide it', async () => {
    const r = await edit(P1)
    expect(r.ok && r.rows[0]?.review).toBe(null)
    expect((await edit(P1, 'accepted')).ok).toBe(false)
    expect((await edit(P1, 'rejected')).ok).toBe(false)
    expect(await runAs(rdb, P1, `update public.changes set review = 'accepted' returning id`)).toEqual({ ok: true, rows: [] })
  })

  it('the GM accepts, rejects and changes their mind; only known decisions', async () => {
    const r = await edit(P1)
    const id = r.ok ? String(r.rows[0]?.id) : ''
    expect((await runAs(rdb, GM, `update public.changes set review = 'rejected' where id = '${id}' returning id`)).ok).toBe(true)
    expect((await runAs(rdb, GM, `update public.changes set review = 'accepted' where id = '${id}' returning id`)).ok).toBe(true)
    expect((await runAs(rdb, GM, `update public.changes set review = null, applied_at = now() where id = '${id}' returning id`)).ok).toBe(true)
    expect((await runAs(rdb, GM, `update public.changes set review = 'maybe' where id = '${id}'`)).ok).toBe(false)
    // still no other column for the GM either
    expect((await runAs(rdb, GM, `update public.changes set new_value = '5' where id = '${id}'`)).ok).toBe(false)
  })

  it('the GM may add own edits already decided', async () => {
    const r = await edit(GM, 'accepted')
    expect(r.ok && r.rows[0]?.review).toBe('accepted')
  })

  it('the owner sees the decision on their edits', async () => {
    const r = await runAs(rdb, P1, 'select review from public.changes')
    expect(r.ok && r.rows.length).toBeGreaterThan(0)
    expect(await runAs(rdb, P2, 'select review from public.changes')).toEqual({ ok: true, rows: [] })
  })
})

describe('telegram notifications', () => {
  let tdb: PGlite

  beforeAll(async () => {
    tdb = await createDb()
    await tdb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
      -- the server function (service role, bypasses RLS) connected Anya
      insert into public.telegram_links (user_id, chat_id) values ('${P1}', 111222333);
      insert into public.telegram_link_codes (code, user_id) values ('abcdefghijklmnop', '${P2}');
      insert into public.notification_log (key, user_id, kind) values ('test:${P1}', '${P1}', 'test');
    `)
  })

  it('a person sees that they are connected, but not the chat id, and nobody else', async () => {
    expect(await runAs(tdb, P1, 'select user_id from public.telegram_links')).toEqual({ ok: true, rows: [{ user_id: P1 }] })
    expect((await runAs(tdb, P1, 'select chat_id from public.telegram_links')).ok).toBe(false)
    expect((await runAs(tdb, P1, 'select * from public.telegram_links')).ok).toBe(false)
    expect(await runAs(tdb, P2, 'select user_id from public.telegram_links')).toEqual({ ok: true, rows: [] })
    expect((await runAs(tdb, GM, 'select chat_id from public.telegram_links')).ok).toBe(false)
  })

  it('nobody connects a chat or reads link codes from the app', async () => {
    expect((await runAs(tdb, P2, `insert into public.telegram_links (user_id, chat_id) values ('${P2}', 1)`)).ok).toBe(false)
    expect((await runAs(tdb, P2, `update public.telegram_links set chat_id = 5`)).ok).toBe(false)
    expect((await runAs(tdb, P2, 'select code from public.telegram_link_codes')).ok).toBe(false)
    expect((await runAs(tdb, P2, `insert into public.telegram_link_codes (code, user_id) values ('zzzzzzzzzzzzzzzz', '${P2}')`)).ok).toBe(false)
    expect((await runAs(tdb, GM, 'select code from public.telegram_link_codes')).ok).toBe(false)
  })

  it('a person disconnects only themselves', async () => {
    expect(await runAs(tdb, P2, `delete from public.telegram_links where user_id = '${P1}' returning user_id`)).toEqual({ ok: true, rows: [] })
    const own = await runAs(tdb, P1, `delete from public.telegram_links where user_id = '${P1}' returning user_id`)
    expect(own.ok && own.rows.length).toBe(1)
  })

  it('everyone keeps their own notification switches', async () => {
    const add = await runAs(tdb, P1, 'insert into public.notification_prefs (remind_1h) values (false) returning user_id, remind_24h, remind_1h')
    expect(add).toEqual({ ok: true, rows: [{ user_id: P1, remind_24h: true, remind_1h: false }] })
    expect((await runAs(tdb, P1, `insert into public.notification_prefs (user_id) values ('${P2}')`)).ok).toBe(false)
    expect((await runAs(tdb, P1, `update public.notification_prefs set game_started = false where user_id = '${P1}' returning user_id`)).ok).toBe(true)
    expect(await runAs(tdb, P2, 'select user_id from public.notification_prefs')).toEqual({ ok: true, rows: [] })
    expect(await runAs(tdb, P2, `update public.notification_prefs set game_started = true returning user_id`)).toEqual({ ok: true, rows: [] })
  })

  it('the send log is written only by the server; a person reads their own', async () => {
    expect(await runAs(tdb, P1, 'select kind from public.notification_log')).toEqual({ ok: true, rows: [{ kind: 'test' }] })
    expect(await runAs(tdb, P2, 'select kind from public.notification_log')).toEqual({ ok: true, rows: [] })
    expect((await runAs(tdb, P1, `insert into public.notification_log (key, user_id, kind) values ('x', '${P1}', 'test')`)).ok).toBe(false)
    expect((await runAs(tdb, P1, `delete from public.notification_log`)).ok).toBe(false)
  })
})

describe('notification triggers', () => {
  let ndb: PGlite
  let velian = ''
  let kairen = ''
  let snap = ''

  /** Events queued for the notify function since the last call. */
  async function queued(): Promise<Record<string, unknown>[]> {
    const r = await ndb.query<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }>('select url, body, headers from net._calls order by id')
    await ndb.exec('delete from net._calls')
    for (const row of r.rows) {
      expect(row.url).toBe('https://example.supabase.co/functions/v1/notify')
      expect(row.headers['x-notify-secret']).toBe('s3cret')
    }
    return r.rows.map((row) => row.body)
  }

  beforeAll(async () => {
    ndb = await createDb()
    await ndb.exec(`
      insert into auth.users values ('${GM}', 'gm@example.com'), ('${P1}', 'anya@example.com'), ('${P2}', 'dima@example.com');
      update public.profiles set role = 'gm' where id = '${GM}';
    `)
    const c = await runAs(ndb, GM, `insert into public.characters (owner_id, name, foundry_actor_id) values ('${P1}', 'Velian', 'a1'), ('${P2}', 'Kairen', 'a2') returning id, name`)
    if (!c.ok) throw new Error(c.error)
    velian = String(c.rows.find((r) => r.name === 'Velian')?.id)
    kairen = String(c.rows.find((r) => r.name === 'Kairen')?.id)
  })

  it('sends nothing until both Vault secrets exist, and the app keeps working', async () => {
    expect((await runAs(ndb, GM, `insert into public.planned_sessions (starts_at) values ('2026-12-05 16:00+00') returning id`)).ok).toBe(true)
    expect(await queued()).toEqual([])
    await ndb.exec(`insert into vault.secrets values ('project_url', 'https://example.supabase.co/'), ('notify_secret', 's3cret')`)
  })

  it('a session set or moved; changing only the note is not news', async () => {
    const r = await runAs(ndb, GM, `insert into public.planned_sessions (starts_at) values ('2026-12-07 16:00+00') returning id`)
    const id = r.ok ? String(r.rows[0]?.id) : ''
    expect(await queued()).toEqual([{ type: 'session_scheduled', session_id: id }])
    await runAs(ndb, GM, `update public.planned_sessions set note = 'Сессия 6' where id = '${id}'`)
    expect(await queued()).toEqual([])
    await runAs(ndb, GM, `update public.planned_sessions set starts_at = '2026-12-08 16:00+00' where id = '${id}'`)
    expect(await queued()).toEqual([{ type: 'session_moved', session_id: id }])
  })

  it('the GM starts the game: one event for the whole party; ending it is not news', async () => {
    await runAs(ndb, GM, `update public.characters set status = 'in_game'`)
    const [event] = await queued()
    expect(event?.type).toBe('game_started')
    expect([...(event?.character_ids as string[])].sort()).toEqual([velian, kairen].sort())
    await runAs(ndb, GM, `update public.characters set status = 'between_sessions'`)
    expect(await queued()).toEqual([])
  })

  it('new snapshots, edits applied (not rejected ones), free time marked', async () => {
    const s = await runAs(ndb, GM, `insert into public.snapshots (character_id, data) values ('${velian}', '{}') returning id`)
    snap = s.ok ? String(s.rows[0]?.id) : ''
    expect(await queued()).toEqual([{ type: 'snapshot_ready', snapshot_ids: [snap] }])

    const ins = (review: string) =>
      runAs(ndb, GM, `insert into public.changes (character_id, snapshot_id, path, new_value, review) values ('${velian}', '${snap}', 'system.currency.gp', '1', ${review}) returning id`)
    await ins(`'rejected'`)
    await runAs(ndb, GM, `update public.changes set applied_at = now() where applied_at is null`)
    expect(await queued()).toEqual([])
    await ins(`'accepted'`)
    await runAs(ndb, GM, `update public.changes set applied_at = now() where applied_at is null`)
    expect(await queued()).toEqual([{ type: 'edits_applied', character_ids: [velian] }])
    await runAs(ndb, GM, `update public.changes set review = 'accepted'`)
    expect(await queued()).toEqual([])

    await runAs(ndb, P1, `insert into public.availability (slot_start) values ('2026-12-10 16:00+00'), ('2026-12-10 16:30+00')`)
    expect(await queued()).toEqual([{ type: 'availability' }])
  })

  it('a failing send never breaks the action in the app', async () => {
    await ndb.exec(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
      returns bigint language plpgsql as $$ begin raise exception 'network down'; end $$`)
    expect((await runAs(ndb, GM, `insert into public.planned_sessions (starts_at) values ('2026-12-20 16:00+00') returning id`)).ok).toBe(true)
  })

  it('only the server checks the notify secret; the hourly job is scheduled', async () => {
    expect((await runAs(ndb, P1, `select public.notify_secret_ok('s3cret')`)).ok).toBe(false)
    expect((await runAs(ndb, GM, `select public.send_notification('{}')`)).ok).toBe(false)
    const service = await ndb.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      return (await tx.query<{ ok: boolean; bad: boolean; empty: boolean }>(`select public.notify_secret_ok('s3cret') as ok, public.notify_secret_ok('nope') as bad, public.notify_secret_ok('') as empty`)).rows[0]
    })
    expect(service).toEqual({ ok: true, bad: false, empty: false })
    const jobs = await ndb.query<{ schedule: string; command: string }>(`select schedule, command from cron._jobs where name = 'dndhub-notify-hourly'`)
    expect(jobs.rows[0]?.schedule).toBe('5 * * * *')
    expect(jobs.rows[0]?.command).toContain('"type": "tick"')
  })
})

