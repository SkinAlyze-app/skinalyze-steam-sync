import { getStorage } from '@/lib/storage';

export const PERIODIC_SYNC_ALARM = 'skinalyze_periodic_sync';

/** Fixed background interval (minutes); matches EFFECTIVE_AUTOMATION_SETTINGS.periodicIntervalMinutes. */
export const PERIODIC_SYNC_INTERVAL_MINUTES = 20;

/**
 * (Re)create the periodic sync alarm at a fixed interval when the extension is paired.
 * When not paired, clears the alarm to avoid unnecessary wakeups.
 */
export async function applyPeriodicSyncAlarm(): Promise<void> {
  await chrome.alarms.clear(PERIODIC_SYNC_ALARM);
  const st = await getStorage();
  if (st.pairings.length === 0) return;
  await chrome.alarms.create(PERIODIC_SYNC_ALARM, { periodInMinutes: PERIODIC_SYNC_INTERVAL_MINUTES });
}

export function registerPeriodicSync(): void {
  void applyPeriodicSyncAlarm();
}

export function onAlarm(listener: (name: string) => void): void {
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === PERIODIC_SYNC_ALARM) listener(PERIODIC_SYNC_ALARM);
  });
}
