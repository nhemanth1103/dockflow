CREATE OR REPLACE FUNCTION mark_overdue_crates()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN

  UPDATE crate_sets
  SET
    status = 'OVERDUE',
    updated_at = NOW()
  WHERE status = 'IN_USE'
    AND id IN (
      SELECT rc.crate_id
      FROM reservation_crates rc
      JOIN reservations r
        ON r.id = rc.reservation_id
      WHERE r.status = 'IN_USE'
        AND r.return_deadline < NOW()
        AND rc.released_at IS NULL
    );

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  RETURN affected_count;

END;
$$;