import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import { supabase } from './lib/supabase/client'
import DepotDashboard from './features/depot/DepotDashboard'
import AuthScreen from './features/auth/AuthScreen'
import HandoffReceipt from './features/handoffs/HandoffReceipt'
import { startSyncManager } from './lib/db/syncManager'
import { queueAction } from './lib/db/actions'
import { db } from './lib/db'

type Role = 'CAPTAIN' | 'DEPOT'

type Profile = {
  id: string
  role: Role
  boat_id: string | null
  depot_id: string | null
  depot: { name: string } | null
}

type Depot = {
  id: string
  name: string
  location: string
  pickup_spot: string
  pickup_window_start: string
  pickup_window_end: string
}

type Boat = {
  id: string
  boat_code: string
  boat_name: string
  captain_name: string
}

type Reservation = {
  id: string
  ice_quantity: number
  status: string
  pickup_window_start: string
  pickup_window_end: string
  pickup_deadline: string
  created_at: string
  depot: Depot
  boat: Boat
}

type DepotInventory = {
  crateCount: number
  iceCount: number
}

type Handoff = {
  id: string
  reservation_id: string
  type: 'PICKUP' | 'RETURN'
  status: string
  captain_confirmed_at: string | null
  depot_confirmed_at: string | null
  created_at: string
}

type ReservationCrate = {
  reservation_id: string
  crate_id: string
  pickup_condition: string | null
  return_condition: string | null
  crate: {
    crate_code: string
  } | null
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const [depots, setDepots] = useState<Depot[]>([])
  const [boats, setBoats] = useState<Boat[]>([])
  const [inventory, setInventory] = useState<
    Record<string, DepotInventory>
  >({})

  const [reservation, setReservation] =
    useState<Reservation | null>(null)

  const [activeTab, setActiveTab] =
    useState<'HOME' | 'RESERVE' | 'ACTIVITY'>('HOME')

  const [activityReservations, setActivityReservations] =
    useState<Reservation[]>([])

  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [reservationCrates, setReservationCrates] =
    useState<ReservationCrate[]>([])

  const [selectedDepot, setSelectedDepot] =
    useState<Depot | null>(null)

  const [selectedBoat, setSelectedBoat] =
    useState<Boat | null>(null)

  const [iceQuantity, setIceQuantity] = useState(20)
  const [crateQuantity, setCrateQuantity] = useState(1)

  const [loading, setLoading] = useState(true)
  const [reserving, setReserving] = useState(false)
  const [confirmingPickup, setConfirmingPickup] = useState(false)
  const [confirmingReturn, setConfirmingReturn] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    return startSyncManager()
  }, [])

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data, error } =
        await supabase.auth.getSession()

      if (!active) return

      if (error) {
        setAuthError(error.message)
        setAuthLoading(false)
        return
      }

      setSession(data.session)

      if (data.session) {
        await loadProfile(data.session.user.id)
      } else {
        setProfile(null)
        setAuthLoading(false)
      }
    }

    void loadSession()

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          setSession(nextSession)

          if (nextSession) {
            void loadProfile(nextSession.user.id)
          } else {
            setProfile(null)
            setAuthLoading(false)
          }
        },
      )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (profile?.role === 'CAPTAIN') {
      void loadData()
    }
  }, [profile])

