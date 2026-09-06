import { syncPendingEvents } from './sync'

let syncRunning = false

async function runSync() {
  if (syncRunning || !navigator.onLine) {
    return
  }

  syncRunning = true

  try {
    await syncPendingEvents()
  } finally {
    syncRunning = false
  }
}

export function startSyncManager() {
  const handleOnline = () => {
    void runSync()
  }

  window.addEventListener('online', handleOnline)

  if (navigator.onLine) {
    void runSync()
  }

  return () => {
    window.removeEventListener('online', handleOnline)
  }
}