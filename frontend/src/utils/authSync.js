// Cross-tab logout synchronization
// Uses localStorage as a signal channel between tabs.
// The actual token lives in an httpOnly cookie (not accessible via JS),
// so we use a localStorage flag to notify other tabs when logout happens.

const LOGOUT_EVENT_KEY = 'wetalk-logout-event'

// Set a logout signal so other tabs can detect it via the 'storage' event.
export const broadcastLogout = () => {
  try {
    // Use a timestamp so the value changes even if logout happens twice in a row
    localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()))
  } catch (_) {
    // localStorage may be unavailable (e.g. private mode) — ignore
  }
}

// Listen for logout signals from other tabs.
// Returns an unsubscribe function.
export const subscribeToLogout = (handler) => {
  const onStorage = (e) => {
    if (e.key === LOGOUT_EVENT_KEY && e.newValue) {
      handler()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}