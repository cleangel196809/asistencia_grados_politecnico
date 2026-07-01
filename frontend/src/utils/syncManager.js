import api from '../api/axios';
import { getUnsyncedScans, markScansAsSynced } from './indexedDB';

let isSyncing = false;

export const syncOfflineData = async () => {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  isSyncing = true;

  try {
    const unsynced = await getUnsyncedScans();

    if (unsynced.length === 0) {
      isSyncing = false;
      return { synced: 0, duplicates: 0, invalid: 0 };
    }

    const records = unsynced.map((scan) => ({
      qr_id: scan.qr_id,
      evento_id: scan.evento_id,
      timestamp: scan.timestamp,
      dispositivo_id: scan.dispositivo_id || 'pwa-device'
    }));

    const response = await api.post('/api/attendance/sync', records);

    const syncedIds = unsynced.map((s) => s.id);
    await markScansAsSynced(syncedIds);

    isSyncing = false;
    return response.data;
  } catch (error) {
    isSyncing = false;
    console.error('Sync error:', error);
    throw error;
  }
};

export const setupSyncOnReconnect = (callback) => {
  window.addEventListener('online', async () => {
    try {
      const result = await syncOfflineData();
      if (callback) callback(result);
    } catch (e) {
      console.error('Auto-sync failed:', e);
    }
  });
};
