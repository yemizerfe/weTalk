import { useSettingsStore } from '../store/settingsStore';

/**
 * Initialize browser notifications on app load.
 * Requests permission if needed and syncs the settings store state.
 */
export async function initializeNotifications() {
  try {
    const { notifications, setNotifications } = useSettingsStore.getState();

    // If notifications are already enabled, nothing to do
    if (notifications) return;

    // If permission is default (not yet asked), request it
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifications(true);
      }
    }
    // If denied, leave disabled (user can enable in settings if they change browser permissions)
  } catch (err) {
    // Browser doesn't support notifications — silently ignore
    console.warn('Notifications unavailable:', err);
  }
}