async function loadProfile(userId: string) {
  setAuthLoading(true)
  setAuthError('')

  const cachedProfile = localStorage.getItem(`dockflow_profile_${userId}`)

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        role,
        boat_id,
        depot_id,
        depot:depots ( name )
      `)
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      // Offline / network failure:
      // fall back to the last known profile.
      if (cachedProfile) {
        const parsedProfile = JSON.parse(cachedProfile)

        setProfile(parsedProfile as Profile)
        setAuthError('')
        setAuthLoading(false)
        return
      }

      setAuthError(error.message)
      setProfile(null)
      setAuthLoading(false)
      return
    }

    if (!data) {
      setAuthError(
        'Your account has not been assigned a DockFlow role yet.',
      )
      setProfile(null)
      setAuthLoading(false)
      return
    }

    const profileData = data as unknown as Profile

    // Save the latest valid profile for offline use.
    localStorage.setItem(
      `dockflow_profile_${userId}`,
      JSON.stringify(profileData),
    )

    setProfile(profileData)
    setAuthLoading(false)
  } catch (error) {
    // Network failure can also appear as a thrown fetch error.
    if (cachedProfile) {
      try {
        const parsedProfile = JSON.parse(cachedProfile)

        setProfile(parsedProfile as Profile)
        setAuthError('')
        setAuthLoading(false)
        return
      } catch {
        // Ignore invalid cached data and show the error below.
      }
    }

    setAuthError(
      error instanceof Error
        ? error.message
        : 'Unable to load your profile.',
    )
    setProfile(null)
    setAuthLoading(false)
  }
}

  async function logout() {
    await supabase.auth.signOut()
  }

  async function loadData() {
    setLoading(true)
    setError('')

    const [
      depotsResult,
      boatsResult,
      cratesResult,
      iceResult,
      reservationResult,
      handoffsResult,
      reservationCratesResult,
    ] = await Promise.all([
      supabase
        .from('depots')
        .select(
          'id, name, location, pickup_spot, pickup_window_start, pickup_window_end',
        )
        .order('name'),

      supabase
        .from('boats')
        .select(
          'id, boat_code, boat_name, captain_name',
        )
        .eq('id', profile?.boat_id ?? '')
        .order('boat_code'),

      supabase
        .from('crate_sets')
        .select(
          'id, depot_id, status, condition, crate_code',
        )
        .eq('status', 'AVAILABLE')
        .eq('condition', 'GOOD'),

      supabase
        .from('ice_batches')
        .select(
          'depot_id, quantity_total, quantity_reserved, quantity_consumed, status, melt_cutoff',
        )
        .in('status', [
          'AVAILABLE',
          'EXPIRING_SOON',
        ]),

      supabase
        .from('reservations')
        .select(`
          id,
          ice_quantity,
          status,
          pickup_window_start,
          pickup_window_end,
          pickup_deadline,
          created_at,
          depot:depots (
            id,
            name,
            location,
            pickup_spot,
            pickup_window_start,
            pickup_window_end
          ),
          boat:boats (
            id,
            boat_code,
            boat_name,
            captain_name
          )
        `)
        .order('created_at', {
          ascending: false,
        })
        .eq('boat_id', profile?.boat_id ?? '')
        .limit(50),

      supabase
        .from('handoffs')
        .select(`
          id,
          reservation_id,
          type,
          status,
          captain_confirmed_at,
          depot_confirmed_at,
          created_at
        `)
        .order('created_at', {
          ascending: false,
        }),

      supabase
        .from('reservation_crates')
        .select(`
          reservation_id,
          crate_id,
          pickup_condition,
          return_condition,
          crate:crate_sets (
            crate_code
          )
        `),
    ])

    const firstError =
      depotsResult.error ||
      boatsResult.error ||
      cratesResult.error ||
      iceResult.error ||
      reservationResult.error ||
      handoffsResult.error ||
      reservationCratesResult.error

    if (firstError) {
      console.error(firstError)
      setError(firstError.message)
      setLoading(false)
      return
    }

    const depotData = depotsResult.data ?? []
    const boatData = boatsResult.data ?? []
    const crateData = cratesResult.data ?? []
    const iceData = iceResult.data ?? []

    const inventoryMap: Record<
      string,
      DepotInventory
    > = {}

    for (const depot of depotData) {
      inventoryMap[depot.id] = {
        crateCount: 0,
        iceCount: 0,
      }
    }

    for (const crate of crateData) {
      if (inventoryMap[crate.depot_id]) {
        inventoryMap[crate.depot_id].crateCount += 1
      }
    }

    for (const batch of iceData) {
      if (inventoryMap[batch.depot_id]) {
        const availableIce =
          Math.max(
            0,
            Number(batch.quantity_total) -
              Number(batch.quantity_reserved) -
              Number(batch.quantity_consumed),
          )

        inventoryMap[batch.depot_id].iceCount +=
          availableIce
      }
    }

    setDepots(depotData)
    setBoats(boatData)
    setSelectedBoat(boatData[0] ?? null)
    setInventory(inventoryMap)

    const reservations =
      (reservationResult.data ?? []) as unknown as Reservation[]

    setActivityReservations(reservations)

    const activeReservation =
      reservations.find((item) =>
        [
          'ACTIVE',
          'CAPTAIN_CONFIRMED',
          'IN_USE',
          'RETURN_PENDING',
        ].includes(item.status),
      )

    setReservation(activeReservation ?? null)

    const handoffData =
      (handoffsResult.data ?? []) as unknown as Handoff[]

    const reservationCrateData =
      (reservationCratesResult.data ?? []) as unknown as ReservationCrate[]

    setHandoffs(handoffData)
    setReservationCrates(reservationCrateData)

    setLoading(false)
  }

  function formatTime(time: string) {
    const [hours, minutes] =
      time.split(':').map(Number)

    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12

    return `${displayHours}:${minutes
      .toString()
      .padStart(2, '0')} ${period}`
  }

  function goToReserve() {
    setActiveTab('RESERVE')
    setReservation(null)
    setSelectedDepot(null)
    setSelectedBoat(boats[0] ?? null)
    setError('')
    setSuccess('')
  }

  function goToHome() {
    setActiveTab('HOME')

    const activeReservation =
      activityReservations.find((item) =>
        [
          'ACTIVE',
          'CAPTAIN_CONFIRMED',
          'IN_USE',
          'RETURN_PENDING',
        ].includes(item.status),
      )

    setReservation(activeReservation ?? null)
    setSelectedDepot(null)
    setSelectedBoat(null)
    setError('')
    setSuccess('')
  }

  function goToActivity() {
    setActiveTab('ACTIVITY')
    setReservation(null)
    setSelectedDepot(null)
    setSelectedBoat(null)
    setError('')
    setSuccess('')
  }

  async function createReservation() {
    if (!selectedDepot || !selectedBoat) {
      setError('Please select a depot and boat.')
      return
    }

    const depotInventory =
      inventory[selectedDepot.id] ?? {
        crateCount: 0,
        iceCount: 0,
      }

    if (crateQuantity > depotInventory.crateCount) {
      setError('Not enough crate sets available.')
      return
    }

    if (iceQuantity > depotInventory.iceCount) {
      setError('Not enough ice available.')
      return
    }

    setError('')
    setSuccess('')
    setReserving(true)

    const localReservationId =
      crypto.randomUUID()

    const now = new Date().toISOString()

    try {
      if (navigator.onLine) {
        const { data, error } =
          await supabase.rpc(
            'create_reservation',
            {
              p_boat_id: selectedBoat.id,
              p_depot_id: selectedDepot.id,
              p_ice_quantity: iceQuantity,
              p_crate_quantity: crateQuantity,
            },
          )

        if (error) {
          throw error
        }

        if (!data) {
          throw new Error(
            'Reservation was created but no reservation ID was returned.',
          )
        }

        await db.reservations.put({
          id: localReservationId,
          server_id: data,
          boat_id: selectedBoat.id,
          depot_id: selectedDepot.id,
          status: 'ACTIVE',
          ice_quantity: iceQuantity,
          crate_quantity: crateQuantity,
          created_at: now,
          updated_at: now,
          sync_status: 'SYNCED',
        })

        setSuccess(
          'Reservation created successfully.',
        )

        setSelectedDepot(null)
        setSelectedBoat(null)

        await loadData()

        return
      }

      await db.reservations.put({
        id: localReservationId,
        boat_id: selectedBoat.id,
        depot_id: selectedDepot.id,
        status: 'ACTIVE',
        ice_quantity: iceQuantity,
        crate_quantity: crateQuantity,
        created_at: now,
        updated_at: now,
        sync_status: 'PENDING',
      })

      await queueAction(
        'RESERVATION_CREATED',
        'reservation',
        localReservationId,
        {
          boat_id: selectedBoat.id,
          depot_id: selectedDepot.id,
          ice_quantity: iceQuantity,
          crate_quantity: crateQuantity,
          local_reservation_id: localReservationId,
        },
        session?.user.id ?? null,
      )

      setReservation({
        id: localReservationId,
        ice_quantity: iceQuantity,
        status: 'ACTIVE',
        pickup_window_start:
          selectedDepot.pickup_window_start,
        pickup_window_end:
          selectedDepot.pickup_window_end,
        pickup_deadline:
          selectedDepot.pickup_window_end,
        created_at: now,
        depot: selectedDepot,
        boat: selectedBoat,
      })

      setSuccess(
        'Reservation saved offline. It will sync when you reconnect.',
      )

      setSelectedDepot(null)
      setSelectedBoat(null)
    } catch (error) {
      console.error(
        'Reservation creation failed:',
        error,
      )

      setError(
        error instanceof Error
          ? error.message
          : 'Could not create reservation.',
      )
    } finally {
      setReserving(false)
    }
  }

  async function confirmPickup() {
    if (!reservation) return

    setError('')
    setSuccess('')
    setConfirmingPickup(true)

    try {
      if (navigator.onLine) {
        const { error } =
          await supabase.rpc(
            'confirm_pickup_captain',
            {
              p_reservation_id: reservation.id,
            },
          )

        if (error) {
          throw error
        }

        await db.reservations.update(
          reservation.id,
          {
            status: 'CAPTAIN_CONFIRMED',
            updated_at:
              new Date().toISOString(),
            sync_status: 'SYNCED',
          },
        )

        setReservation({
          ...reservation,
          status: 'CAPTAIN_CONFIRMED',
        })

        setSuccess(
          'Pickup confirmed. Waiting for depot confirmation.',
        )

        await loadData()

        return
      }

      await db.reservations.update(
        reservation.id,
        {
          status: 'CAPTAIN_CONFIRMED',
          updated_at:
            new Date().toISOString(),
          sync_status: 'PENDING',
        },
      )

      await queueAction(
        'PICKUP_CONFIRMED_BY_CAPTAIN',
        'reservation',
        reservation.id,
        {
          source: 'captain',
          local_reservation_id:
            reservation.id,
        },
        session?.user.id ?? null,
      )

      setReservation({
        ...reservation,
        status: 'CAPTAIN_CONFIRMED',
      })

      setSuccess(
        'Pickup recorded offline. It will sync when you reconnect.',
      )
    } catch (error) {
      console.error(
        'Pickup confirmation failed:',
        error,
      )

      setError(
        error instanceof Error
          ? error.message
          : 'Could not confirm pickup.',
      )
    } finally {
      setConfirmingPickup(false)
    }
  }

  async function confirmReturn() {
    if (!reservation) return

    setError('')
    setSuccess('')
    setConfirmingReturn(true)

    try {
      if (navigator.onLine) {
        const { error } =
          await supabase.rpc(
            'confirm_return_captain',
            {
              p_reservation_id:
                reservation.id,
            },
          )

        if (error) {
          throw error
        }

        await db.reservations.update(
          reservation.id,
          {
            status: 'RETURN_PENDING',
            updated_at:
              new Date().toISOString(),
            sync_status: 'SYNCED',
          },
        )

        setReservation({
          ...reservation,
          status: 'RETURN_PENDING',
        })

        setSuccess(
          'Return recorded. Waiting for depot inspection.',
        )

        await loadData()

        return
      }

      await db.reservations.update(
        reservation.id,
        {
          status: 'RETURN_PENDING',
          updated_at:
            new Date().toISOString(),
          sync_status: 'PENDING',
        },
      )

      await queueAction(
        'RETURN_CONFIRMED_BY_CAPTAIN',
        'reservation',
        reservation.id,
        {
          source: 'captain',
          local_reservation_id:
            reservation.id,
        },
        session?.user.id ?? null,
      )

      setReservation({
        ...reservation,
        status: 'RETURN_PENDING',
      })

      setSuccess(
        'Return recorded offline. It will sync when you reconnect.',
      )
    } catch (error) {
      console.error(
        'Return confirmation failed:',
        error,
      )

      setError(
        error instanceof Error
          ? error.message
          : 'Could not confirm return.',
      )
    } finally {
      setConfirmingReturn(false)
    }
  }

  if (!session) {
    return <AuthScreen />
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Loading your DockFlow account...
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10">
        <main className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Profile setup required
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {authError ||
              'Your account could not be loaded.'}
          </p>

          <button
            onClick={logout}
            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </main>
      </div>
    )
  }

  if (profile.role === 'DEPOT') {
    if (!profile.depot_id) {
      return (
        <div className="min-h-screen bg-slate-100 px-4 py-10">
          <main className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              Your depot assignment is missing.
              Contact an administrator.
            </p>

            <button
              onClick={logout}
              className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Sign out
            </button>
          </main>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <Header onLogout={logout} />

        <DepotDashboard
          depotId={profile.depot_id}
          depotName={
            profile.depot?.name ??
            'Assigned depot'
          }
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <Header onLogout={logout} />

        <main className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Loading DockFlow...
            </p>
          </div>
        </main>
      </div>
    )
  }

  /*
   * ==========================================================
   * ACTIVITY
   * ==========================================================
   */

  if (activeTab === 'ACTIVITY') {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <Header onLogout={logout} />

        <main className="mx-auto max-w-xl px-5 py-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Activity
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Your recent reservations and handoffs.
          </p>

          {activityReservations.length === 0 ? (
            <section className="mt-6 rounded-2xl bg-white p-6 text-center shadow-sm">
              <p className="font-semibold text-slate-900">
                No activity yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Your reservations will appear here.
              </p>
            </section>
          ) : (
            <section className="mt-6 space-y-3">
              {activityReservations.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-slate-900">
                        {item.depot.name}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {item.boat.boat_code} —{' '}
                        {item.boat.boat_name}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {item.status.replaceAll(
                        '_',
                        ' ',
                      )}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        Ice
                      </p>

                      <p className="mt-1 font-bold text-slate-900">
                        {item.ice_quantity}
                      </p>

                      <p className="text-xs text-slate-500">
                        blocks
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        Pickup
                      </p>

                      <p className="mt-1 font-semibold text-slate-900">
                        {formatTime(
                          item.pickup_window_start,
                        )}
                      </p>

                      <p className="text-xs text-slate-500">
                        {formatTime(
                          item.pickup_window_end,
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-400">
                    {new Date(
                      item.created_at,
                    ).toLocaleString()}
                  </p>

                  {/* REAL HANDOFF RECEIPTS */}

                  {handoffs
                    .filter(
                      (handoff) =>
                        handoff.reservation_id ===
                          item.id &&
                        handoff.status ===
                          'COMPLETED',
                    )
                    .map((handoff) => {
                      const crates =
                        reservationCrates.filter(
                          (crate) =>
                            crate.reservation_id ===
                            item.id,
                        )

                      return (
                        <HandoffReceipt
                          key={handoff.id}
                          type={handoff.type}
                          reservationId={item.id}
                          boatCode={
                            item.boat.boat_code
                          }
                          boatName={
                            item.boat.boat_name
                          }
                          captainName={
                            item.boat.captain_name
                          }
                          depotName={
                            item.depot.name
                          }
                          iceQuantity={
                            item.ice_quantity
                          }
                          crateCodes={crates
                            .map(
                              (crate) =>
                                crate.crate
                                  ?.crate_code,
                            )
                            .filter(
                              (
                                code,
                              ): code is string =>
                                Boolean(code),
                            )}
                          status={
                            handoff.status
                          }
                          condition={
                            handoff.type ===
                            'PICKUP'
                              ? crates[0]
                                  ?.pickup_condition ??
                                undefined
                              : crates[0]
                                  ?.return_condition ??
                                undefined
                          }
                          confirmedAt={
                            handoff.depot_confirmed_at ??
                            handoff.captain_confirmed_at ??
                            undefined
                          }
                        />
                      )
                    })}
                </article>
              ))}
            </section>
          )}
        </main>

        <BottomNav
          onHome={goToHome}
          onReserve={goToReserve}
          onActivity={goToActivity}
        />
      </div>
    )
  }

  /*
   * ==========================================================
   * ACTIVE RESERVATION
   * ==========================================================
   */

  if (reservation) {
    const statusLabels: Record<
      string,
      string
    > = {
      ACTIVE: 'Reserved',
      PICKUP_PENDING: 'Pickup pending',
      CAPTAIN_CONFIRMED:
        'Waiting for depot',
      IN_USE: 'At sea',
      RETURN_PENDING:
        'Return pending',
      COMPLETED: 'Completed',
      DISPUTED: 'Disputed',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired',
    }

    const statusLabel =
      statusLabels[reservation.status] ??
      reservation.status

    const canConfirmPickup =
      reservation.status === 'ACTIVE'

    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <Header onLogout={logout} />

        <main className="mx-auto max-w-md px-4 py-6">
          <section className="mb-6">
            <p className="text-sm text-slate-500">
              My reservation
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {reservation.depot.name}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {reservation.boat.boat_code} —{' '}
              {reservation.boat.boat_name}
            </p>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Reservation status
              </h3>

              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {statusLabel}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">
                  Ice
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {reservation.ice_quantity}
                </p>

                <p className="text-xs text-slate-500">
                  blocks
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">
                  Crates
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-900">
                  Reserved
                </p>

                <p className="text-xs text-slate-500">
                  crate sets
                </p>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              Pickup
            </h3>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">
                Pickup window
              </p>

              <p className="mt-1 text-base font-semibold text-slate-900">
                {formatTime(
                  reservation.pickup_window_start,
                )}
                {' – '}
                {formatTime(
                  reservation.pickup_window_end,
                )}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">
                Pickup spot
              </p>

              <p className="mt-1 text-sm text-slate-500">
                📍 {reservation.depot.pickup_spot}
              </p>
            </div>
          </section>

          {reservation.status ===
            'IN_USE' && (
            <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">
                Return crates
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Hand the crates back to the depot.
                The depot will inspect their
                condition.
              </p>

              <button
                onClick={confirmReturn}
                disabled={confirmingReturn}
                className="mt-4 min-h-14 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
              >
                {confirmingReturn
                  ? 'Confirming return...'
                  : 'I’ve returned the crates'}
              </button>
            </section>
          )}

          {success && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                {success}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                {error}
              </p>
            </div>
          )}

          {canConfirmPickup && (
            <button
              onClick={confirmPickup}
              disabled={confirmingPickup}
              className="mt-5 min-h-14 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
            >
              {confirmingPickup
                ? 'Confirming pickup...'
                : "I've picked up my resources"}
            </button>
          )}

          {reservation.status ===
            'CAPTAIN_CONFIRMED' && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                Waiting for depot confirmation
              </p>

              <p className="mt-1 text-sm text-amber-800">
                The depot needs to confirm the
                handoff before the reservation
                becomes active.
              </p>
            </div>
          )}

          {reservation.status ===
            'RETURN_PENDING' && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                Waiting for depot inspection
              </p>

              <p className="mt-1 text-sm text-amber-800">
                The depot needs to inspect and
                confirm the returned crates.
              </p>
            </div>
          )}
        </main>

        <BottomNav
          onHome={goToHome}
          onReserve={goToReserve}
          onActivity={goToActivity}
        />
      </div>
    )
  }

  /*
   * ==========================================================
   * RESERVATION FORM
   * ==========================================================
   */

  if (selectedDepot) {
    const depotInventory =
      inventory[selectedDepot.id] ?? {
        crateCount: 0,
        iceCount: 0,
      }

    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <Header onLogout={logout} />

        <main className="mx-auto max-w-md px-4 py-6">
          <button
            onClick={() =>
              setSelectedDepot(null)
            }
            className="mb-5 text-sm font-semibold text-slate-600"
          >
            ← Back to depots
          </button>

          <section className="mb-6">
            <p className="text-sm text-slate-500">
              Reserve resources
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {selectedDepot.name}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              📍 {selectedDepot.pickup_spot}
            </p>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              1. Assigned boat
            </h3>

            <div className="mt-4 space-y-2">
              {boats.map((boat) => (
                <div
                  key={boat.id}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left"
                >
                  <p className="font-semibold text-slate-900">
                    {boat.boat_code} —{' '}
                    {boat.boat_name}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Captain: {boat.captain_name}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              2. Choose ice
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {depotInventory.iceCount} blocks
              available
            </p>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <button
                onClick={() =>
                  setIceQuantity((value) =>
                    Math.max(
                      0,
                      value - 5,
                    ),
                  )
                }
                className="h-12 w-12 rounded-xl bg-white text-2xl font-bold shadow-sm"
              >
                −
              </button>

              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">
                  {iceQuantity}
                </p>

                <p className="text-xs text-slate-500">
                  ice blocks
                </p>
              </div>

              <button
                onClick={() =>
                  setIceQuantity((value) =>
                    Math.min(
                      depotInventory.iceCount,
                      value + 5,
                    ),
                  )
                }
                className="h-12 w-12 rounded-xl bg-white text-2xl font-bold shadow-sm"
              >
                +
              </button>
            </div>
          </section>

          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              3. Choose crate sets
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {depotInventory.crateCount} crate
              sets available
            </p>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <button
                onClick={() =>
                  setCrateQuantity((value) =>
                    Math.max(
                      1,
                      value - 1,
                    ),
                  )
                }
                className="h-12 w-12 rounded-xl bg-white text-2xl font-bold shadow-sm"
              >
                −
              </button>

              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">
                  {crateQuantity}
                </p>

                <p className="text-xs text-slate-500">
                  crate sets
                </p>
              </div>

              <button
                onClick={() =>
                  setCrateQuantity((value) =>
                    Math.min(
                      depotInventory.crateCount,
                      value + 1,
                    ),
                  )
                }
                className="h-12 w-12 rounded-xl bg-white text-2xl font-bold shadow-sm"
              >
                +
              </button>
            </div>
          </section>

          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              Pickup
            </h3>

            <p className="mt-2 text-sm font-semibold text-slate-900">
              {formatTime(
                selectedDepot.pickup_window_start,
              )}
              {' – '}
              {formatTime(
                selectedDepot.pickup_window_end,
              )}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              The depot controls the pickup
              window.
            </p>
          </section>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                {error}
              </p>
            </div>
          )}

          <button
            onClick={createReservation}
            disabled={
              reserving ||
              !selectedBoat ||
              crateQuantity >
                depotInventory.crateCount ||
              iceQuantity >
                depotInventory.iceCount
            }
            className="mt-5 min-h-14 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
          >
            {reserving
              ? 'Creating reservation...'
              : 'Reserve resources'}
          </button>
        </main>

        <BottomNav
          onHome={goToHome}
          onReserve={goToReserve}
          onActivity={goToActivity}
        />
      </div>
    )
  }

  /*
   * ==========================================================
   * DEPOT LIST / HOME
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <Header onLogout={logout} />

      <main className="mx-auto max-w-md px-4 py-6">
        <section className="mb-6">
          <p className="text-sm text-slate-500">
            Good morning, Captain
          </p>

          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Available at the dock
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Choose a depot to reserve ice and
            crate sets.
          </p>
        </section>

        {success && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              {success}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              {error}
            </p>
          </div>
        )}

        <section className="space-y-4">
          {depots.map((depot) => {
            const depotInventory =
              inventory[depot.id] ?? {
                crateCount: 0,
                iceCount: 0,
              }

            return (
              <div
                key={depot.id}
                className="rounded-2xl bg-white p-5 shadow-sm"
              >
                <h3 className="text-lg font-bold text-slate-900">
                  {depot.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {depot.location}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      Crate sets
                    </p>

                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {depotInventory.crateCount}
                    </p>

                    <p className="text-xs text-slate-500">
                      available
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      Ice blocks
                    </p>

                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {depotInventory.iceCount}
                    </p>

                    <p className="text-xs text-slate-500">
                      available
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-500">
                    🕐{' '}
                    {formatTime(
                      depot.pickup_window_start,
                    )}
                    {' – '}
                    {formatTime(
                      depot.pickup_window_end,
                    )}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    📍 {depot.pickup_spot}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setSelectedDepot(depot)
                    setSelectedBoat(
                      boats[0] ?? null,
                    )
                    setSuccess('')
                    setError('')
                  }}
                  className="mt-4 min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98]"
                >
                  Reserve here
                </button>
              </div>
            )
          })}
        </section>
      </main>

      <BottomNav
        onHome={goToHome}
        onReserve={goToReserve}
        onActivity={goToActivity}
      />
    </div>
  )
}

export default App