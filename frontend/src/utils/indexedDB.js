import Dexie from 'dexie';

const db = new Dexie('PolitecnicoGradosDB');

db.version(1).stores({
  offline_qr_list: 'qr_id, cedula, evento_id, usado',
  offline_scans: '++id, qr_id, evento_id, sincronizado',
  offline_config: 'id, evento_id'
});

export const saveOfflineQRList = async (eventoId, qrList) => {
  await db.offline_qr_list.bulkPut(qrList);
  await db.offline_config.put({
    id: `config_${eventoId}`,
    evento_id: eventoId,
    downloaded_at: new Date().toISOString(),
    last_sync: new Date().toISOString()
  });
};

export const getOfflineQR = async (qrId) => {
  return await db.offline_qr_list.get(qrId);
};

export const markQRUsedOffline = async (qrId) => {
  await db.offline_qr_list.update(qrId, {
    usado: true,
    fecha_uso: new Date().toISOString()
  });
};

export const saveOfflineScan = async (scan) => {
  return await db.offline_scans.add({
    ...scan,
    sincronizado: false
  });
};

export const getUnsyncedScans = async () => {
  return await db.offline_scans.where('sincronizado').equals(false).toArray();
};

export const markScansAsSynced = async (ids) => {
  for (const id of ids) {
    await db.offline_scans.update(id, { sincronizado: true });
  }
};

export const getOfflineConfig = async (eventoId) => {
  return await db.offline_config.get(`config_${eventoId}`);
};

export default db;
