-- ============================================================
-- DockFlow - Pickup Confirmation
-- Migration: 004_pickup_confirmation
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_pickup_captain(
  p_reservation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff_id UUID;
  v_reservation_status reservation_status;
BEGIN

  -- Lock the reservation
  SELECT status
  INTO v_reservation_status
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  -- Pickup can only be confirmed for an active reservation
  IF v_reservation_status <> 'ACTIVE'::reservation_status THEN
    RAISE EXCEPTION 'Reservation is not ready for pickup';
  END IF;

  -- Find the pickup handoff
  SELECT id
  INTO v_handoff_id
  FROM handoffs
  WHERE reservation_id = p_reservation_id
    AND type = 'PICKUP'::handoff_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pickup handoff not found';
  END IF;

  -- Prevent duplicate confirmation
  UPDATE handoffs
  SET
    captain_confirmed_at = COALESCE(
      captain_confirmed_at,
      NOW()
    ),
    status = CASE
      WHEN depot_confirmed_at IS NOT NULL
        THEN 'COMPLETED'::handoff_status
      ELSE 'CAPTAIN_CONFIRMED'::handoff_status
    END
  WHERE id = v_handoff_id;

  -- If depot had already confirmed, complete pickup
  IF EXISTS (
    SELECT 1
    FROM handoffs
    WHERE id = v_handoff_id
      AND depot_confirmed_at IS NOT NULL
  ) THEN

    UPDATE reservations
    SET status = 'IN_USE'::reservation_status
    WHERE id = p_reservation_id;

    UPDATE crate_sets
    SET status = 'IN_USE'::crate_status
    WHERE id IN (
      SELECT crate_id
      FROM reservation_crates
      WHERE reservation_id = p_reservation_id
        AND released_at IS NULL
    );

  END IF;

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
    p_reservation_id,
    'PICKUP_CONFIRMED_BY_CAPTAIN',
    NULL,
    jsonb_build_object(
      'handoff_id', v_handoff_id
    )
  );

END;
$$;


-- ============================================================
-- Depot confirmation
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_pickup_depot(
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
BEGIN

  -- Lock pickup handoff
  SELECT
    id,
    captain_confirmed_at IS NOT NULL
  INTO
    v_handoff_id,
    v_captain_confirmed
  FROM handoffs
  WHERE reservation_id = p_reservation_id
    AND type = 'PICKUP'::handoff_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pickup handoff not found';
  END IF;

  -- Depot should not confirm before captain
  IF NOT v_captain_confirmed THEN
    RAISE EXCEPTION 'Captain must confirm pickup first';
  END IF;

  -- Record depot confirmation
  UPDATE handoffs
  SET
    depot_confirmed_at = COALESCE(
      depot_confirmed_at,
      NOW()
    ),
    status = 'COMPLETED'::handoff_status
  WHERE id = v_handoff_id;

  -- Reservation is now in use
  UPDATE reservations
  SET status = 'IN_USE'::reservation_status
  WHERE id = p_reservation_id;

  -- Crates are now physically with the boat
  UPDATE crate_sets
  SET status = 'IN_USE'::crate_status
  WHERE id IN (
    SELECT crate_id
    FROM reservation_crates
    WHERE reservation_id = p_reservation_id
      AND released_at IS NULL
  );

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
    p_reservation_id,
    'PICKUP_COMPLETED',
    NULL,
    jsonb_build_object(
      'handoff_id', v_handoff_id
    )
  );

END;
$$;