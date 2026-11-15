import type { JsonObject } from './read'

export type SnapshotMeta = {
  foundryVersion: string | null
  systemVersion: string | null
  actorId: string | null
  exportedAt: string | null
}

/**
 * One character snapshot. `source` is the actor as Foundry stores it
 * (`actor.toObject()` / Export Data). `computed` holds values Foundry
 * derived at export time; it is null for a plain Export Data file.
 */
export type Snapshot = {
  schemaVersion: 1
  meta: SnapshotMeta
  source: JsonObject
  computed: JsonObject | null
  portrait: string | null
}

export const SUPPORTED = { foundryVersion: '14.370', systemVersion: '6.1.0' } as const
