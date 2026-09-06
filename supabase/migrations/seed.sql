-- ============================================================
-- DockFlow - Dummy Data
-- 4 Depots | 12 Boats | 30 Crate Sets | Ice Inventory
-- ============================================================

-- ============================================================
-- 1. DEPOTS
-- ============================================================

INSERT INTO depots (
  name,
  location,
  pickup_spot,
  pickup_window_start,
  pickup_window_end
)
VALUES
  (
    'Harbor Ice Depot A',
    'Kochi Fishing Harbor',
    'Dock A - Gate 1',
    '04:30',
    '05:30'
  ),
  (
    'Harbor Ice Depot B',
    'Kochi Fishing Harbor',
    'Dock B - Gate 2',
    '04:30',
    '05:30'
  ),
  (
    'Harbor Ice Depot C',
    'Kochi Fishing Harbor',
    'Dock C - Gate 3',
    '05:00',
    '06:00'
  ),
  (
    'Harbor Ice Depot D',
    'Kochi Fishing Harbor',
    'Dock D - Gate 4',
    '05:00',
    '06:00'
  );


-- ============================================================
-- 2. BOATS
-- ============================================================

INSERT INTO boats (
  boat_code,
  boat_name,
  captain_name
)
VALUES
  ('B-001', 'Sea Star', 'Rajan Kumar'),
  ('B-002', 'Ocean Pearl', 'Suresh Babu'),
  ('B-003', 'Blue Wave', 'Manoj Das'),
  ('B-004', 'Marine Queen', 'Thomas Joseph'),
  ('B-005', 'Sea Rider', 'Antony George'),
  ('B-006', 'Golden Fish', 'Vijay Menon'),
  ('B-007', 'Ocean King', 'Shaji Mathew'),
  ('B-008', 'Silver Net', 'Prakash Nair'),
  ('B-009', 'Sea Breeze', 'Binu Thomas'),
  ('B-010', 'Blue Horizon', 'Arun Raj'),
  ('B-011', 'Wave Runner', 'Sunil Kumar'),
  ('B-012', 'Deep Sea', 'Ramesh Pillai');


-- ============================================================
-- 3. CRATE SETS
-- ============================================================

-- Depot A: C-001 to C-008

INSERT INTO crate_sets (
  crate_code,
  depot_id,
  status,
  condition
)
SELECT
  'C-' || LPAD(gs::TEXT, 3, '0'),
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot A'),
  'AVAILABLE',
  'GOOD'
FROM generate_series(1, 8) AS gs;


-- Depot B: C-009 to C-016

INSERT INTO crate_sets (
  crate_code,
  depot_id,
  status,
  condition
)
SELECT
  'C-' || LPAD(gs::TEXT, 3, '0'),
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot B'),
  'AVAILABLE',
  'GOOD'
FROM generate_series(9, 16) AS gs;


-- Depot C: C-017 to C-023

INSERT INTO crate_sets (
  crate_code,
  depot_id,
  status,
  condition
)
SELECT
  'C-' || LPAD(gs::TEXT, 3, '0'),
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot C'),
  'AVAILABLE',
  'GOOD'
FROM generate_series(17, 23) AS gs;


-- Depot D: C-024 to C-030

INSERT INTO crate_sets (
  crate_code,
  depot_id,
  status,
  condition
)
SELECT
  'C-' || LPAD(gs::TEXT, 3, '0'),
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot D'),
  'AVAILABLE',
  'GOOD'
FROM generate_series(24, 30) AS gs;


-- ============================================================
-- 4. ICE BATCHES
-- ============================================================

-- Depot A

INSERT INTO ice_batches (
  depot_id,
  quantity_total,
  quantity_reserved,
  quantity_consumed,
  unit,
  melt_cutoff,
  status
)
VALUES
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot A'),
  100,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '18 hours',
  'AVAILABLE'
),
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot A'),
  60,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '30 hours',
  'AVAILABLE'
);


-- Depot B

INSERT INTO ice_batches (
  depot_id,
  quantity_total,
  quantity_reserved,
  quantity_consumed,
  unit,
  melt_cutoff,
  status
)
VALUES
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot B'),
  80,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '20 hours',
  'AVAILABLE'
),
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot B'),
  50,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '36 hours',
  'AVAILABLE'
);


-- Depot C

INSERT INTO ice_batches (
  depot_id,
  quantity_total,
  quantity_reserved,
  quantity_consumed,
  unit,
  melt_cutoff,
  status
)
VALUES
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot C'),
  90,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '16 hours',
  'AVAILABLE'
),
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot C'),
  40,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '28 hours',
  'AVAILABLE'
);


-- Depot D

INSERT INTO ice_batches (
  depot_id,
  quantity_total,
  quantity_reserved,
  quantity_consumed,
  unit,
  melt_cutoff,
  status
)
VALUES
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot D'),
  70,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '22 hours',
  'AVAILABLE'
),
(
  (SELECT id FROM depots WHERE name = 'Harbor Ice Depot D'),
  45,
  0,
  0,
  'BLOCK',
  NOW() + INTERVAL '40 hours',
  'AVAILABLE'
);