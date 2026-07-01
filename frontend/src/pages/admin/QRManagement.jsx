import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { QrCode, MessageCircle, Mail, Download } from 'lucide-react';

const QRManagement = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [qrList, setQrList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [waNumber, setWaNumber] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    api.get('/api/events').then(r => setEvents(r.data)).catch(() => {});
  }, []);

  const loadQRList = useCallback(async () => {
    if (!selectedEvent) return;

    setLoading(true);
    try {
      const res = await api.get(`/api/qr/list/${selectedEvent}`);
      setQrList(res.data);
    } catch { toast.error('Error cargando QR'); }
    finally { setLoading(false); }
  }, [selectedEvent]);

  useEffect(() => {
    loadQRList();
  }, [loadQRList]);

  const generateQR = async () => {
    if (!selectedEvent) { toast.error('Seleccione un evento'); return; }
    setGenerating(true);
    try {
      const res = await api.post(`/api/qr/generate/${selectedEvent}`);
      toast.success(`${res.data.count} QR generados`);
      loadQRList();
    } catch { toast.error('Error generando QR'); }
    finally { setGenerating(false); }
  };

  const sendWhatsApp = async () => {
    setSendingWA(true);
    try {
      const res = await api.post('/api/qr/send-whatsapp', { evento_id: selectedEvent, from_number: waNumber });
      toast.success(`${res.data.count} mensajes enviados por WhatsApp`);
      loadQRList();
    } catch { toast.error('Error enviando WhatsApp'); }
    finally { setSendingWA(false); }
  };

  const sendEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await api.post('/api/qr/send-email', { evento_id: selectedEvent, from_email: emailFrom });
      toast.success(`${res.data.count} emails enviados`);
      loadQRList();
    } catch { toast.error('Error enviando emails'); }
    finally { setSendingEmail(false); }
  };

  const downloadQR = (qr) => {
    if (!qr.imagen_qr_base64) { toast.error('Sin imagen disponible'); return; }
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${qr.imagen_qr_base64}`;
    link.download = `QR_${qr.cedula}_boleta${qr.numero_boleta}.png`;
    link.click();
  };

  const used = qrList.filter(q => q.usado).length;
  const pending = qrList.filter(q => !q.usado).length;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Gestión de Códigos QR</h1>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium mb-1">Evento</label>
            <select className="w-full border rounded-lg px-3 py-2" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
              <option value="">-- Seleccione --</option>
              {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
            </select>
          </div>
          <button onClick={generateQR} disabled={!selectedEvent || generating}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-700 disabled:opacity-50">
            <QrCode size={18} /> {generating ? 'Generando...' : 'Generar QR Masivo'}
          </button>
        </div>

        {selectedEvent && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><MessageCircle size={18} className="text-green-600" /> Envío Masivo WhatsApp</h3>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+57XXXXXXXXXX (número origen)" value={waNumber} onChange={e => setWaNumber(e.target.value)} />
              <button onClick={sendWhatsApp} disabled={sendingWA}
                className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {sendingWA ? 'Enviando...' : 'Enviar Masivo WhatsApp'}
              </button>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Mail size={18} className="text-blue-600" /> Envío Masivo Email</h3>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="correo@dominio.com" type="email" value={emailFrom} onChange={e => setEmailFrom(e.target.value)} />
              <button onClick={sendEmail} disabled={sendingEmail}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {sendingEmail ? 'Enviando...' : 'Enviar Masivo Email'}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedEvent && loading && <div className="text-sm text-gray-500">Cargando códigos QR...</div>}

      {qrList.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex gap-4 mb-4">
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">✓ Usados: {used}</span>
            <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm">⏳ Pendientes: {pending}</span>
            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">Total: {qrList.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>{['Participante', 'Cédula', 'Boleta', 'Estado', 'WA', 'Email', 'Descargar'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-700">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {qrList.map(qr => (
                  <tr key={qr._id || qr.qr_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{qr.participante_nombre || ''}</td>
                    <td className="px-3 py-2">{qr.cedula}</td>
                    <td className="px-3 py-2">{qr.numero_boleta}/{qr.total_boletas}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${qr.usado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {qr.usado ? '✓ Usado' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{qr.enviado_whatsapp ? '✓' : '✗'}</td>
                    <td className="px-3 py-2">{qr.enviado_email ? '✓' : '✗'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => downloadQR(qr)} className="text-blue-600 hover:text-blue-800">
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRManagement;
