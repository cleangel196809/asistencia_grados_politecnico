import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import { useOffline } from '../../hooks/useOffline';
import { getOfflineQR, markQRUsedOffline, saveOfflineScan, saveOfflineQRList } from '../../utils/indexedDB';
import { syncOfflineData } from '../../utils/syncManager';
import toast from 'react-hot-toast';
import { Download, Wifi, WifiOff } from 'lucide-react';
import QRScanner from '../../components/QRScanner';

const ScannerDashboard = () => {
  const deviceId = navigator.userAgent.substring(0, 50);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [result, setResult] = useState(null);
  const [sessionScans, setSessionScans] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const isOnline = useOffline();
  const processingRef = useRef(false);

  useEffect(() => {
    api.get('/api/events').then(r => setEvents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isOnline) {
      syncOfflineData().then(r => {
        if (r && r.synced > 0) toast.success(`Sincronizados ${r.synced} registros offline`);
      }).catch(() => {});
    }
  }, [isOnline]);

  const handleScan = async (decodedText) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      let qrData;
      try {
        qrData = JSON.parse(decodedText);
      } catch {
        setResult({ status: 'invalid', message: '⚠️ QR NO VÁLIDO', color: 'yellow' });
        setTimeout(() => { processingRef.current = false; }, 2000);
        return;
      }

      if (!selectedEvent) {
        toast.error('Seleccione un evento primero');
        processingRef.current = false;
        return;
      }

      if (isOnline) {
        const res = await api.post('/api/attendance/validate', {
          qr_id: qrData.qr_id,
          evento_id: selectedEvent,
          dispositivo_id: deviceId
        });

        const scanResult = res.data;
        setResult(scanResult);

        if (scanResult.valid) {
          const scan = {
            nombre: scanResult.nombre,
            boleta: `${scanResult.numero_boleta} de ${scanResult.total_boletas}`,
            timestamp: new Date().toISOString(),
            status: 'success'
          };
          setSessionScans(prev => [scan, ...prev]);
          setScanHistory(prev => [scan, ...prev].slice(0, 10));
          toast.success(scanResult.message);
        } else {
          toast.error(scanResult.message);
        }
      } else {
        const offlineQR = await getOfflineQR(qrData.qr_id);

        if (!offlineQR) {
          setResult({ status: 'invalid', message: '⚠️ QR NO VÁLIDO (offline)', color: 'yellow' });
        } else if (offlineQR.usado) {
          setResult({ status: 'already_used', message: `❌ QR YA UTILIZADO - ${offlineQR.nombre}`, color: 'red', nombre: offlineQR.nombre });
        } else {
          await markQRUsedOffline(qrData.qr_id);
          await saveOfflineScan({
            qr_id: qrData.qr_id,
            evento_id: selectedEvent,
            timestamp: new Date().toISOString(),
            dispositivo_id: deviceId
          });

          const scan = {
            nombre: offlineQR.nombre,
            boleta: `${offlineQR.numero_boleta} de ${offlineQR.total_boletas}`,
            timestamp: new Date().toISOString(),
            status: 'success'
          };
          setSessionScans(prev => [scan, ...prev]);
          setScanHistory(prev => [scan, ...prev].slice(0, 10));
          setResult({ valid: true, status: 'success', message: `✅ Bienvenido ${offlineQR.nombre}`, nombre: offlineQR.nombre, programa: offlineQR.programa, sede: offlineQR.sede, numero_boleta: offlineQR.numero_boleta, total_boletas: offlineQR.total_boletas });
          toast.success(`Bienvenido ${offlineQR.nombre}`);
        }
      }
    } catch (error) {
      setResult({ status: 'error', message: 'Error procesando QR', color: 'red' });
    } finally {
      setTimeout(() => {
        processingRef.current = false;
        setResult(null);
      }, 3000);
    }
  };

  const downloadOfflineList = async () => {
    if (!selectedEvent) { toast.error('Seleccione un evento'); return; }
    try {
      const res = await api.get(`/api/qr/offline-list/${selectedEvent}`);
      await saveOfflineQRList(selectedEvent, res.data);
      toast.success(`${res.data.length} QR descargados para uso offline`);
    } catch { toast.error('Error descargando lista offline'); }
  };

  const getResultColor = () => {
    if (!result) return '';
    if (result.valid || result.status === 'success') return 'bg-green-50 border-green-400';
    if (result.status === 'already_used') return 'bg-red-50 border-red-400';
    return 'bg-yellow-50 border-yellow-400';
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Scanner de QR</h1>

      <div className="flex gap-3 items-center">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
          {isOnline ? 'ONLINE 🟢' : 'OFFLINE 🔴'}
        </div>
      </div>

      <div className="flex gap-3">
        <select className="flex-1 border rounded-lg px-3 py-2 text-sm" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
          <option value="">-- Seleccione evento --</option>
          {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
        </select>
        <button onClick={downloadOfflineList} disabled={!isOnline || !selectedEvent}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700 disabled:opacity-40">
          <Download size={16} /> Offline
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-3">
        <QRScanner onScan={handleScan} onError={() => {}} />
      </div>

      {result && (
        <div className={`rounded-xl border-2 p-4 ${getResultColor()}`}>
          <p className="font-bold text-lg">{result.message}</p>
          {result.valid && (
            <div className="mt-2 text-sm space-y-1">
              {result.nombre && <p>👤 {result.nombre}</p>}
              {result.programa && <p>📚 {result.programa}</p>}
              {result.sede && <p>🏫 {result.sede}</p>}
              {result.numero_boleta && <p>🎫 Boleta {result.numero_boleta} de {result.total_boletas}</p>}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4">
        <p className="font-semibold text-gray-700 mb-2">QRs usados en esta sesión: <span className="text-blue-600">{sessionScans.length}</span></p>
        <h3 className="text-sm font-medium text-gray-600 mb-2">Últimos 10 escaneos:</h3>
        <ul className="space-y-1">
          {scanHistory.map((scan, i) => (
            <li key={i} className="text-sm flex justify-between items-center border-b pb-1">
              <span className="font-medium text-green-700">✓ {scan.nombre}</span>
              <span className="text-gray-400 text-xs">{new Date(scan.timestamp).toLocaleTimeString()}</span>
            </li>
          ))}
          {scanHistory.length === 0 && <li className="text-gray-400 text-sm">Sin escaneos aún</li>}
        </ul>
      </div>
    </div>
  );
};

export default ScannerDashboard;
