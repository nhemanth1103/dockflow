import { supabase } from '../supabase/client'
import {
  getRetryableEvents,
  markEventAttempt,
  markEventFailed,
  markEventSynced,
} from './outbox'
import { db } from './index'

export async function syncPendingEvents() {
  if (!navigator.onLine) {
    return
  }

  const events = await getRetryableEvents()

  for (const event of events) {
    try {
      await markEventAttempt(event.event_id)

      switch (event.event_type) {
        case 'RESERVATION_CREATED': {
          await syncReservationCreated(event)
          break
        }

        case 'PICKUP_CONFIRMED_BY_CAPTAIN': {
          await syncPickupConfirmed(event)
          break
        }

        case 'RETURN_CONFIRMED_BY_CAPTAIN': {
          await syncReturnConfirmed(event)
          break
        }

        default: {
          throw new Error(
            `Unsupported offline event: ${event.event_type}`,
          )
        }
      }

      await markEventSynced(event.event_id)
    } catch (error) {
      console.error(
        `Sync failed for ${event.event_type}:`,
        error,
      )

      await markEventFailed(
        event.event_id,
        error instanceof Error
          ? error.message
          : 'Unknown synchronization error',
      )
    }
  }
}

async function syncReservationCreated(
  event: Awaited<ReturnType<typeof getRetryableEvents>>[number],
) {
  const payload = event.payload

  const boatId = payload.boat_id

  const depotId = payload.depot_id

  const iceQuantity = payload.ice_quantity

  const crateQuantity = payload.crate_quantity

  if (
    typeof boatId !== 'string' ||
    typeof depotId !== 'string' ||
    typeof iceQuantity !== 'number' ||
    typeof crateQuantity !== 'number'
  ) {
    throw new Error(
      'Invalid RESERVATION_CREATED payload',
    )
  }

  const localReservation =
    await db.reservations.get(event.entity_id)

  if (!localReservation) {
    throw new Error(
      `Local reservation ${event.entity_id} not found`,
    )
  }

  /*
   * If this local reservation has already been mapped
   * to a server reservation, do not create it again.
   */
  if (localReservation.server_id) {
    await db.reservations.update(event.entity_id, {
      sync_status: 'SYNCED',
      updated_at: new Date().toISOString(),
    })

    return
  }

  const { data, error } = await supabase.rpc(
    'create_reservation',
    {
      p_boat_id: boatId,
      p_depot_id: depotId,
      p_ice_quantity: iceQuantity,
      p_crate_quantity: crateQuantity,
    },
  )

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'create_reservation returned no reservation ID',
    )
  }

  await db.reservations.update(event.entity_id, {
    server_id: data,
    sync_status: 'SYNCED',
    updated_at: new Date().toISOString(),
  })
}

async function syncPickupConfirmed(
  event: Awaited<ReturnType<typeof getRetryableEvents>>[number],
) {
  const localReservation =
    await db.reservations.get(event.entity_id)

  if (!localReservation) {
    throw new Error(
      `Local reservation ${event.entity_id} not found`,
    )
  }

  if (!localReservation.server_id) {
    throw new Error(
      'Cannot sync pickup before reservation is synced',
    )
  }

  const { error } = await supabase.rpc(
    'confirm_pickup_captain',
    {
      p_reservation_id:
        localReservation.server_id,
    },
  )

  if (error) {
    throw error
  }
}

async function syncReturnConfirmed(
  event: Awaited<ReturnType<typeof getRetryableEvents>>[number],
) {
  const localReservation =
    await db.reservations.get(event.entity_id)

  if (!localReservation) {
    throw new Error(
      `Local reservation ${event.entity_id} not found`,
    )
  }

  if (!localReservation.server_id) {
    throw new Error(
      'Cannot sync return before reservation is synced',
    )
  }

  const { error } = await supabase.rpc(
    'confirm_return_captain',
    {
      p_reservation_id:
        localReservation.server_id,
    },
  )

  if (error) {
    throw error
  }
}