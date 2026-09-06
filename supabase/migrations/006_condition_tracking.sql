-- 1. Store the condition recorded at each handoff
ALTER TABLE reservation_crates
ADD COLUMN IF NOT EXISTS pickup_condition crate_condition;

ALTER TABLE reservation_crates
ADD COLUMN IF NOT EXISTS return_condition crate_condition;


-- 2. Depot records the condition of crates BEFORE pickup
CREATE OR REPLACE FUNCTION set_pickup_crate_condition(
  p_reservation_id UUID,
  p_crate_id UUID,
  p_condition crate_condition
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM reservations
  WHERE id = p_reservation_id
    AND status IN (
      'ACTIVE'::reservation_status,
      'PICKUP_PENDING'::reservation_status
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation is not available for pickup inspection';
  END IF;

  UPDATE reservation_crates
  SET pickup_condition = p_condition
  WHERE reservation_id = p_reservation_id
    AND crate_id = p_crate_id
    AND released_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crate is not assigned to this reservation';
  END IF;
END;
$$;


-- 3. Depot records the condition AFTER the captain returns the crate
CREATE OR REPLACE FUNCTION set_return_crate_condition(
  p_reservation_id UUID,
  p_crate_id UUID,
  p_condition crate_condition
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM reservations
  WHERE id = p_reservation_id
    AND status = 'RETURN_PENDING'::reservation_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation is not waiting for return inspection';
  END IF;

  UPDATE reservation_crates
  SET return_condition = p_condition
  WHERE reservation_id = p_reservation_id
    AND crate_id = p_crate_id
    AND released_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crate is not assigned to this reservation';
  END IF;
END;
$$;


-- 4. Captain only declares that the crates were returned.
--    Captain NO LONGER declares the condition.
CREATE OR REPLACE FUNCTION confirm_return_captain(
  p_reservation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff_id UUID;
BEGIN
  PERFORM 1
  FROM reservations
  WHERE id = p_reservation_id
    AND status = 'IN_USE'::reservation_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation is not in use';
  END IF;

  SELECT id
  INTO v_handoff_id
  FROM handoffs
  WHERE reservation_id = p_reservation_id
    AND type = 'RETURN'::handoff_type
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'Return already started';
  END IF;

  INSERT INTO handoffs (
    reservation_id,
    type,
    status,
    captain_confirmed_at
  )
  VALUES (
    p_reservation_id,
    'RETURN'::handoff_type,
    'CAPTAIN_CONFIRMED'::handoff_status,
    NOW()
  )
  RETURNING id INTO v_handoff_id;

  UPDATE reservations
  SET status = 'RETURN_PENDING'::reservation_status
  WHERE id = p_reservation_id;

  UPDATE crate_sets
  SET status = 'RETURN_PENDING'::crate_status
  WHERE id IN (
    SELECT crate_id
    FROM reservation_crates
    WHERE reservation_id = p_reservation_id
      AND released_at IS NULL
  );

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
    'RETURN_CONFIRMED_BY_CAPTAIN',
    NULL,
    jsonb_build_object(
      'handoff_id', v_handoff_id
    )
  );
END;
$$;