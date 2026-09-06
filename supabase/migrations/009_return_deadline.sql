CREATE OR REPLACE FUNCTION set_return_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'IN_USE'
     AND OLD.status IS DISTINCT FROM 'IN_USE'
  THEN
    NEW.return_deadline = NOW() + INTERVAL '24 hours';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservation_return_deadline
ON reservations;

CREATE TRIGGER reservation_return_deadline
BEFORE UPDATE OF status ON reservations
FOR EACH ROW
EXECUTE FUNCTION set_return_deadline();