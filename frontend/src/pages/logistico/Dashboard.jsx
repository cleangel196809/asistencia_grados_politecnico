import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useWebSocket } from '../../hooks/useWebSocket';

const LogisticoDashboard = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [summary, setSummary] = useState(null);
  const { messages } = useWebSocket(selectedEvent);

  useEffect(() => {
    api.get('/api/events').then(r => { setEvents(r.data); if (r.data.length > 0) setSelectedEvent(r.data[0]._id); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      api.get(`/api/reports/summary/${selectedEvent}`).then(r => setSummary(r.data)).catch(() => {});
    }
  }, [selectedEvent]);

  const porcentaje = summary ? summary.porcentaje_asistencia : 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Panel Logístico</h1>

      <div>
        <label className="block text-sm font-medium mb-1">Evento Activo</label>
        <select className="border rounded-lg px-3 py-2 w-full max-w-sm" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
          {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-5 text-center">
            <p className="text-3xl font-bold text-blue-600">{summary.total_qr}</p>
            <p className="text-gray-500">Total Invitaciones</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5 text-center">
            <p className="text-3xl font-bold text-green-600">{summary.used_qr}</p>
            <p className="text-gray-500">Utilizadas</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5 text-center">
            <p className="text-3xl font-bold text-orange-600">{summary.pending_qr}</p>
            <p className="text-gray-500">Pendientes</p>
          </div>
        </div>
      )}

      {summary && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex justify-between mb-2">
            <span className="font-medium">Progreso de Asistencia</span>
            <span className="font-bold text-green-600">{porcentaje}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-6">
            <div className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(porcentaje, 3)}%` }}>
              <span className="text-white text-xs font-bold">{porcentaje}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-semibold mb-3">Últimos 10 Escaneos</h2>
        {messages.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin escaneos recientes</p>
        ) : (
          <ul className="space-y-2">
            {messages.slice(0, 10).map((msg, i) => (
              <li key={i} className="flex items-center gap-3 text-sm border-b pb-2">
                <span className="text-green-600 font-bold">✓</span>
                <span className="font-medium">{msg.nombre}</span>
                <span className="text-gray-400">Boleta {msg.boleta}</span>
                <span className="text-gray-400 ml-auto">{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LogisticoDashboard;
