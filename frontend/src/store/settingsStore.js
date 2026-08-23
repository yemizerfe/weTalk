import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Tiny beep using Web Audio API — no external file needed
function playBeep() {
  try {
    // Use a shared/resumable AudioContext to improve reliability
    if (!window.__wetalkAudioCtx) {
      window.__wetalkAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = window.__wetalkAudioCtx
    // Try to resume context if suspended (may require a user gesture in some browsers)
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {})
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch (_) {}
}

export function playMessageSound() {
  const state = useSettingsStore.getState()
  if (state.sounds) playBeep()
}

export function showMessageNotification(title, body) {
  const state = useSettingsStore.getState()
  if (!state.notifications) return
  if (document.hasFocus()) return // don't notify if app is focused
  if (Notification.permission === 'granted') {
    const n = new Notification(title, {
      body: state.messagePreview ? body : 'New message',
      icon: '/favicon.ico',
    })
    setTimeout(() => n.close(), 4000)
  }
}

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      notifications: false, // starts false until user grants permission
      sounds: true,
      darkMode: false,
      readReceipts: true,
      lastSeen: true,
      messagePreview: true,
      enterToSend: true,
      fontSize: 'medium',

      setNotifications: async (v) => {
        if (v && Notification.permission === 'default') {
          const perm = await Notification.requestPermission()
          set({ notifications: perm === 'granted' })
        } else if (v && Notification.permission === 'denied') {
          // Can't enable — browser blocked it
          set({ notifications: false })
          alert('Notifications are blocked by your browser. Please enable them in site settings.')
        } else {
          set({ notifications: v })
        }
      },

      setSounds: (v) => {
        set({ sounds: v })
        // Attempt to unlock audio on enabling sounds
        if (v && typeof window !== 'undefined' && window.__wetalkAudioCtx && window.__wetalkAudioCtx.state === 'suspended') {
          window.__wetalkAudioCtx.resume().catch(() => {})
        }
      },

      setDarkMode: (v) => {
        set({ darkMode: v })
        document.documentElement.classList.toggle('dark', v)
      },

      setReadReceipts: (v) => set({ readReceipts: v }),
      setLastSeen: (v) => set({ lastSeen: v }),
      setMessagePreview: (v) => set({ messagePreview: v }),
      setEnterToSend: (v) => set({ enterToSend: v }),
      setFontSize: (v) => {
        set({ fontSize: v })
        document.documentElement.className = document.documentElement.className
          .replace(/font-size-\S+/g, '').trim()
        document.documentElement.classList.add(`font-size-${v}`)
      },
    }),
    {
      name: 'wetalk-settings',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle('dark', !!state.darkMode)
          const size = state.fontSize || 'medium'
          document.documentElement.className = document.documentElement.className
            .replace(/font-size-\S+/g, '').trim()
          document.documentElement.classList.add(`font-size-${size}`)
        }
      },
    }
  )
)
