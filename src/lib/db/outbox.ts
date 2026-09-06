import { db, type LocalEvent } from './index'

export async function addPendingEvent(
  event: Omit<
    LocalEvent,
    'sync_status' | 'retry_count' | 'last_attempt_at' | 'error_message'
  >,
) {
  await db.events.put({
    ...event,
    sync_status: 'PENDING',
    retry_count: 0,
  })
}

export async function getPendingEvents() {
  return db.events
    .where('sync_status')
    .equals('PENDING')
    .sortBy('created_at')
}

export async function getFailedEvents() {
  return db.events
    .where('sync_status')
    .equals('FAILED')
    .sortBy('created_at')
}

export async function getRetryableEvents() {
  const [pending, failed] = await Promise.all([
    getPendingEvents(),
    getFailedEvents(),
  ])

  return [...pending, ...failed].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )
}

export async function markEventAttempt(eventId: string) {
  const event = await db.events.get(eventId)

  if (!event) {
    return
  }

  await db.events.update(eventId, {
    retry_count: (event.retry_count ?? 0) + 1,
    last_attempt_at: new Date().toISOString(),
  })
}

export async function markEventSynced(eventId: string) {
  await db.events.update(eventId, {
    sync_status: 'SYNCED',
    error_message: undefined,
  })
}

export async function markEventFailed(
  eventId: string,
  errorMessage?: string,
) {
  await db.events.update(eventId, {
    sync_status: 'FAILED',
    error_message: errorMessage,
  })
}

export async function resetFailedEvents() {
  await db.events
    .where('sync_status')
    .equals('FAILED')
    .modify({
      sync_status: 'PENDING',
      error_message: undefined,
    })
}