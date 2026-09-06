import Dexie, { type Table } from 'dexie'

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export type LocalEvent = {
  event_id: string
  entity_type: string
  entity_id: string
  event_type: string
  actor_id: string | null
  payload: Record<string, unknown>
  created_at: string
  sync_status: SyncStatus
  retry_count?: number
  last_attempt_at?: string
  error_message?: string
}

export type LocalReservation = {
  id: string
  server_id?: string
  boat_id: string
  depot_id: string
  status: string
  ice_quantity: number
  crate_quantity: number
  created_at: string
  updated_at: string
  sync_status: SyncStatus
}

export type LocalReservationCrate = {
  id: string
  reservation_id: string
  crate_id: string
  crate_code: string
  pickup_condition?: string
  return_condition?: string
  status: string
  updated_at: string
}

export type LocalCrate = {
  id: string
  crate_code: string
  depot_id: string
  status: string
  condition: string
  updated_at: string
}

export type LocalDepot = {
  id: string
  name: string
  location: string
  pickup_spot: string
  pickup_window_start: string
  pickup_window_end: string
}

export type LocalBoat = {
  id: string
  boat_code: string
  boat_name: string
  captain_name: string
}

class DockFlowDB extends Dexie {
  events!: Table<LocalEvent, string>
  reservations!: Table<LocalReservation, string>
  reservationCrates!: Table<LocalReservationCrate, string>
  crates!: Table<LocalCrate, string>
  depots!: Table<LocalDepot, string>
  boats!: Table<LocalBoat, string>

  constructor() {
    super('dockflow')

    // Existing schema
    this.version(1).stores({
      events: 'event_id, sync_status, created_at',
      reservations: 'id, status, boat_id, depot_id',
      crates: 'id, crate_code, depot_id, status',
    })

    // Offline-first schema
    this.version(2).stores({
      events: 'event_id, sync_status, created_at, event_type, entity_id',
      reservations: 'id, status, boat_id, depot_id, sync_status, updated_at',
      reservationCrates:
        'id, reservation_id, crate_id, crate_code, status, updated_at',
      crates: 'id, crate_code, depot_id, status, condition, updated_at',
      depots: 'id, name',
      boats: 'id, boat_code',
    })
  }
}

export const db = new DockFlowDB()
