import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FileDown, Users, QrCode, CheckCircle, Clock } from 'lucide-react';

const Reports = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/events').then(r => setEvents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEvent) {
      setSummary(null);
      return;
    }

    const loadSummary = async () => {
      try {
        const res = await api.get(`/api/reports/summary/${selectedEvent}`);
        setSummary(res.data);
      } catch {}
    };

    loadSummary();
  }, [selectedEvent]);

  const downloadReport = async (type) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/reports/${type}/${selectedEvent}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_${selectedEvent}.xlsx`);
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Reporte descargado');
    } catch { toast.error('Error generando reporte'); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Reportes</h1>

      <div className="bg-white rounded-xl shadow p-6">
        <label className="block text-sm font-medium mb-1">Seleccionar Evento</label>
        <select className="w-full border rounded-lg px-3 py-2 mb-4" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
          <option value="">-- Seleccione un evento --</option>
          {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
        </select>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Participantes', value: summary.total_participants, icon: Users, color: 'bg-blue-500' },
              { label: 'Total QR', value: summary.total_qr, icon: QrCode, color: 'bg-purple-500' },
              { label: 'QR Usados', value: summary.used_qr, icon: CheckCircle, color: 'bg-green-500' },
              { label: 'Pendientes', value: summary.pending_qr, icon: Clock, color: 'bg-orange-500' },
            ].map(card => (
              <div key={card.label} className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
                <div className={`${card.color} p-2 rounded-lg text-white`}><card.icon size={20} /></div>
                <div>
                  <p className="text-xl font-bold">{card.value}</p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {summary && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span>Porcentaje de asistencia</span>
              <span className="font-bold">{summary.porcentaje_asistencia}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${summary.porcentaje_asistencia}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-4 flex-wrap">
          <button onClick={() => downloadReport('final')} disabled={!selectedEvent || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
            <FileDown size={18} /> Informe Final
          </button>
          <button onClick={() => downloadReport('attendance')} disabled={!selectedEvent || loading}
            className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50">
            <FileDown size={18} /> Reporte Asistencia
          </button>
          <button onClick={() => downloadReport('pending')} disabled={!selectedEvent || loading}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-700 disabled:opacity-50">
            <FileDown size={18} /> Reporte Pendientes
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reports;
