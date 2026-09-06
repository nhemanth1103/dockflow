CREATE OR REPLACE FUNCTION expire_overdue_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  affected_count INTEGER := 0;
BEGIN

  FOR r IN
    SELECT id
    FROM reservations
    WHERE status IN ('ACTIVE', 'PICKUP_PENDING')
      AND pickup_deadline < NOW()
    FOR UPDATE
  LOOP

    -- Expire reservation
    UPDATE reservations
    SET
      status = 'EXPIRED',
      updated_at = NOW()
    WHERE id = r.id;

    -- Release crates
    UPDATE crate_sets
    SET
      status = 'AVAILABLE',
      updated_at = NOW()
    WHERE id IN (
      SELECT crate_id
      FROM reservation_crates
      WHERE reservation_id = r.id
        AND released_at IS NULL
    );

    -- Release crate allocation records
    UPDATE reservation_crates
    SET released_at = NOW()
    WHERE reservation_id = r.id
      AND released_at IS NULL;

    -- Release reserved ice
    UPDATE ice_batches ib
    SET
      quantity_reserved = GREATEST(
        0,
        ib.quantity_reserved - ri.quantity
      )
    FROM reservation_ice ri
    WHERE ri.reservation_id = r.id
      AND ri.ice_batch_id = ib.id;

    -- Audit event
    INSERT INTO events (
      event_id,
      entity_type,
      entity_id,
      event_type,
      actor_id,
      payload
    )
    VALUES (
      gen_random_uuid(),
      'reservation',
      r.id,
      'RESERVATION_EXPIRED',
      NULL,
      jsonb_build_object(
        'reason', 'pickup_deadline_passed'
      )
    );

    affected_count := affected_count + 1;

  END LOOP;

  RETURN affected_count;
END;
$$;