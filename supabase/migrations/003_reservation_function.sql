-- ============================================================
-- DockFlow - Reservation Function
-- Migration: 003_reservation_function
-- ============================================================

CREATE OR REPLACE FUNCTION create_reservation(
  p_boat_id UUID,
  p_depot_id UUID,
  p_ice_quantity INTEGER,
  p_crate_quantity INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID;
  v_ice_batch_id UUID;
  v_available_ice INTEGER;
  v_pickup_deadline TIMESTAMPTZ;
  v_pickup_start TIME;
  v_pickup_end TIME;
  v_crate_count INTEGER;
BEGIN

  -- Validate quantities
  IF p_ice_quantity < 0 THEN
    RAISE EXCEPTION 'Ice quantity cannot be negative';
  END IF;

  IF p_crate_quantity < 1 THEN
    RAISE EXCEPTION 'At least one crate set is required';
  END IF;


  -- Make sure the depot exists and lock its row
  SELECT
    pickup_window_start,
    pickup_window_end
  INTO
    v_pickup_start,
    v_pickup_end
  FROM depots
  WHERE id = p_depot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Depot not found';
  END IF;


  -- Find and lock an ice batch with enough available ice
  IF p_ice_quantity > 0 THEN

    SELECT
      id,
      quantity_total - quantity_reserved - quantity_consumed
    INTO
      v_ice_batch_id,
      v_available_ice
    FROM ice_batches
    WHERE depot_id = p_depot_id
      AND status IN ('AVAILABLE', 'EXPIRING_SOON')
      AND quantity_total - quantity_reserved - quantity_consumed >= p_ice_quantity
      AND melt_cutoff > NOW()
    ORDER BY melt_cutoff ASC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not enough ice available';
    END IF;

  END IF;


  -- Lock available crate sets for this reservation
  SELECT COUNT(*)
  INTO v_crate_count
  FROM crate_sets
  WHERE depot_id = p_depot_id
    AND status = 'AVAILABLE'
    AND condition = 'GOOD';

  IF v_crate_count < p_crate_quantity THEN
    RAISE EXCEPTION 'Not enough crate sets available';
  END IF;


  -- Calculate pickup deadline using today's depot pickup window.
  -- If today's window has already passed, use tomorrow.
  v_pickup_deadline :=
    CASE
      WHEN CURRENT_TIME < v_pickup_end
      THEN CURRENT_DATE + v_pickup_end
      ELSE CURRENT_DATE + INTERVAL '1 day' + v_pickup_end
    END;


  -- Create reservation
  INSERT INTO reservations (
    boat_id,
    depot_id,
    ice_quantity,
    status,
    pickup_window_start,
    pickup_window_end,
    pickup_deadline
  )
  VALUES (
    p_boat_id,
    p_depot_id,
    p_ice_quantity,
    'ACTIVE',
    v_pickup_start,
    v_pickup_end,
    v_pickup_deadline
  )
  RETURNING id INTO v_reservation_id;


  -- Allocate exact crate sets
  INSERT INTO reservation_crates (
    reservation_id,
    crate_id
  )
  SELECT
    v_reservation_id,
    id
  FROM crate_sets
  WHERE depot_id = p_depot_id
    AND status = 'AVAILABLE'
    AND condition = 'GOOD'
  ORDER BY crate_code
  LIMIT p_crate_quantity;


  -- Mark those crates as reserved
  UPDATE crate_sets
  SET status = 'RESERVED'
  WHERE id IN (
    SELECT crate_id
    FROM reservation_crates
    WHERE reservation_id = v_reservation_id
  );


  -- Reserve the requested ice
  IF p_ice_quantity > 0 THEN

    INSERT INTO reservation_ice (
      reservation_id,
      ice_batch_id,
      quantity
    )
    VALUES (
      v_reservation_id,
      v_ice_batch_id,
      p_ice_quantity
    );

    UPDATE ice_batches
    SET quantity_reserved = quantity_reserved + p_ice_quantity
    WHERE id = v_ice_batch_id;

  END IF;


  -- Create pickup handoff
  INSERT INTO handoffs (
    reservation_id,
    type,
    status
  )
  VALUES (
    v_reservation_id,
    'PICKUP',
    'PENDING'
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
    v_reservation_id,
    'RESERVATION_CREATED',
    p_boat_id::TEXT,
    jsonb_build_object(
      'ice_quantity', p_ice_quantity,
      'crate_quantity', p_crate_quantity,
      'depot_id', p_depot_id
    )
  );


  RETURN v_reservation_id;

END;
$$;