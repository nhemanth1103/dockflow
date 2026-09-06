type HandoffReceiptProps = {
  type: 'PICKUP' | 'RETURN'
  reservationId: string
  boatCode: string
  boatName: string
  captainName: string
  depotName: string
  iceQuantity: number
  crateCodes: string[]
  status: string
  condition?: string
  confirmedAt?: string
}

export default function HandoffReceipt({
  type,
  reservationId,
  boatCode,
  boatName,
  captainName,
  depotName,
  iceQuantity,
  crateCodes,
  status,
  condition,
  confirmedAt,
}: HandoffReceiptProps) {
  const isPickup = type === 'PICKUP'

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            DockFlow Receipt
          </p>

          <h3 className="mt-1 text-lg font-bold text-slate-900">
            {isPickup ? 'Pickup Handoff' : 'Return Handoff'}
          </h3>
        </div>

        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
          {status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Receipt ID</span>
          <span className="max-w-[220px] break-all text-right font-medium text-slate-900">
            {reservationId}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Boat</span>
          <span className="text-right font-semibold text-slate-900">
            {boatCode} — {boatName}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Captain</span>
          <span className="text-right font-semibold text-slate-900">
            {captainName}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Depot</span>
          <span className="text-right font-semibold text-slate-900">
            {depotName}
          </span>
        </div>

        {isPickup && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Ice</span>
            <span className="font-semibold text-slate-900">
              {iceQuantity} blocks
            </span>
          </div>
        )}

        <div>
          <p className="text-slate-500">Crates</p>

          <div className="mt-2 flex flex-wrap gap-2">
            {crateCodes.length > 0 ? (
              crateCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800"
                >
                  {code}
                </span>
              ))
            ) : (
              <span className="text-slate-400">
                No crate information
              </span>
            )}
          </div>
        </div>

        {condition && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">
              {isPickup
                ? 'Condition at pickup'
                : 'Condition at return'}
            </span>

            <span className="font-semibold text-slate-900">
              {condition}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Captain confirmation
          </span>

          <span className="font-semibold text-green-700">
            ✓ Confirmed
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Depot confirmation
          </span>

          <span className="font-semibold text-green-700">
            ✓ Confirmed
          </span>
        </div>

        {confirmedAt && (
          <p className="mt-4 text-xs text-slate-400">
            {new Date(confirmedAt).toLocaleString()}
          </p>
        )}
      </div>
    </section>
  )
}