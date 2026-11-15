import { Portrait } from '../../../components/Portrait'
import { ABILITY_LABEL } from '../../../lib/snapshot/sheet'
import { Pips } from '../bits'
import { signed, statText } from '../format'
import { attackNote, type RollMode, type TabProps } from '../sheet-ui'
import { Stepper } from '../Stepper'

const MODES: { id: RollMode; label: string }[] = [
  { id: 'dis', label: 'Помеха' },
  { id: 'normal', label: 'Обычный' },
  { id: 'adv', label: 'Преимущество' },
]

/** "Бой": roll mode, attacks with hit and damage buttons, slots and charges. */
export function CombatTab({
  sheet,
  edit,
  rollD20,
  rollDamage,
  setResource,
  mode,
  onMode,
}: TabProps & { mode: RollMode; onMode: (mode: RollMode) => void }) {
  return (
    <>
      <header className="sheet-header compact">
        <Portrait src={sheet.portrait} name={sheet.name} size={54} spin={40} />
        <div className="sheet-title">
          <span className="name-small">{sheet.name}</span>
          <span className="muted small">
            ХП {sheet.hp.value ?? '—'}/{statText(sheet.hp.max)} · КД {statText(sheet.ac)}
          </span>
        </div>
      </header>

      <div className="segmented" role="group" aria-label="Режим броска d20">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => onMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">Атаки</h2>
      {sheet.attacks.length === 0 ? (
        <p className="muted">
          {sheet.hasComputed ? 'Атак нет.' : 'Атаки появятся в снимке из макроса: в обычном экспорте Foundry их нет.'}
        </p>
      ) : (
        <div className="attack-list">
          {sheet.attacks.map((a) => (
            <div key={a.id} className="card attack">
              <div className="grow attack-name">
                <span>{a.name}</span>
                <span className="muted small">{attackNote(a)}</span>
              </div>
              {a.toHit !== null && (
                <button className="attack-btn" onClick={() => rollD20(`${a.name}: попадание`, a.toHit)} aria-label={`Бросить попадание: ${a.name}`}>
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
                <button className="attack-btn" onClick={() => rollDamage(a)} aria-label={`Бросить урон: ${a.name}`}>
                  <span className="row-number small-number damage-number">
                    {a.damages.map((d) => d.formula.replace(/\s+/g, '')).join('+')}
                  </span>
                  <span className="muted tiny">урон</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {sheet.resources.length > 0 && (
        <>
          <h2 className="section-title">Ячейки и заряды</h2>
          <div className="card list">
            {sheet.resources.map((r) => (
              <div key={`${r.kind}.${r.id}`} className="list-row static">
                <span className="grow">{r.name}</span>
                <Pips value={r.value} max={r.max} />
                {edit ? (
                  <Stepper label={r.name} value={r.value} max={r.max} onCommit={(v) => setResource(r, v)} />
                ) : (
                  <span className="muted small count">
                    {r.value}/{r.max}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
