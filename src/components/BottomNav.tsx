type BottomNavProps = {
  onHome?: () => void
  onReserve?: () => void
  onActivity: () => void
}

function BottomNav({
  onHome,
  onReserve,
  onActivity,
}: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-md justify-around">
        <button
          onClick={onHome}
          className="flex min-h-16 flex-1 flex-col items-center justify-center text-sm font-medium text-slate-900"
        >
          <span className="text-lg">⌂</span>
          Home
        </button>

        <button
          onClick={onReserve}
          className="flex min-h-16 flex-1 flex-col items-center justify-center text-sm font-medium text-slate-500"
        >
          <span className="text-lg">+</span>
          Reserve
        </button>

        <button
          onClick={onActivity}
          className="flex min-h-16 flex-1 flex-col items-center justify-center text-sm font-medium text-slate-500"
        >
          <span className="text-lg">≡</span>
          Activity
        </button>
      </div>
    </nav>
  )
}

export default BottomNav
