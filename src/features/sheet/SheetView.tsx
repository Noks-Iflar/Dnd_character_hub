import { useState } from 'react'
import { roll } from '../../lib/dice/dice'
import { toSafeHtml } from '../../lib/enrichers/enrichers'
import type { ChangeValue } from '../../lib/snapshot/changes'
import { itemPath } from '../../lib/snapshot/changes'
import { ABILITY_LABEL, type Sheet, type SheetAttack, type SheetResource } from '../../lib/snapshot/sheet'
import { Approx } from './Approx'
import { d20, signed, statText } from './format'
import { RollToast, type ShownRoll } from './RollToast'
import { Stepper } from './Stepper'

const COINS: [string, string][] = [
  ['pp', 'пм'],
  ['gp', 'зм'],
  ['ep', 'эм'],
  ['sp', 'см'],
  ['cp', 'мм'],
]

const DAMAGE_TYPE: Record<string, string> = {
  acid: 'кислота',
  bludgeoning: 'дробящий',
  cold: 'холод',
  fire: 'огонь',
  force: 'силовое поле',
  lightning: 'электричество',
  necrotic: 'некротическая энергия',
  piercing: 'колющий',
  poison: 'яд',
  psychic: 'психическая энергия',
  radiant: 'излучение',
  slashing: 'рубящий',
  thunder: 'звук',
  healing: 'лечение',
  temphp: 'временные хиты',
}

function damageText(a: SheetAttack): string {
  return a.damages.map((d) => `${d.formula}${d.type ? ` ${DAMAGE_TYPE[d.type] ?? d.type}` : ''}`).join(' + ')
}

function Pips({ value, max }: { value: number; max: number }) {
  if (max > 10) return <span className="row-number">{`${value} / ${max}`}</span>
  return (
    <span className="pips" aria-label={`${value} из ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip${i < value ? ' full' : ''}`} />
      ))}
    </span>
  )
}

function Description({ html }: { html: string }) {
  const safe = toSafeHtml(html).trim()
  if (!safe) return <p className="muted">Описания нет.</p>
  return <div className="description" dangerouslySetInnerHTML={{ __html: safe }} />
}

/** Present when the sheet may be edited: records one edit in the journal. */
export type SheetEdit = { set: (path: string, oldValue: ChangeValue | null, newValue: ChangeValue) => void }

const EQUIPPABLE = new Set(['weapon', 'equipment'])

