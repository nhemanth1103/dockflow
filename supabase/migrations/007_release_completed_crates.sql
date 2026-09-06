-- Release crate allocations when a return is completed.
-- This allows the same physical crate set to be reserved again.

CREATE OR REPLACE FUNCTION confirm_return_depot(
  p_reservation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff_id UUID;
  v_captain_confirmed BOOLEAN;
  v_missing_condition BOOLEAN;
BEGIN

  SELECT
    id,
    captain_confirmed_at IS NOT NULL
  INTO
    v_handoff_id,
    v_captain_confirmed
  FROM handoffs
  WHERE reservation_id = p_reservation_id
    AND type = 'RETURN'::handoff_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return handoff not found';
  END IF;

  IF NOT v_captain_confirmed THEN
    RAISE EXCEPTION 'Captain must confirm return first';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM reservation_crates
    WHERE reservation_id = p_reservation_id
      AND released_at IS NULL
      AND return_condition IS NULL
  )
  INTO v_missing_condition;

  IF v_missing_condition THEN
    RAISE EXCEPTION 'Depot must inspect every returned crate';
  END IF;

  UPDATE handoffs
  SET
    depot_confirmed_at = COALESCE(
      depot_confirmed_at,
      NOW()
    ),
    status = 'COMPLETED'::handoff_status
  WHERE id = v_handoff_id;

  UPDATE crate_sets cs
  SET
    status = CASE
      WHEN rc.return_condition = 'DAMAGED'::crate_condition
        THEN 'DAMAGED'::crate_status
      ELSE 'AVAILABLE'::crate_status
    END,
    condition = rc.return_condition
  FROM reservation_crates rc
  WHERE rc.reservation_id = p_reservation_id
    AND rc.crate_id = cs.id
    AND rc.released_at IS NULL;

  -- Release the reservation's crate allocation.
  UPDATE reservation_crates
  SET released_at = NOW()
  WHERE reservation_id = p_reservation_id
    AND released_at IS NULL;

  UPDATE reservations
  SET status = 'COMPLETED'::reservation_status
  WHERE id = p_reservation_id;

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
    p_reservation_id,
    'RETURN_COMPLETED',
    NULL,
    jsonb_build_object(
      'handoff_id', v_handoff_id
    )
  );

END;
$$;


-- Release the crate allocation from the reservation
-- we already completed during testing.
UPDATE reservation_crates
SET released_at = NOW()
WHERE reservation_id = 'b738c970-6d46-4e1a-8ca5-7ff0d9d8108c'
  AND released_at IS NULL;