import Header from './components/Header'
import BottomNav from './components/BottomNav'

function App() {
  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <Header />

      <main className="mx-auto max-w-md px-4 py-6">
        <section className="mb-6">
          <p className="text-sm text-slate-500">Good morning, Captain</p>

          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Ready for the dock?
          </h2>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-sm font-medium text-slate-500">
              My reservation
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-900">
              No active reservation
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Reserve ice and crate sets before heading to sea.
            </p>
          </div>

          <button className="min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98]">
            Reserve resources
          </button>
        </section>

        <section className="mt-6">
          <h3 className="mb-3 text-lg font-bold text-slate-900">
            Today's activity
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Crate sets</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">4</p>
              <p className="mt-1 text-xs text-slate-500">
                allocated today
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Ice blocks</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">20</p>
              <p className="mt-1 text-xs text-slate-500">
                reserved today
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Dock status
          </p>

          <p className="mt-1 text-sm text-amber-800">
            All systems ready. Your data will continue working if the
            connection drops.
          </p>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}

export default App