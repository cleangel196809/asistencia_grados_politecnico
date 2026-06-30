import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Search, MessageCircle, Mail } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const IndividualInvitation = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [search, setSearch] = useState('');
  const [participants, setParticipants] = useState([]);
  const [found, setFound] = useState(null);
  const [qrList, setQrList] = useState([]);
  const [sending, setSending] = useState({});

  useEffect(() => {
    api.get('/api/events').then(r => setEvents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      api.get(`/api/participants/${selectedEvent}`).then(r => setParticipants(r.data)).catch(() => {});
    }
  }, [selectedEvent]);

  const handleSearch = () => {
    const term = search.toLowerCase();
    const result = participants.find(p =>
      String(p.no_documento).toLowerCase().includes(term) || p.apellidos_nombres.toLowerCase().includes(term)
    );
    if (result) {
      setFound(result);
      api.get(`/api/qr/list/${selectedEvent}`).then(r => {
        setQrList(r.data.filter(q => q.participante_id === result._id));
      }).catch(() => {});
    } else {
      toast.error('Participante no encontrado');
      setFound(null);
      setQrList([]);
    }
  };

  const sendWhatsApp = async (qrId) => {
    setSending(s => ({ ...s, [qrId]: 'wa' }));
    try {
      await api.post(`/api/qr/send-individual-whatsapp/${qrId}`);
      toast.success('QR enviado por WhatsApp');
    } catch { toast.error('Error enviando WhatsApp'); }
    finally { setSending(s => ({ ...s, [qrId]: null })); }
  };

  const sendEmail = async (qrId) => {
    setSending(s => ({ ...s, [qrId]: 'email' }));
    try {
      await api.post('/api/qr/send-email', { evento_id: selectedEvent, qr_id: qrId });
      toast.success('Invitación enviada por email');
    } catch { toast.error('Error enviando email'); }
    finally { setSending(s => ({ ...s, [qrId]: null })); }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Invitación Individual</h1>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="flex gap-4">
          <select className="border rounded-lg px-3 py-2 w-64" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
            <option value="">-- Evento --</option>
            {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
          </select>
          <div className="flex flex-1 gap-2">
            <input className="flex-1 border rounded-lg px-3 py-2" placeholder="Buscar por cédula o nombre..." value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <button onClick={handleSearch} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
              <Search size={18} /> Buscar
            </button>
          </div>
        </div>

        {found && (
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold text-gray-800 mb-2">{found.apellidos_nombres}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
              <p>📋 {found.no_documento}</p>
              <p>🏫 {found.sede}</p>
              <p>📚 {found.programa}</p>
              <p>📱 {found.tel1}</p>
              <p>📧 {found.email_institucional}</p>
              <p>📅 {found.cohorte}</p>
            </div>
          </div>
        )}

        {qrList.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {qrList.map(qr => (
              <div key={qr.qr_id} className={`border rounded-lg p-4 ${qr.usado ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                <div className="flex items-start gap-4">
                  <div className="bg-white p-2 border rounded">
                    <QRCodeSVG value={JSON.stringify({ qr_id: qr.qr_id, evento_id: qr.evento_id, cedula: qr.cedula, numero_boleta: qr.numero_boleta, total_boletas: qr.total_boletas })} size={80} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">Boleta #{qr.numero_boleta} de {qr.total_boletas}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${qr.usado ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {qr.usado ? `Usado: ${qr.hora_uso}` : 'Pendiente'}
                    </span>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => sendWhatsApp(qr.qr_id)} disabled={sending[qr.qr_id] === 'wa'}
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-green-700 disabled:opacity-50">
                        <MessageCircle size={12} /> WhatsApp
                      </button>
                      <button onClick={() => sendEmail(qr.qr_id)} disabled={sending[qr.qr_id] === 'email'}
                        className="bg-blue-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-blue-700 disabled:opacity-50">
                        <Mail size={12} /> Email
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndividualInvitation;
