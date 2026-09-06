-- DockFlow authentication and role-based access.
-- Create Auth users in Supabase first, then add one matching profile row.

DO $$
BEGIN
  CREATE TYPE profile_role AS ENUM ('CAPTAIN', 'DEPOT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role profile_role NOT NULL,
  boat_id UUID REFERENCES boats(id),
  depot_id UUID REFERENCES depots(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_assignment_matches_role CHECK (
    (role = 'CAPTAIN' AND boat_id IS NOT NULL AND depot_id IS NULL) OR
    (role = 'DEPOT' AND depot_id IS NOT NULL AND boat_id IS NULL)
  )
);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE depots ENABLE ROW LEVEL SECURITY;
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crate_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_ice ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- These helpers are deliberately SECURITY DEFINER so policies can safely read
-- the caller's profile without recursive RLS checks.
CREATE OR REPLACE FUNCTION current_profile_role()
RETURNS profile_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION is_captain_for(p_boat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'CAPTAIN' AND boat_id = p_boat_id
  )
$$;

CREATE OR REPLACE FUNCTION is_depot_for(p_depot_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'DEPOT' AND depot_id = p_depot_id
  )
$$;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "depots_select_for_operations" ON depots;
CREATE POLICY "depots_select_for_operations" ON depots
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "boats_select_assigned_or_depot_reservation" ON boats;
CREATE POLICY "boats_select_assigned_or_depot_reservation" ON boats
FOR SELECT TO authenticated USING (
  is_captain_for(id) OR EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.boat_id = boats.id AND is_depot_for(r.depot_id)
  )
);

DROP POLICY IF EXISTS "reservations_select_assigned" ON reservations;
CREATE POLICY "reservations_select_assigned" ON reservations
FOR SELECT TO authenticated USING (
  is_captain_for(boat_id) OR is_depot_for(depot_id)
);

-- Captains may read live availability to create reservations; depot users may
-- read only inventory at their assigned depot. No direct inventory writes.
DROP POLICY IF EXISTS "crates_select_for_operations" ON crate_sets;
CREATE POLICY "crates_select_for_operations" ON crate_sets
FOR SELECT TO authenticated USING (
  current_profile_role() = 'CAPTAIN' OR is_depot_for(depot_id)
);

DROP POLICY IF EXISTS "ice_select_for_operations" ON ice_batches;
CREATE POLICY "ice_select_for_operations" ON ice_batches
FOR SELECT TO authenticated USING (
  current_profile_role() = 'CAPTAIN' OR is_depot_for(depot_id)
);

DROP POLICY IF EXISTS "reservation_crates_select_assigned" ON reservation_crates;
CREATE POLICY "reservation_crates_select_assigned" ON reservation_crates
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = reservation_crates.reservation_id
      AND (is_captain_for(r.boat_id) OR is_depot_for(r.depot_id))
  )
);

DROP POLICY IF EXISTS "reservation_ice_select_assigned" ON reservation_ice;
CREATE POLICY "reservation_ice_select_assigned" ON reservation_ice
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = reservation_ice.reservation_id
      AND (is_captain_for(r.boat_id) OR is_depot_for(r.depot_id))
  )
);

DROP POLICY IF EXISTS "handoffs_select_assigned" ON handoffs;
CREATE POLICY "handoffs_select_assigned" ON handoffs
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = handoffs.reservation_id
      AND (is_captain_for(r.boat_id) OR is_depot_for(r.depot_id))
  )
);

DROP POLICY IF EXISTS "events_insert_authenticated" ON events;
CREATE POLICY "events_insert_authenticated" ON events
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "events_select_assigned" ON events;
CREATE POLICY "events_select_assigned" ON events
FOR SELECT TO authenticated USING (
  entity_type <> 'reservation' OR EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = events.entity_id
      AND (is_captain_for(r.boat_id) OR is_depot_for(r.depot_id))
  )
);

