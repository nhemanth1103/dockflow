
#Sign in Password 
Two Dashboard one for captain and one for depot staff

| Role | Email | Password |
|---|---|---|
| Captain — B-003 | `captain.b003@gmail.com` | `123456` |
| Depot Staff — Depot A | `depot.a@gmail.com` | `123456` |
| Depot Staff — Depot B | `depot.b@gmail.com` | `123456` |



# DockFlow

> **A dockside coordination system designed to keep working when the dock doesn't.**

DockFlow is an offline-first mobile web application for small artisanal fishing harbors. It helps boat captains and local ice depots coordinate ice, reusable fish crates, reservations, and physical handoffs when dock connectivity is unreliable.

**Live Demo:** Add your Vercel production URL here  
**Repository:** https://github.com/nhemanth1103/dockflow

---

## Problem

Small fishing harbors often manage shared ice and reusable crates using verbal agreements and paper slips. This creates three recurring problems:

- Crates are difficult to track after boats leave the dock.
- Ice can expire or melt before it is used.
- Captains and depots can disagree about what was picked up or returned.

DockFlow provides a lightweight digital board for inventory, reservations, handoffs, and returns without requiring specialized hardware.

## Key Features

- **Ice inventory** — Depots publish available ice, quantities, and melt cut-off times.
- **Crate tracking** — Individual crate sets can be tracked through their lifecycle.
- **One-tap reservations** — Captains reserve ice and crates before departure.
- **Two-party handoffs** — Captain and depot independently confirm pickup and return.
- **Digital receipts** — Completed handoffs provide a clear record of the transaction.
- **Offline-first logging** — Actions remain usable during connectivity loss and sync automatically after reconnection.
- **Mobile PWA** — Works through a standard smartphone browser without native-app installation or barcode hardware.

## Core Workflow

```text
DEPOT
  │
  ├── Posts ice + crates
  │
  ▼
CAPTAIN
  │
  ├── Reserves resources
  │
  ├── Confirms pickup
  │
  ▼
DEPOT
  │
  ├── Verifies pickup
  │
  ▼
BOAT GOES TO SEA
  │
  ▼
CAPTAIN
  │
  ├── Confirms return
  │
  ▼
DEPOT
  │
  ├── Inspects and verifies return
  │
  ▼
INVENTORY AVAILABLE AGAIN
```

The system separates reservation from physical handoff confirmation so that an allocation is not treated as successfully exchanged until both sides have participated.

## Engineering Architecture

```text
                         DOCKFLOW
                            │
                    React + TypeScript
                            │
             ┌──────────────┴──────────────┐
             │                             │
        Mobile PWA                    Offline Layer
             │                             │
      Service Worker                 IndexedDB + Dexie
                                           │
                                        Outbox
                                           │
                                           ▼
                                     Sync Manager
                                           │
                                           ▼
                                      Supabase
                              ┌────────────┼────────────┐
                              │            │            │
                            Auth       PostgreSQL       RLS
                                           │
                                          RPCs
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Database | PostgreSQL / Supabase |
| Authentication | Supabase Auth |
| Offline Storage | IndexedDB + Dexie |
| PWA | vite-plugin-pwa |
| Hosting | Vercel |
| Source Control | GitHub |

### Key Engineering Decisions

- **React + TypeScript + Vite** provide a lightweight, maintainable frontend.
- **IndexedDB + Dexie** store essential local state for offline operation.
- **Outbox events** record user actions locally before synchronization.
- **Supabase PostgreSQL** provides persistent server-side state and transactional business operations.
- **RPC functions** keep critical reservation, pickup, return, and inventory operations on the server.
- **Row Level Security (RLS)** enforces role and ownership boundaries at the database layer.
- **PWA/service worker** allows the application shell to remain available when connectivity is poor.

## Offline-First Design

A network connection is not required to record supported captain actions.

```text
User Action
     │
     ▼
IndexedDB
     │
     ▼
Outbox Event
     │
     ├── Offline ──────► Keep locally
     │                       │
     │                  Reconnect
     │                       │
     └── Online ────────────┘
                             ▼
                       Sync Manager
                             │
                             ▼
                          Supabase
```

Events move through:

```text
PENDING ─────► SYNCED
    │
    └────────► FAILED ─────► RETRY
```

The local database provides continuity, while Supabase remains the authoritative backend. Synchronization is guarded so multiple sync runs do not process the same queue concurrently.

## Trust & State Model

Physical handoffs use a two-party confirmation model:

```text
Captain confirms
       +
