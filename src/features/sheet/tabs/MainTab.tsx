import { useState } from 'react'
import { Portrait } from '../../../components/Portrait'
import { itemPath } from '../../../lib/snapshot/changes'
import { Approx } from '../Approx'
import { statText } from '../format'
import type { TabProps } from '../sheet-ui'
import { Stepper } from '../Stepper'
import { BrushButton } from '../../../components/BrushButton'

/** "Лист": portrait, HP and defence, abilities, saves, skills. */
export function MainTab({ sheet, edit, rollD20 }: TabProps) {
  const [allSkills, setAllSkills] = useState(false)
  const hpMax = sheet.hp.max.value
  const hpPercent = hpMax && sheet.hp.value !== null ? Math.max(0, Math.min(100, (sheet.hp.value / hpMax) * 100)) : 0
  const classLine = sheet.classes.map((c) => `${c.name} ${c.levels}`).join(' / ')
  const subclasses = sheet.classes.map((c) => c.subclass).filter(Boolean)
  const proficientSkills = sheet.skills.filter((s) => s.proficiency >= 1)
  const skills = allSkills || proficientSkills.length === 0 ? sheet.skills : proficientSkills

  return (
    <>
      <header className="sheet-header">
        <Portrait src={sheet.portrait} name={sheet.name} />
        <div className="sheet-title">
          <h1>{sheet.name}</h1>
          <span className="muted">{[sheet.race, classLine].filter(Boolean).join(' · ')}</span>
          <span className="muted small">
            {[...subclasses, sheet.background, `бонус мастерства ${statText(sheet.prof, true)}`].filter(Boolean).join(' · ')}
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
        <div
          className="hp-bar"
          role="img"
          aria-label={`Хиты: ${sheet.hp.value ?? '—'} из ${hpMax ?? '—'}`}
          style={{ ['--hp' as string]: `${hpPercent}%` }}
        >
          <div />
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
            <span className="muted small">
              {a.score ?? '—'} · спас {statText(a.save, true)}
            </span>
          </button>
        ))}
      </div>

      <h2 className="section-title">Спасброски</h2>
      <div className="ability-grid">
        {sheet.abilities.map((a) => (
          <button key={a.key} className="ability" onClick={() => rollD20(`${a.label}: спасбросок`, a.save.value)}>
            <span className="muted small caps">
              <span className={`prof-dot${a.saveProficient ? ' filled' : ''}`} aria-label={a.saveProficient ? 'владение' : undefined} />
              {a.label}
            </span>
            <span className="big-number">
              {statText(a.save, true)}
              <Approx stat={a.save} />
            </span>
          </button>
        ))}
      </div>

      <div className="section-title">
        <h2 className="section-title-text">Навыки</h2>
        {proficientSkills.length > 0 && proficientSkills.length < sheet.skills.length && (
          <BrushButton variant="link" className="section-link" onClick={() => setAllSkills((v) => !v)}>
            {allSkills ? 'Только владение' : `Все ${sheet.skills.length}`}
          </BrushButton>
        )}
      </div>
      <div className="card list">
        {skills.map((s) => (
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
    </>
  )
}
