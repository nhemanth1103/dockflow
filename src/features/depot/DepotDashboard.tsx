import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { queueAction } from '../../lib/db/actions'

type CrateInspection = {
  crate_id: string
  crate_code: string
  status: string
  pickup_condition: 'GOOD' | 'DAMAGED' | null
  return_condition: 'GOOD' | 'DAMAGED' | null
}

type InventorySummary = {
  iceAvailable: number
  iceReserved: number
  iceConsumed: number
  iceExpiringSoon: number
  iceExpired: number
  cratesAvailable: number
  cratesReserved: number
  cratesInUse: number
  cratesOverdue: number
  cratesMissing: number
}

const emptyInventorySummary: InventorySummary = {
  iceAvailable: 0,
  iceReserved: 0,
  iceConsumed: 0,
  iceExpiringSoon: 0,
  iceExpired: 0,
  cratesAvailable: 0,
  cratesReserved: 0,
  cratesInUse: 0,
  cratesOverdue: 0,
  cratesMissing: 0,
}

type Reservation = {
  id: string
  status: string
  ice_quantity: number
  pickup_deadline: string
  boat: {
    boat_code: string
    captain_name: string
  } | null
  depot: {
    name: string
    pickup_window_start: string
    pickup_window_end: string
    pickup_spot: string
  } | null
  crates: CrateInspection[]
}

type DepotDashboardProps = {
  depotId: string
  depotName: string
}

