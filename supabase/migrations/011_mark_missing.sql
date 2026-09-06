CREATE OR REPLACE FUNCTION mark_crate_missing(
  p_reservation_id UUID,
  p_crate_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN

  UPDATE crate_sets
  SET
    status = 'MISSING',
    updated_at = NOW()
  WHERE id = p_crate_id;

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
    'crate',
    p_crate_id,
    'CRATE_MARKED_MISSING',
    NULL,
    jsonb_build_object(
      'reservation_id', p_reservation_id
    )
  );

END;
$$;