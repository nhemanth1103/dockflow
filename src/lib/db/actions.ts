import { addPendingEvent } from './outbox'

function createEventId() {
  return crypto.randomUUID()
}

export async function queueAction(
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown> = {},
  actorId: string | null = null,
) {
  await addPendingEvent({
    event_id: createEventId(),
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    actor_id: actorId,
    payload,
    created_at: new Date().toISOString(),
  })
}