-- ============================================================
-- DockFlow - Initial Database Schema
-- Migration: 001_initial_schema
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE crate_status AS ENUM (
  'AVAILABLE',
  'RESERVED',
  'PICKUP_PENDING',
  'IN_USE',
  'RETURN_PENDING',
  'RETURNED',
  'OVERDUE',
  'MISSING',
  'DAMAGED',
  'DISPUTED'
);

CREATE TYPE crate_condition AS ENUM (
  'GOOD',
  'DAMAGED'
);

CREATE TYPE reservation_status AS ENUM (
  'ACTIVE',
  'CANCELLED',
  'EXPIRED',
  'PICKUP_PENDING',
  'IN_USE',
  'RETURN_PENDING',
  'COMPLETED',
  'DISPUTED'
);

CREATE TYPE handoff_type AS ENUM (
  'PICKUP',
  'RETURN'
);

CREATE TYPE handoff_status AS ENUM (
  'PENDING',
  'CAPTAIN_CONFIRMED',
  'COMPLETED',
  'DISPUTED'
);

CREATE TYPE ice_status AS ENUM (
  'AVAILABLE',
  'EXPIRING_SOON',
  'EXPIRED',
  'SPOILED_CLAIM',
  'REVIEW',
  'CONSUMED'
);

CREATE TYPE evidence_type AS ENUM (
  'DAMAGE_PHOTO',
  'SPOILED_ICE_PHOTO',
  'OTHER'
);


-- ============================================================
-- DEPOTS
-- ============================================================

CREATE TABLE depots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  location TEXT NOT NULL,
  pickup_spot TEXT NOT NULL,

  pickup_window_start TIME NOT NULL,
  pickup_window_end TIME NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_pickup_window
    CHECK (pickup_window_end > pickup_window_start)
);


-- ============================================================
-- BOATS
-- ============================================================

CREATE TABLE boats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  boat_code TEXT NOT NULL UNIQUE,
  boat_name TEXT NOT NULL,
  captain_name TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- CRATE SETS
-- One row = one independently trackable crate set
-- ============================================================

CREATE TABLE crate_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  crate_code TEXT NOT NULL UNIQUE,

  depot_id UUID NOT NULL
    REFERENCES depots(id),

  status crate_status NOT NULL DEFAULT 'AVAILABLE',

  condition crate_condition NOT NULL DEFAULT 'GOOD',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- ICE BATCHES
-- ============================================================

CREATE TABLE ice_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  depot_id UUID NOT NULL
    REFERENCES depots(id),

  quantity_total INTEGER NOT NULL
    CHECK (quantity_total > 0),

  quantity_reserved INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_reserved >= 0),

  quantity_consumed INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_consumed >= 0),

  unit TEXT NOT NULL DEFAULT 'BLOCK',

  melt_cutoff TIMESTAMPTZ NOT NULL,

  status ice_status NOT NULL DEFAULT 'AVAILABLE',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_ice_quantities
    CHECK (
      quantity_reserved + quantity_consumed <= quantity_total
    )
);


-- ============================================================
-- RESERVATIONS
-- One reservation = one boat + one depot
-- ============================================================

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  boat_id UUID NOT NULL
    REFERENCES boats(id),

  depot_id UUID NOT NULL
    REFERENCES depots(id),

  ice_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (ice_quantity >= 0),

  status reservation_status NOT NULL DEFAULT 'ACTIVE',

  pickup_window_start TIME NOT NULL,
  pickup_window_end TIME NOT NULL,
  pickup_deadline TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_reservation_window
    CHECK (pickup_window_end > pickup_window_start)
);


-- ============================================================
-- RESERVATION → CRATE SETS
--
-- released_at = NULL means the crate is currently allocated.
-- The unique partial index below prevents double allocation.
-- ============================================================

CREATE TABLE reservation_crates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reservation_id UUID NOT NULL
    REFERENCES reservations(id)
    ON DELETE CASCADE,

  crate_id UUID NOT NULL
    REFERENCES crate_sets(id),

  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  released_at TIMESTAMPTZ
);


CREATE UNIQUE INDEX one_active_allocation_per_crate
ON reservation_crates(crate_id)
WHERE released_at IS NULL;


-- ============================================================
-- RESERVATION → ICE BATCHES
--
-- Allows a reservation to consume ice from one or more batches.
-- ============================================================

CREATE TABLE reservation_ice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reservation_id UUID NOT NULL
    REFERENCES reservations(id)
    ON DELETE CASCADE,

  ice_batch_id UUID NOT NULL
    REFERENCES ice_batches(id),

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- HANDOFFS
-- Two-party confirmation for pickup and return.
-- ============================================================

CREATE TABLE handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reservation_id UUID NOT NULL
    REFERENCES reservations(id),

  type handoff_type NOT NULL,

  captain_confirmed_at TIMESTAMPTZ,
  depot_confirmed_at TIMESTAMPTZ,

  status handoff_status NOT NULL DEFAULT 'PENDING',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- EVIDENCE
-- Photos/notes only for exceptions.
-- ============================================================

CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  handoff_id UUID
    REFERENCES handoffs(id)
    ON DELETE CASCADE,

  type evidence_type NOT NULL,

  file_path TEXT,

  note TEXT,

  created_by TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- EVENTS
-- Immutable audit trail + offline synchronization.
-- ============================================================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id UUID NOT NULL UNIQUE,

  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  event_type TEXT NOT NULL,

  actor_id TEXT,
  device_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  payload JSONB NOT NULL DEFAULT '{}'::JSONB
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_crate_sets_depot
ON crate_sets(depot_id);

CREATE INDEX idx_crate_sets_status
ON crate_sets(status);

CREATE INDEX idx_ice_batches_depot
ON ice_batches(depot_id);

CREATE INDEX idx_ice_batches_status
ON ice_batches(status);

CREATE INDEX idx_reservations_boat
ON reservations(boat_id);

CREATE INDEX idx_reservations_depot
ON reservations(depot_id);

CREATE INDEX idx_reservations_status
ON reservations(status);

CREATE INDEX idx_reservation_crates_reservation
ON reservation_crates(reservation_id);

CREATE INDEX idx_reservation_ice_reservation
ON reservation_ice(reservation_id);

CREATE INDEX idx_handoffs_reservation
ON handoffs(reservation_id);

CREATE INDEX idx_events_entity
ON events(entity_type, entity_id);

CREATE INDEX idx_events_created_at
ON events(created_at);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER update_crate_sets_updated_at
BEFORE UPDATE ON crate_sets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();


CREATE TRIGGER update_reservations_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();