function DepotDashboard({ depotId, depotName }: DepotDashboardProps) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [inventorySummary, setInventorySummary] =
    useState<InventorySummary>(emptyInventorySummary)
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [pickupConditions, setPickupConditions] = useState<
    Record<string, 'GOOD' | 'DAMAGED'>
  >({})

  async function loadReservations() {
    if (!depotId) {
      setReservations([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        status,
        ice_quantity,
        pickup_deadline,
        boat:boats (
          boat_code,
          captain_name
        ),
        depot:depots (
          name,
          pickup_window_start,
          pickup_window_end,
          pickup_spot
        )
      `)
      .in('status', [
        'ACTIVE',
        'PICKUP_PENDING',
        'IN_USE',
        'RETURN_PENDING',
      ])
      .eq('depot_id', depotId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Depot reservations error:', error)
      setMessage(error.message)
      setLoading(false)
      return
    }

    const reservationsData =
      (data ?? []) as unknown as Omit<
        Reservation,
        'crates'
      >[]

    if (reservationsData.length === 0) {
      setReservations([])
      setLoading(false)
      return
    }

    const reservationIds = reservationsData.map(
      (reservation) => reservation.id
    )

    const { data: crateData, error: crateError } = await supabase
      .from('reservation_crates')
      .select(`
        reservation_id,
        crate_id,
        pickup_condition,
        return_condition,
        crate_sets (
          crate_code,
          status,
          condition
        )
      `)
      .in('reservation_id', reservationIds)
      .is('released_at', null)

    if (crateError) {
      console.error('Reservation crates error:', crateError)
      setMessage(crateError.message)
      setLoading(false)
      return
    }

    const cratesByReservation =
      new Map<string, CrateInspection[]>()

    ;(crateData ?? []).forEach((item: any) => {
      const crate = item.crate_sets

      if (!crate) return

      const inspection: CrateInspection = {
        crate_id: item.crate_id,
        crate_code: crate.crate_code,
        status: item.crate_sets?.status ?? 'UNKNOWN',
        pickup_condition:
          item.pickup_condition ?? crate.condition ?? null,
        return_condition:
          item.return_condition ?? null,
      }

      const existing =
        cratesByReservation.get(item.reservation_id) ?? []

      existing.push(inspection)

      cratesByReservation.set(
        item.reservation_id,
        existing
      )
    })

    const updatedReservations: Reservation[] =
      reservationsData.map((reservation) => ({
        ...reservation,
        crates:
          cratesByReservation.get(reservation.id) ?? [],
      }))

    setReservations(updatedReservations)
    setLoading(false)
  }

  async function loadInventorySummary(depotId: string) {
    setSummaryLoading(true)
    setSummaryError('')

    const [iceResult, crateResult] = await Promise.all([
      supabase
        .from('ice_batches')
        .select(
          'quantity_total, quantity_reserved, quantity_consumed, status, melt_cutoff'
        )
        .eq('depot_id', depotId),
      supabase
        .from('crate_sets')
        .select('status')
        .eq('depot_id', depotId),
    ])

    if (iceResult.error || crateResult.error) {
      console.error(
        'Depot inventory summary error:',
        iceResult.error ?? crateResult.error
      )
      setSummaryError(
        iceResult.error?.message ??
          crateResult.error?.message ??
          'Unable to load inventory summary.'
      )
      setSummaryLoading(false)
      return
    }

    const nextSummary = (iceResult.data ?? []).reduce(
      (summary, batch: any) => {
        const quantityTotal = Number(batch.quantity_total) || 0
        const quantityReserved = Number(batch.quantity_reserved) || 0
        const quantityConsumed = Number(batch.quantity_consumed) || 0
        const remaining = Math.max(
          0,
          quantityTotal - quantityReserved - quantityConsumed
        )

        summary.iceReserved += quantityReserved
        summary.iceConsumed += quantityConsumed

        if (batch.status === 'AVAILABLE') {
          summary.iceAvailable += remaining
        }

        if (batch.status === 'EXPIRING_SOON') {
          summary.iceExpiringSoon += remaining
        }

        if (batch.status === 'EXPIRED') {
          summary.iceExpired += remaining
        }

        return summary
      },
      { ...emptyInventorySummary }
    )

    ;(crateResult.data ?? []).forEach((crate: any) => {
      if (crate.status === 'AVAILABLE') {
        nextSummary.cratesAvailable += 1
      }

      if (crate.status === 'RESERVED') {
        nextSummary.cratesReserved += 1
      }

      if (crate.status === 'IN_USE') {
        nextSummary.cratesInUse += 1
      }

      if (crate.status === 'OVERDUE') {
        nextSummary.cratesOverdue += 1
      }

      if (crate.status === 'MISSING') {
        nextSummary.cratesMissing += 1
      }
    })

    setInventorySummary(nextSummary)
    setSummaryLoading(false)
  }

  useEffect(() => {
    if (!depotId) return

    loadReservations()
    loadInventorySummary(depotId)
  }, [depotId])

  async function setPickupCondition(
    reservationId: string,
    crateId: string,
    condition: 'GOOD' | 'DAMAGED'
  ) {
    setMessage('')

    const { error } = await supabase.rpc(
      'set_pickup_crate_condition',
      {
        p_reservation_id: reservationId,
        p_crate_id: crateId,
        p_condition: condition,
      }
    )

    if (error) {
      console.error(error)
      setMessage(error.message)
      return
    }

    setPickupConditions((current) => ({
      ...current,
      [crateId]: condition,
    }))

    setReservations((current) =>
      current.map((reservation) =>
        reservation.id === reservationId
          ? {
              ...reservation,
              crates: reservation.crates.map((crate) =>
                crate.crate_id === crateId
                  ? {
                      ...crate,
                      pickup_condition: condition,
                    }
                  : crate
              ),
            }
          : reservation
      )
    )
  }

  async function confirmPickup(reservationId: string) {
    setProcessingId(reservationId)
    setMessage('')

    const { error } = await supabase.rpc(
      'confirm_pickup_depot',
      {
        p_reservation_id: reservationId,
      }
    )

    if (error) {
      setMessage(error.message)
    } else {
      await queueAction(
        'PICKUP_COMPLETED',
        'reservation',
        reservationId,
        {
          source: 'depot',
        },
      )
      setMessage('Pickup completed. Resources are now in use.')
      await loadReservations()
      await loadInventorySummary(depotId)
    }

    setProcessingId(null)
  }

  async function setReturnCondition(
    reservationId: string,
    crateId: string,
    condition: 'GOOD' | 'DAMAGED'
  ) {
    setMessage('')

    const { error } = await supabase.rpc(
      'set_return_crate_condition',
      {
        p_reservation_id: reservationId,
        p_crate_id: crateId,
        p_condition: condition,
      }
    )

    if (error) {
      console.error(error)
      setMessage(error.message)
      return
    }

    setReservations((current) =>
      current.map((reservation) => {
        if (reservation.id !== reservationId) {
          return reservation
        }

        return {
          ...reservation,
          crates: reservation.crates.map((crate) =>
            crate.crate_id === crateId
              ? {
                  ...crate,
                  return_condition: condition,
                }
              : crate
          ),
        }
      })
    )
  }

  async function markMissing(
    reservationId: string,
    crateId: string
  ) {
    const { error } = await supabase.rpc('mark_crate_missing', {
      p_reservation_id: reservationId,
      p_crate_id: crateId,
    })

    if (error) {
      console.error(error)
      return
    }

    await loadReservations()
    await loadInventorySummary(depotId)
  }

  async function confirmReturn(reservationId: string) {
    setProcessingId(reservationId)
    setMessage('')

    const { error } = await supabase.rpc(
      'confirm_return_depot',
      {
        p_reservation_id: reservationId,
      }
    )

    if (error) {
      setMessage(error.message)
    } else {
      await queueAction(
        'RETURN_COMPLETED',
        'reservation',
        reservationId,
        {
          source: 'depot',
        },
      )
      setMessage('Return verified. Crates are now updated.')
      await loadReservations()
      await loadInventorySummary(depotId)
    }

    setProcessingId(null)
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Loading depot dashboard...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-slate-900">
          Depot Dashboard
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Confirm captain pickups and manage today's allocations.
        </p>
      </div>

      <div className="mb-4 rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Operating depot
        </p>
        <p className="mt-1 text-base font-bold text-slate-900">
          {depotName}
        </p>
      </div>

          {summaryError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Inventory summary unavailable: {summaryError}
            </div>
          ) : summaryLoading ? (
            <div className="mb-4 rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">
              Loading inventory summary...
            </div>
          ) : (
            <section className="mb-5 space-y-3">
              <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
                <h3 className="text-base font-bold">Ice inventory</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-2xl font-bold">
                      {inventorySummary.iceAvailable}
                    </p>
                    <p className="text-xs text-slate-300">Available blocks</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {inventorySummary.iceReserved}
                    </p>
                    <p className="text-xs text-slate-300">Reserved blocks</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {inventorySummary.iceConsumed}
                    </p>
                    <p className="text-xs text-slate-300">Consumed blocks</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-300">
                      {inventorySummary.iceExpiringSoon}
                    </p>
                    <p className="text-xs text-slate-300">Expiring soon</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-300">
                      {inventorySummary.iceExpired}
                    </p>
                    <p className="text-xs text-slate-300">Expired blocks</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900">
                  Crate inventory
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-green-50 p-3">
                    <p className="text-2xl font-bold text-green-700">
                      {inventorySummary.cratesAvailable}
                    </p>
                    <p className="text-xs font-medium text-green-700">Available</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-2xl font-bold text-amber-700">
                      {inventorySummary.cratesReserved}
                    </p>
                    <p className="text-xs font-medium text-amber-700">Reserved</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-3">
                    <p className="text-2xl font-bold text-sky-700">
                      {inventorySummary.cratesInUse}
                    </p>
                    <p className="text-xs font-medium text-sky-700">In use</p>
                  </div>
                  <div className="rounded-xl bg-orange-50 p-3">
                    <p className="text-2xl font-bold text-orange-700">
                      {inventorySummary.cratesOverdue}
                    </p>
                    <p className="text-xs font-medium text-orange-700">Overdue</p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-2xl font-bold text-red-700">
                      {inventorySummary.cratesMissing}
                    </p>
                    <p className="text-xs font-medium text-red-700">Missing</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {message && (
        <div className="mb-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          {message}
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="font-medium text-slate-900">
            No active pickups
          </p>
          <p className="mt-1 text-sm text-slate-500">
            New reservations will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reservations.map((reservation) => (
            <div
              key={reservation.id}
              className="rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    {reservation.boat?.boat_code ?? 'Unknown boat'}
                  </h3>

                  <p className="text-sm text-slate-500">
                    Captain:{' '}
                    {reservation.boat?.captain_name ?? 'Unknown'}
                  </p>
                </div>

                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  {reservation.status}
                </span>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Ice
                  </span>

                  <span className="font-semibold text-slate-900">
                    {reservation.ice_quantity} blocks
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Pickup spot
                  </span>

                  <span className="font-semibold text-slate-900">
                    {reservation.depot?.pickup_spot ?? '-'}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Pickup window
                  </span>

                  <span className="font-semibold text-slate-900">
                    {reservation.depot?.pickup_window_start ?? '-'}
                    {' – '}
                    {reservation.depot?.pickup_window_end ?? '-'}
                  </span>
                </div>

              </div>

              {reservation.status === 'RETURN_PENDING' ? (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <h4 className="text-base font-bold text-slate-900">
                    Returned crate inspection
                  </h4>

                  <p className="mt-1 text-sm text-slate-500">
                    Inspect every crate before verifying the return.
                  </p>

                  <div className="mt-4 space-y-4">
                    {reservation.crates.map((crate) => (
                      <div
                        key={crate.crate_id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {crate.crate_code}
                          </span>

                          <span className="text-xs text-slate-500">
                            Pickup:{' '}
                            {crate.pickup_condition ?? 'Not recorded'}
                          </span>
                        </div>

                        <p className="mt-3 text-sm font-medium text-slate-700">
                          Current condition
                        </p>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() =>
                              setReturnCondition(
                                reservation.id,
                                crate.crate_id,
                                'GOOD'
                              )
                            }
                            className={`min-h-12 rounded-xl border text-sm font-semibold ${
                              crate.return_condition === 'GOOD'
                                ? 'border-green-600 bg-green-50 text-green-700'
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            🟢 Good
                          </button>

                          <button
                            onClick={() =>
                              setReturnCondition(
                                reservation.id,
                                crate.crate_id,
                                'DAMAGED'
                              )
                            }
                            className={`min-h-12 rounded-xl border text-sm font-semibold ${
                              crate.return_condition === 'DAMAGED'
                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            🟠 Damaged
                          </button>
                        </div>

                        {crate.return_condition === null &&
                          crate.pickup_condition !== null &&
                          crate.status === 'OVERDUE' && (
                            <button
                              onClick={() =>
                                markMissing(
                                  reservation.id,
                                  crate.crate_id
                                )
                              }
                              className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white"
                            >
                              Mark Missing
                            </button>
                          )}

                        {crate.return_condition && (
                          <p className="mt-2 text-xs font-medium text-slate-500">
                            Recorded:{' '}
                            {crate.return_condition === 'DAMAGED'
                              ? 'Damaged'
                              : 'Good'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => confirmReturn(reservation.id)}
                    disabled={
                      processingId === reservation.id ||
                      reservation.crates.length === 0 ||
                      reservation.crates.some(
                        (crate) => crate.return_condition === null
                      )
                    }
                    className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {processingId === reservation.id
                      ? 'Verifying...'
                      : 'Verify Return'}
                  </button>
                </div>
              ) : reservation.status === 'IN_USE' ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Crates in use
                    </p>

                    <div className="mt-3 space-y-2">
                      {reservation.crates.map((crate) => (
                        <div
                          key={crate.crate_id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {crate.crate_code}
                            </p>
                            <p className="text-xs text-slate-500">
                              {crate.status}
                            </p>
                          </div>

                          {crate.status === 'OVERDUE' && (
                            <button
                              onClick={() =>
                                markMissing(
                                  reservation.id,
                                  crate.crate_id
                                )
                              }
                              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Mark Missing
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <h4 className="text-base font-bold text-slate-900">
                    Pickup inspection
                  </h4>

                  <p className="mt-1 text-sm text-slate-500">
                    Inspect every crate before handing it to the captain.
                  </p>

                  <div className="mt-4 space-y-4">
                    {reservation.crates.map((crate) => {
                      const pickupCondition =
                        pickupConditions[crate.crate_id] ??
                        crate.pickup_condition

                      return (
                        <div
                          key={crate.crate_id}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <span className="font-bold text-slate-900">
                            {crate.crate_code}
                          </span>

                          <p className="mt-3 text-sm font-medium text-slate-700">
                            Condition at pickup
                          </p>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              onClick={() =>
                                setPickupCondition(
                                  reservation.id,
                                  crate.crate_id,
                                  'GOOD'
                                )
                              }
                              className={`min-h-12 rounded-xl border text-sm font-semibold ${
                                pickupCondition === 'GOOD'
                                  ? 'border-green-600 bg-green-50 text-green-700'
                                  : 'border-slate-200 text-slate-600'
                              }`}
                            >
                              🟢 Good
                            </button>

                            <button
                              onClick={() =>
                                setPickupCondition(
                                  reservation.id,
                                  crate.crate_id,
                                  'DAMAGED'
                                )
                              }
                              className={`min-h-12 rounded-xl border text-sm font-semibold ${
                                pickupCondition === 'DAMAGED'
                                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                                  : 'border-slate-200 text-slate-600'
                              }`}
                            >
                              🟠 Damaged
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => confirmPickup(reservation.id)}
                    disabled={
                      processingId === reservation.id ||
                      reservation.crates.length === 0 ||
                      reservation.crates.some((crate) => {
                        const pickupCondition =
                          pickupConditions[crate.crate_id] ??
                          crate.pickup_condition

                        return pickupCondition === null
                      })
                    }
                    className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {processingId === reservation.id
                      ? 'Confirming...'
                      : 'Confirm Pickup'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export default DepotDashboard