Depot verifies
       │
       ▼
Handoff completed
```

This creates a clear responsibility boundary and reduces disputes over whether equipment was actually collected or returned.

### Reservation Lifecycle

```text
RESERVED
   │
   ▼
CAPTAIN_CONFIRMED
   │
   ▼
IN_USE
   │
   ▼
RETURN_PENDING
   │
   ▼
COMPLETED
```

Crates are individually identifiable (`C-001` through `C-030`), allowing a reservation and its returned equipment to be connected.

Ice follows a separate inventory lifecycle, including availability, consumption, upcoming melt cut-offs, and expiry.

## Data Model

The main PostgreSQL entities are:

```text
Profiles
├── Boats
└── Depots

Reservations
├── Reservation Ice
├── Reservation Crates
└── Handoffs

Ice Batches
Crate Sets
Events
```

Critical inventory and lifecycle changes are validated through server-side database operations rather than relying only on client-side state.

## Security

- Supabase Authentication for user sessions.
- Role-based Captain and Depot profiles.
- PostgreSQL Row Level Security for database authorization.
- Captain-to-boat ownership checks.
- Depot ownership checks.
- Server-side validation through database functions.
- Only public Supabase client configuration is used in the frontend; secrets are not committed to the repository.



## Project Structure

```text
dockflow/
├── public/
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
├── src/
│   ├── components/
│   ├── features/
│   ├── lib/
│   │   ├── db/
│   │   └── supabase/
│   └── App.tsx
├── supabase/
│   └── migrations/
├── .env.example
├── package.json
├── vite.config.ts
└── README.md
```

## Demo Data

The prototype is pre-populated with realistic dummy data for the challenge:

- **4 depots**
- **12 boats**
- **30 crate sets**

Crates are individually represented so their allocation and lifecycle can be demonstrated during the end-to-end workflow.

## Run Locally

### Prerequisites

- Node.js
- npm
- Supabase project

### Install

```bash
git clone https://github.com/nhemanth1103/dockflow.git
cd dockflow
npm install
```

Create a `.env` file using `.env.example`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Apply the Supabase migrations/seed data for the database environment, then run:

```bash
npm run dev
```

For a production build:

```bash
npm run build
```

## Deployment

DockFlow is deployed on Vercel with GitHub integration.

```text
git push
   │
   ▼
GitHub main
   │
   ▼
Vercel build
   │
   ▼
Production deployment
```

Future changes pushed to the connected production branch can automatically trigger a new Vercel deployment.


## Product Trade-offs

DockFlow deliberately prioritizes **speed, simplicity, and reliability at the dock**.

- **No barcode hardware** — verification works using standard smartphone screens.
- **No native application** — a PWA reduces installation and deployment friction.
- **No automated damage classification** — crate condition remains a human verification step owned by the depot.
- **No complex dispute workflow** — two-party confirmation provides a simple responsibility boundary.
- **Offline-first, not offline-only** — local operation preserves continuity while the backend remains authoritative.
- **No paid third-party APIs** — the architecture stays within the challenge's free-tier constraint.

## Evaluation Walkthrough

### Application Login Details

Use these demo accounts to access the deployed application:

| Role | Email | Password |
|---|---|---|
| Captain — B-003 | `captain.b003@gmail.com` | `123456` |
| Depot Staff — Depot A | `depot.a@gmail.com` | `123456` |
| Depot Staff — Depot B | `depot.b@gmail.com` | `123456` |

### Recommended Test Flow

1. Sign in using the **Captain — B-003** account.
2. Select a depot and reserve ice + crates.
3. Confirm the pickup.
4. Sign in using the corresponding **Depot Staff** account.
5. Verify the pickup.
6. Observe the reservation move into active use.
7. Return to the Captain account and confirm the return.
8. Sign in as the Depot Staff and verify the return.
9. Open **Activity / Handoff Receipt** to review the completed transaction.
10. Repeat a supported Captain action while offline to demonstrate local logging and automatic synchronization after reconnecting.



## Future Improvements

Potential extensions include:

- Push notifications for expiring ice and overdue returns.
- Improved conflict-resolution UX for simultaneous offline actions.
- Harbor-level analytics and operational reporting.
- Expanded audit and administrative controls.

---

**Built for the Oaks AI Builders — Small Harbor Fish Crate and Ice Board challenge.**