export function SheetView({ sheet, edit }: { sheet: Sheet; edit?: SheetEdit }) {
  const [shown, setShown] = useState<ShownRoll | null>(null)

  function setResource(r: SheetResource, remaining: number) {
    if (!edit) return
    const stored = (v: number) => (r.stores === 'spent' ? r.max - v : v)
    edit.set(r.path, stored(r.value), stored(remaining))
  }

  function rollD20(label: string, mod: number | null) {
    if (mod === null) return
    const result = roll(d20(mod))
    if (result) setShown({ label, result })
  }

  function rollDamage(a: SheetAttack) {
    const parts = a.damages.map((d) => d.formula)
    const result = roll(parts.join(' + '))
    if (result) setShown({ label: `${a.name}: урон`, result })
  }

  const hpMax = sheet.hp.max.value
  const hpPercent = hpMax && sheet.hp.value !== null ? Math.max(0, Math.min(100, (sheet.hp.value / hpMax) * 100)) : 0
  const classLine = sheet.classes.map((c) => `${c.name} ${c.levels}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ')

  return (
    <>
      <header className="sheet-header">
        {sheet.portrait ? (
          <img className="portrait" src={sheet.portrait} alt={`Портрет: ${sheet.name}`} />
        ) : (
          <div className="portrait portrait-empty" aria-hidden="true">
            {sheet.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="sheet-title">
          <h1>{sheet.name}</h1>
          <span className="muted">{[sheet.race, classLine].filter(Boolean).join(' · ')}</span>
          <span className="muted small">
            {[sheet.background, `уровень ${sheet.level}`, `мастерство ${statText(sheet.prof, true)}`].filter(Boolean).join(' · ')}
          </span>
        </div>
      </header>

      <section className="card vitals" aria-label="Хиты и защита">
        <div className="hp-line">
          <span className="label-caps">Хиты</span>
          <span className="big-number">
            {sheet.hp.value ?? '—'}
            <span className="muted"> / {statText(sheet.hp.max)}</span>
            <Approx stat={sheet.hp.max} />
            {sheet.hp.temp ? <span className="temp"> +{sheet.hp.temp}</span> : null}
          </span>
        </div>
        <div className="hp-bar" aria-hidden="true">
          <div style={{ width: `${hpPercent}%` }} />
        </div>
        {edit && (
          <>
            <div className="edit-row">
              <span className="muted small">Текущие хиты</span>
              <Stepper
                label="Текущие хиты"
                value={sheet.hp.value ?? 0}
                max={hpMax ?? undefined}
                onCommit={(v) => edit.set('system.attributes.hp.value', sheet.hp.value, v)}
              />
            </div>
            <div className="edit-row">
              <span className="muted small">Временные хиты</span>
              <Stepper
                label="Временные хиты"
                value={sheet.hp.temp ?? 0}
                onCommit={(v) => edit.set('system.attributes.hp.temp', sheet.hp.temp, v)}
              />
            </div>
          </>
        )}
        <div className="vital-grid">
          <div className="vital">
            <span className="big-number">
              {statText(sheet.ac)}
              <Approx stat={sheet.ac} />
            </span>
            <span className="muted small">КД</span>
          </div>
          <button className="vital" onClick={() => rollD20('Инициатива', sheet.init.value)}>
            <span className="big-number">
              {statText(sheet.init, true)}
              <Approx stat={sheet.init} />
            </span>
            <span className="muted small">Инициатива</span>
          </button>
          <div className="vital">
            <span className="big-number">
              {statText(sheet.speed)}
              <Approx stat={sheet.speed} />
            </span>
            <span className="muted small">Скорость, фт</span>
          </div>
        </div>
        {edit ? (
          <>
            <div className="edit-row">
              <button
                type="button"
                className="toggle"
                aria-pressed={sheet.inspiration}
                onClick={() => edit.set('system.attributes.inspiration', sheet.inspiration, !sheet.inspiration)}
              >
                {sheet.inspiration ? 'Вдохновение есть' : 'Вдохновения нет'}
              </button>
            </div>
            <div className="edit-row">
              <span className="muted small">Истощение</span>
              <Stepper
                label="Истощение"
                value={sheet.exhaustion}
                max={6}
                onCommit={(v) => edit.set('system.attributes.exhaustion', sheet.exhaustion, v)}
              />
            </div>
            <div className="edit-row">
              <span className="muted small">Спасброски от смерти: успехи</span>
              <Stepper
                label="Успехи спасбросков от смерти"
                value={sheet.death.success}
                max={3}
                onCommit={(v) => edit.set('system.attributes.death.success', sheet.death.success, v)}
              />
            </div>
            <div className="edit-row">
              <span className="muted small">Спасброски от смерти: провалы</span>
              <Stepper
                label="Провалы спасбросков от смерти"
                value={sheet.death.failure}
                max={3}
                onCommit={(v) => edit.set('system.attributes.death.failure', sheet.death.failure, v)}
              />
            </div>
            {sheet.hitDice.map((hd) => (
              <div key={hd.classId} className="edit-row">
                <span className="muted small">
                  Кости хитов {hd.denomination} ({hd.name}), осталось
                </span>
                <Stepper
                  label={`Кости хитов ${hd.name}`}
                  value={hd.total - hd.spent}
                  max={hd.total}
                  onCommit={(v) => edit.set(itemPath(hd.classId, 'hd.spent'), hd.spent, hd.total - v)}
                />
              </div>
            ))}
          </>
        ) : (
          <div className="muted small">
            {sheet.inspiration ? 'Есть героическое вдохновение' : 'Нет вдохновения'}
            {sheet.exhaustion ? ` · истощение ${sheet.exhaustion}` : ''}
            {sheet.hitDice.length > 0 &&
              ` · кости хитов ${sheet.hitDice.map((hd) => `${hd.total - hd.spent}/${hd.total}${hd.denomination}`).join(', ')}`}
          </div>
        )}
      </section>

      <h2 className="section-title">Характеристики</h2>
      <div className="ability-grid">
        {sheet.abilities.map((a) => (
          <button key={a.key} className="ability" onClick={() => rollD20(`${a.label}: проверка`, a.mod.value)}>
            <span className="muted small caps">{a.label}</span>
            <span className="big-number">
              {statText(a.mod, true)}
              <Approx stat={a.mod} />
            </span>
            <span className="muted small">{a.score ?? '—'}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title">Спасброски</h2>
      <div className="ability-grid">
        {sheet.abilities.map((a) => (
          <button key={a.key} className="ability" onClick={() => rollD20(`${a.label}: спасбросок`, a.save.value)}>
            <span className="muted small caps">
              {a.saveProficient ? <span className="prof-dot filled" aria-label="владение" /> : <span className="prof-dot" />}
              {a.label}
            </span>
            <span className="big-number">
              {statText(a.save, true)}
              <Approx stat={a.save} />
            </span>
          </button>
        ))}
      </div>

      <h2 className="section-title">Навыки</h2>
      <div className="card list">
        {sheet.skills.map((s) => (
          <button key={s.key} className="list-row" onClick={() => rollD20(s.label, s.total.value)}>
            <span className={`prof-dot${s.proficiency >= 1 ? ' filled' : ''}${s.proficiency >= 2 ? ' double' : ''}`} aria-hidden="true" />
            <span className="grow">{s.label}</span>
            <span className="muted small">пасс. {statText(s.passive)}</span>
            <span className="row-number">
              {statText(s.total, true)}
              <Approx stat={s.total} />
            </span>
          </button>
        ))}
      </div>

      {sheet.attacks.length > 0 && (
        <>
          <h2 className="section-title">Атаки</h2>
          <div className="attack-list">
            {sheet.attacks.map((a) => (
              <div key={a.id} className="card attack">
                <div className="grow attack-name">
                  <span>{a.name}</span>
                  <span className="muted small">
                    {[a.activity !== 'Attack' ? a.activity : null, a.range, damageText(a) || null].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {a.toHit !== null && (
                  <button className="attack-btn" onClick={() => rollD20(`${a.name}: попадание`, a.toHit)}>
                    <span className="row-number">{signed(a.toHit)}</span>
                    <span className="muted tiny">попадание</span>
                  </button>
                )}
                {a.toHit === null && a.save && (
                  <div className="attack-btn">
                    <span className="row-number">СЛ {a.save.dc}</span>
                    <span className="muted tiny">{a.save.ability ? ABILITY_LABEL[a.save.ability] : 'спас'}</span>
                  </div>
                )}
                {a.damages.length > 0 && (
                  <button className="attack-btn" onClick={() => rollDamage(a)}>
                    <span className="row-number small-number">{a.damages.map((d) => d.formula.replace(/\s+/g, '')).join('+')}</span>
                    <span className="muted tiny">урон</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(sheet.resources.length > 0 || sheet.spellcasting) && (
        <>
          <h2 className="section-title">Заряды и магия</h2>
          <div className="card list">
            {sheet.spellcasting && (
              <div className="list-row static">
                <span className="grow">Заклинания</span>
                <span className="muted small">СЛ {sheet.spellcasting.dc}</span>
                <button className="link-btn" onClick={() => rollD20('Атака заклинанием', sheet.spellcasting?.attack ?? 0)}>
                  атака {signed(sheet.spellcasting.attack)}
                </button>
              </div>
            )}
            {sheet.resources.map((r) => (
              <div key={`${r.kind}.${r.id}`} className="list-row static">
                <span className="grow">{r.name}</span>
                <Pips value={r.value} max={r.max} />
                {edit && <Stepper label={r.name} value={r.value} max={r.max} onCommit={(v) => setResource(r, v)} />}
              </div>
            ))}
          </div>
        </>
      )}

      {sheet.spells.length > 0 && (
        <>
          <h2 className="section-title">Заклинания</h2>
          <div className="card list">
            {sheet.spells.map((sp) => (
              <details key={sp.id} className="list-details">
                <summary>
                  <span className="grow">{sp.name}</span>
                  <span className="muted small">{sp.level === 0 ? 'заговор' : `${sp.level} круг`}</span>
                </summary>
                <Description html={sp.description} />
              </details>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Снаряжение</h2>
      {edit ? (
        <div className="card list">
          {COINS.map(([key, label]) => (
            <div key={key} className="list-row static">
              <span className="grow">{label}</span>
              <Stepper
                label={`Монеты: ${label}`}
                value={sheet.currency[key] ?? 0}
                onCommit={(v) => edit.set(`system.currency.${key}`, sheet.currency[key] ?? 0, v)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="card coins">
          {COINS.map(([key, label]) => (
            <span key={key}>
              <span className="row-number">{sheet.currency[key] ?? 0}</span> <span className="muted small">{label}</span>
            </span>
          ))}
        </div>
      )}
      {sheet.inventory.length > 0 ? (
        <div className="card list">
          {sheet.inventory.map((it) => (
            <details key={it.id} className="list-details">
              <summary>
                <span className="grow">
                  {it.name}
                  {it.quantity !== 1 ? ` ×${it.quantity}` : ''}
                </span>
                {it.equipped && <span className="chip chip-tech">надето</span>}
              </summary>
              {edit && (
                <div className="edit-row" style={{ padding: '10px 14px 0' }}>
                  {EQUIPPABLE.has(it.type) && (
                    <button
                      type="button"
                      className="toggle"
                      aria-pressed={it.equipped}
                      onClick={() => edit.set(itemPath(it.id, 'equipped'), it.equipped, !it.equipped)}
                    >
                      {it.equipped ? 'Надето' : 'Не надето'}
                    </button>
                  )}
                  <Stepper
                    label={`Количество: ${it.name}`}
                    value={it.quantity}
                    onCommit={(v) => edit.set(itemPath(it.id, 'quantity'), it.quantity, v)}
                  />
                </div>
              )}
              <Description html={it.description} />
            </details>
          ))}
        </div>
      ) : (
        <p className="muted">Предметов нет.</p>
      )}

      <h2 className="section-title">Умения</h2>
      <div className="card list">
        {sheet.features.map((f) => (
          <details key={f.id} className="list-details">
            <summary>
              <span className="grow">{f.name}</span>
            </summary>
            <Description html={f.description} />
          </details>
        ))}
      </div>

      <RollToast roll={shown} onClose={() => setShown(null)} />
    </>
  )
}
