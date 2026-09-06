type HeaderProps = {
  onLogout?: () => void
}

function Header({ onLogout }: HeaderProps) {
    return (
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              DockFlow
            </h1>
  
            <p className="text-xs text-slate-500">
              Dockside coordination
            </p>
          </div>
  
          <div className="flex items-center gap-2">
            {onLogout && (
              <button
                onClick={onLogout}
                className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"
              >
                Sign out
              </button>
            )}
            <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
  
            <span className="text-xs font-medium text-green-700">
              Online
            </span>
            </div>
          </div>
        </div>
      </header>
    )
  }
  
  export default Header
