import { useState, type ReactNode } from 'react'
import { roll } from '../../lib/dice/dice'
import type { Sheet, SheetAttack, SheetResource } from '../../lib/snapshot/sheet'
import { useWide } from '../../lib/use-wide'
import { d20 } from './format'
import { RollToast, type ShownRoll } from './RollToast'
import type { NotesBinding } from './NotesEditor'
import type { RollMode, SheetEdit, TabProps } from './sheet-ui'
import { CombatTab } from './tabs/CombatTab'
import { GearTab } from './tabs/GearTab'
import { MagicTab } from './tabs/MagicTab'
import { MainTab } from './tabs/MainTab'
import { NotesTab } from './tabs/NotesTab'

export type { SheetEdit } from './sheet-ui'

type TabId = 'main' | 'combat' | 'magic' | 'gear' | 'notes'

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true } as const

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: 'main',
    label: 'Лист',
    icon: (
      <svg {...ICON}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    id: 'combat',
    label: 'Бой',
    icon: (
      <svg {...ICON}>
        <path d="M4 20 16 8M14 4h6v6M6 14l4 4M3 21l2-2" />
      </svg>
    ),
  },
  {
    id: 'magic',
    label: 'Магия',
    icon: (
      <svg {...ICON}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    ),
  },
  {
    id: 'gear',
    label: 'Вещи',
    icon: (
      <svg {...ICON}>
        <path d="M5 8h14l-1 12H6z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  {
    id: 'notes',
    label: 'Заметки',
    icon: (
      <svg {...ICON}>
        <path d="M4 20h4L19 9l-4-4L4 16z" />
        <path d="M13 7l4 4" />
      </svg>
    ),
  },
]

const MODE_SUFFIX: Record<RollMode, string> = { normal: '', adv: ' (преимущество)', dis: ' (помеха)' }

/** Character sheet with tabs and a bottom menu. With `edit`, allowed fields can be changed. */
export function SheetView({ sheet, edit, notes }: { sheet: Sheet; edit?: SheetEdit; notes?: NotesBinding }) {
  const [tab, setTab] = useState<TabId>('main')
  const [mode, setMode] = useState<RollMode>('normal')
  const [shown, setShown] = useState<ShownRoll | null>(null)
  const wide = useWide()

  const props: TabProps = {
    sheet,
    edit,
    rollD20(label, mod) {
      if (mod === null) return
      const result = roll(d20(mod, mode))
      if (result) setShown({ label: label + MODE_SUFFIX[mode], result })
    },
    rollDamage(a: SheetAttack) {
      const result = roll(a.damages.map((d) => d.formula).join(' + '))
      if (result) setShown({ label: `${a.name}: урон`, result })
    },
    setResource(r: SheetResource, remaining: number) {
      if (!edit) return
      const stored = (v: number) => (r.stores === 'spent' ? r.max - v : v)
      edit.set(r.path, stored(r.value), stored(remaining))
    },
  }

  function open(id: TabId) {
    setTab(id)
    window.scrollTo({ top: 0 })
  }

  const other = (id: TabId) => (
    <>
      {id === 'combat' && <CombatTab {...props} mode={mode} onMode={setMode} />}
      {id === 'magic' && <MagicTab {...props} />}
      {id === 'gear' && <GearTab {...props} />}
      {id === 'notes' && <NotesTab {...props} notes={notes} />}
    </>
  )

  if (wide) {
    // Desktop: "Лист" always on the left, the chosen tab on the right, tabs on top instead of the bottom menu
    const right: TabId = tab === 'main' ? 'combat' : tab
    return (
      <div className="sheet-wide">
        <section className="sheet-pane" aria-label="Лист">
          <MainTab {...props} />
        </section>
        <section className="sheet-pane">
          <nav className="sheet-tabs" aria-label="Разделы листа">
            {TABS.filter((t) => t.id !== 'main').map((t) => (
              <button key={t.id} type="button" aria-current={right === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
          {other(right)}
        </section>
        <RollToast roll={shown} onClose={() => setShown(null)} />
      </div>
    )
  }

  return (
    <>
      {tab === 'main' && <MainTab {...props} />}
      {tab === 'combat' && <CombatTab {...props} mode={mode} onMode={setMode} />}
      {tab === 'magic' && <MagicTab {...props} />}
      {tab === 'gear' && <GearTab {...props} />}
      {tab === 'notes' && <NotesTab {...props} notes={notes} />}

      <div className="bottom-nav-spacer" aria-hidden="true" />
      <RollToast roll={shown} onClose={() => setShown(null)} />
      <nav className="bottom-nav" aria-label="Разделы листа">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => open(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </>
  )
}