-- Preserve the established workflow implementations behind private names, then
-- expose the same RPC names with role/assignment checks in front of them.
ALTER FUNCTION create_reservation(UUID, UUID, INTEGER, INTEGER) RENAME TO internal_create_reservation;
ALTER FUNCTION confirm_pickup_captain(UUID) RENAME TO internal_confirm_pickup_captain;
ALTER FUNCTION confirm_pickup_depot(UUID) RENAME TO internal_confirm_pickup_depot;
ALTER FUNCTION confirm_return_captain(UUID) RENAME TO internal_confirm_return_captain;
ALTER FUNCTION confirm_return_depot(UUID) RENAME TO internal_confirm_return_depot;
ALTER FUNCTION set_pickup_crate_condition(UUID, UUID, crate_condition) RENAME TO internal_set_pickup_crate_condition;
ALTER FUNCTION set_return_crate_condition(UUID, UUID, crate_condition) RENAME TO internal_set_return_crate_condition;
ALTER FUNCTION mark_crate_missing(UUID, UUID) RENAME TO internal_mark_crate_missing;

CREATE OR REPLACE FUNCTION assert_captain_reservation(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = p_reservation_id AND is_captain_for(boat_id)) THEN
    RAISE EXCEPTION 'You are not assigned to this reservation';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION assert_depot_reservation(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = p_reservation_id AND is_depot_for(depot_id)) THEN
    RAISE EXCEPTION 'You are not assigned to this reservation';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION create_reservation(p_boat_id UUID, p_depot_id UUID, p_ice_quantity INTEGER, p_crate_quantity INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_captain_for(p_boat_id) THEN RAISE EXCEPTION 'You are not assigned to this boat'; END IF;
  RETURN internal_create_reservation(p_boat_id, p_depot_id, p_ice_quantity, p_crate_quantity);
END; $$;

CREATE OR REPLACE FUNCTION confirm_pickup_captain(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_captain_reservation(p_reservation_id); PERFORM internal_confirm_pickup_captain(p_reservation_id); END; $$;

CREATE OR REPLACE FUNCTION confirm_pickup_depot(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_depot_reservation(p_reservation_id); PERFORM internal_confirm_pickup_depot(p_reservation_id); END; $$;

CREATE OR REPLACE FUNCTION confirm_return_captain(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_captain_reservation(p_reservation_id); PERFORM internal_confirm_return_captain(p_reservation_id); END; $$;

CREATE OR REPLACE FUNCTION confirm_return_depot(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_depot_reservation(p_reservation_id); PERFORM internal_confirm_return_depot(p_reservation_id); END; $$;

CREATE OR REPLACE FUNCTION set_pickup_crate_condition(p_reservation_id UUID, p_crate_id UUID, p_condition crate_condition)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_depot_reservation(p_reservation_id); PERFORM internal_set_pickup_crate_condition(p_reservation_id, p_crate_id, p_condition); END; $$;

CREATE OR REPLACE FUNCTION set_return_crate_condition(p_reservation_id UUID, p_crate_id UUID, p_condition crate_condition)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_depot_reservation(p_reservation_id); PERFORM internal_set_return_crate_condition(p_reservation_id, p_crate_id, p_condition); END; $$;

CREATE OR REPLACE FUNCTION mark_crate_missing(p_reservation_id UUID, p_crate_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM assert_depot_reservation(p_reservation_id); PERFORM internal_mark_crate_missing(p_reservation_id, p_crate_id); END; $$;

REVOKE ALL ON FUNCTION internal_create_reservation(UUID, UUID, INTEGER, INTEGER), internal_confirm_pickup_captain(UUID), internal_confirm_pickup_depot(UUID), internal_confirm_return_captain(UUID), internal_confirm_return_depot(UUID), internal_set_pickup_crate_condition(UUID, UUID, crate_condition), internal_set_return_crate_condition(UUID, UUID, crate_condition), internal_mark_crate_missing(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_reservation(UUID, UUID, INTEGER, INTEGER), confirm_pickup_captain(UUID), confirm_pickup_depot(UUID), confirm_return_captain(UUID), confirm_return_depot(UUID), set_pickup_crate_condition(UUID, UUID, crate_condition), set_return_crate_condition(UUID, UUID, crate_condition), mark_crate_missing(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_reservation(UUID, UUID, INTEGER, INTEGER), confirm_pickup_captain(UUID), confirm_pickup_depot(UUID), confirm_return_captain(UUID), confirm_return_depot(UUID), set_pickup_crate_condition(UUID, UUID, crate_condition), set_return_crate_condition(UUID, UUID, crate_condition), mark_crate_missing(UUID, UUID) TO authenticated;
