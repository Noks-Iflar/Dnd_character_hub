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
