import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase/client'

function AuthScreen() {
  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const result =
      mode === 'LOGIN'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    if (mode === 'SIGNUP') {
      setMessage(
        'Account created. Ask an administrator to assign your DockFlow profile before signing in.'
      )
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <main className="mx-auto max-w-md">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">DockFlow</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {mode === 'LOGIN' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Use your dock-issued email and password.
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === 'LOGIN' ? 'current-password' : 'new-password'
                }
                minLength={6}
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900"
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
                {message}
              </p>
            )}

            <button
              disabled={loading}
              className="min-h-12 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading
                ? 'Please wait...'
                : mode === 'LOGIN'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((current) =>
                current === 'LOGIN' ? 'SIGNUP' : 'LOGIN'
              )
              setError('')
              setMessage('')
            }}
            className="mt-5 w-full text-sm font-semibold text-slate-700"
          >
            {mode === 'LOGIN'
              ? 'Need an account? Create one'
              : 'Already have an account? Sign in'}
          </button>
        </section>
      </main>
    </div>
  )
}

export default AuthScreen
