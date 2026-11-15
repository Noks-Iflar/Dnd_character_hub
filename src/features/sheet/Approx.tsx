import type { Stat } from '../../lib/snapshot/sheet'

/** "≈" mark for values estimated by the app instead of Foundry. */
export function Approx({ stat }: { stat: Stat }) {
  if (stat.from !== 'estimate' || stat.value === null) return null
  return (
    <span className="approx" title="Может быть неточно: посчитано приложением, Foundry пересчитает" aria-label="может быть неточно">
      ≈
    </span>
  )
}
