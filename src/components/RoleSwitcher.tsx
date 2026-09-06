type Role = 'CAPTAIN' | 'DEPOT'

type RoleSwitcherProps = {
  role: Role
  onChange: (role: Role) => void
}

function RoleSwitcher({
  role,
  onChange,
}: RoleSwitcherProps) {
  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <div className="flex rounded-xl bg-slate-200 p-1">
        <button
          onClick={() => onChange('CAPTAIN')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            role === 'CAPTAIN'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          Captain
        </button>

        <button
          onClick={() => onChange('DEPOT')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            role === 'DEPOT'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          Depot
        </button>
      </div>
    </div>
  )
}

export default RoleSwitcher