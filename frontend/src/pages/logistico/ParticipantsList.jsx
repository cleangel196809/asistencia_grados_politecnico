import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight } from 'lucide-react';

const ParticipantsList = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [participants, setParticipants] = useState([]);
  const [qrByParticipant, setQrByParticipant] = useState({});
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    api.get('/api/events').then(r => setEvents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;

    const loadParticipants = async () => {
      try {
        const res = await api.get(`/api/participants/${selectedEvent}`);
        setParticipants(res.data);
        const qrRes = await api.get(`/api/qr/list/${selectedEvent}`);
        const byParticipant = {};
        qrRes.data.forEach(qr => {
          if (!byParticipant[qr.participante_id]) byParticipant[qr.participante_id] = [];
          byParticipant[qr.participante_id].push(qr);
        });
        setQrByParticipant(byParticipant);
      } catch { toast.error('Error cargando participantes'); }
    };

    loadParticipants();
  }, [selectedEvent]);

  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Lista de Participantes</h1>

      <select className="border rounded-lg px-3 py-2 w-full max-w-sm" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
        <option value="">-- Seleccione evento --</option>
        {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
      </select>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{['', 'Nombre', 'Cédula', 'Programa', 'Sede', 'Tel', 'Email', 'QR'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-700">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {participants.map(p => {
              const pqr = qrByParticipant[p._id] || [];
              const usedCount = pqr.filter(q => q.usado).length;
              const isExpanded = expanded[p._id];
              return (
                <React.Fragment key={p._id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 cursor-pointer" onClick={() => toggleExpand(p._id)}>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="px-3 py-2 font-medium">{p.apellidos_nombres}</td>
                    <td className="px-3 py-2">{p.no_documento}</td>
                    <td className="px-3 py-2">{p.programa}</td>
                    <td className="px-3 py-2">{p.sede}</td>
                    <td className="px-3 py-2">{p.tel1}</td>
                    <td className="px-3 py-2">{p.email_institucional}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${usedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {usedCount}/{pqr.length} usados
                      </span>
                    </td>
                  </tr>
                  {isExpanded && pqr.map(qr => (
                    <tr key={qr.qr_id} className="bg-blue-50">
                      <td />
                      <td colSpan={7} className="px-6 py-2 text-xs">
                        <span className="font-medium">Boleta {qr.numero_boleta}/{qr.total_boletas}</span>
                        {qr.usado ? (
                          <span className="ml-3 text-green-600">✓ Usado - {qr.hora_uso} del {qr.fecha_uso}</span>
                        ) : (
                          <span className="ml-3 text-orange-600">⏳ Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ParticipantsList;
