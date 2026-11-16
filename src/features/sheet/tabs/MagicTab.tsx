import { ABILITY_LABEL, type SheetSpell } from '../../../lib/snapshot/sheet'
import { Description, Pips } from '../bits'
import { signed } from '../format'
import { ruLabel } from '../labels'
import type { TabProps } from '../sheet-ui'

const ABILITY_NAME: Record<string, string> = {
  str: 'Сила',
  dex: 'Ловкость',
  con: 'Телосложение',
  int: 'Интеллект',
  wis: 'Мудрость',
  cha: 'Харизма',
}

function levelTitle(level: number): string {
  return level === 0 ? 'Заговоры' : `${level} круг`
}

function spellMeta(sp: SheetSpell): string {
  return [ruLabel(sp.activation), ruLabel(sp.range), ruLabel(sp.duration)].filter((v) => v && v !== 'мгновенно').join(' · ')
}

/** "Магия": spell DC and attack, slots, spells grouped by level with a concentration mark. */
export function MagicTab({ sheet, rollD20 }: TabProps) {
  const slots = sheet.resources.filter((r) => r.kind === 'slot')
  const pending = sheet.spells.filter((s) => s.pending)
  const levels = [...new Set(sheet.spells.filter((s) => !s.pending).map((s) => s.level))].sort((a, b) => a - b)
  const classLine = sheet.classes.map((c) => `${c.name} ${c.levels}`).join(' / ')
  const ability = sheet.spellcasting?.ability

  return (
    <>
      <div className="art-header art-header-banner">
        <img src={`${import.meta.env.BASE_URL}ui/art/magic.jpg`} alt="Заклинатель вызывает фиолетовое пламя в руинах" style={{ objectPosition: '30% 30%' }} />
      </div>
      <div className="art-title art-title-short">
        <h1 style={{ fontSize: 32 }}>Магия</h1>
        <span className="muted small">
          {[classLine, ability ? `заклинательная характеристика — ${ABILITY_NAME[ability] ?? ABILITY_LABEL[ability]}` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      {!sheet.spellcasting && sheet.spells.length === 0 ? (
        <p className="muted">Персонаж не владеет магией.</p>
      ) : (
        <>
          <div className="vital-grid">
            <div className="ability">
              <span className="big-number">{sheet.spellcasting?.dc ?? '—'}</span>
              <span className="muted small">СЛ спасброска</span>
            </div>
            <button className="ability" onClick={() => rollD20('Атака заклинанием', sheet.spellcasting?.attack ?? null)} disabled={!sheet.spellcasting}>
              <span className="big-number">{sheet.spellcasting ? signed(sheet.spellcasting.attack) : '—'}</span>
              <span className="muted small">Атака</span>
            </button>
            <div className="ability">
              <span className="big-number">{sheet.spells.length}</span>
              <span className="muted small">Известно</span>
            </div>
          </div>

          {slots.length > 0 && (
            <>
              <h2 className="section-title">Ячейки</h2>
              <div className="ability-grid">
                {slots.map((s) => (
                  <div key={s.id} className="ability slot-tile" aria-label={`${s.name}: осталось ${s.value} из ${s.max}`}>
                    <span className="muted small">{s.name.replace(/^Ячейки /, '').replace(/ круга$/, ' круг')}</span>
                    <Pips value={s.value} max={s.max} />
                    <span className="muted small">
                      {s.value} из {s.max}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Потратить или вернуть ячейку — на вкладке «Бой».
              </p>
            </>
          )}

          <h2 className="section-title">Заклинания</h2>
          {sheet.spells.length === 0 ? (
            <p className="muted">Заклинаний нет.</p>
          ) : (
            <div className="card list">
              {levels.map((level) => (
                <div key={level}>
                  <div className="spell-level">{levelTitle(level)}</div>
                  {sheet.spells
                    .filter((sp) => sp.level === level && !sp.pending)
                    .map((sp) => (
                      <details key={sp.id} className="list-details">
                        <summary>
                          <span className="grow spell-name">
                            <span>{sp.name}</span>
                            {spellMeta(sp) && <span className="muted small">{spellMeta(sp)}</span>}
                          </span>
                          {sp.concentration && (
                            <span className="conc-badge" title="Концентрация" aria-label="Концентрация">
                              К
                            </span>
                          )}
                        </summary>
                        <Description html={sp.description} />
                      </details>
                    ))}
                </div>
              ))}
              {pending.length > 0 && (
                <div>
                  <div className="spell-level">Из библиотеки, ждут мастера</div>
                  {pending.map((sp) => (
                    <div key={sp.id} className="list-row static">
                      <span className="grow">{sp.name}</span>
                      <span className="chip chip-blood">ждёт мастера</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
