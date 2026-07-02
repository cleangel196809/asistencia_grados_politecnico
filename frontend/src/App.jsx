import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { get, set } from 'idb-keyval';
import { registerSW } from 'virtual:pwa-register';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

const AUTH_STORAGE_KEY = 'attendance_auth';
let currentToken = null;

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      currentToken = null;
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  },
);

function loadStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token) {
      currentToken = parsed.token;
      return { username: parsed.username, role: parsed.role };
    }
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return null;
}

function persistAuth(data) {
  currentToken = data.access_token;
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ token: data.access_token, username: data.username, role: data.role }),
  );
}

function clearAuth() {
  currentToken = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

const PARTICIPANTS_PREFIX = 'participants:';
const QUEUE_KEY = 'attendance-queue';
const ROLE_ADMIN = 'ADMIN';
const ROLE_LOGISTICO = 'LOGISTICO';
const ROLE_SCANNER = 'SCANNER';
const ROUTE_FOR_ROLE = {
  [ROLE_ADMIN]: '/admin',
  [ROLE_LOGISTICO]: '/logistico',
  [ROLE_SCANNER]: '/scanner',
};

const getDashboardPath = (role) => ROUTE_FOR_ROLE[role] || '/';

function LoginScreen({ onLogin }) {

  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState({ username: '', password: '', role: ROLE_ADMIN });
  const [error, setError] = useState('');


  const submit = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/login', loginForm);
      onLogin(data);
      navigate(getDashboardPath(data.role));
    } catch (err) {
      setError('Credenciales inválidas o rol incorrecto.');
    }
  };

  return (
    <div className="card">
      <h2>Ingresar al panel</h2>
      <p>Seleccione el rol para abrir el layout correspondiente.</p>
      <form onSubmit={submit} className="stack">
        <input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="Usuario" />
        <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Contraseña" />
        <select value={loginForm.role} onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}>
          <option value={ROLE_ADMIN}>Administrador</option>
          <option value={ROLE_LOGISTICO}>Logístico</option>
          <option value={ROLE_SCANNER}>Scanner</option>
        </select>
        <button type="submit">Ingresar</button>
      </form>
      {error && <div className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</div>}
    </div>
  );
}

import AdminLayoutFiveSteps from './AdminLayoutFiveSteps.jsx';

function AdminPage({ user, onLogout }) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [participants, setParticipants] = useState([]);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('');
  const [eventForm, setEventForm] = useState({ name: '', date: '', location: '', schedule: '', capacity: 100, mode: 'ONLINE', tickets_per_participant: 1 });
  const [participantForm, setParticipantForm] = useState({ name: '', cedula: '', email: '', phone: '', ticket_count: 1, sede: '', programa: '', cohorte: '', promedio: '' });
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', role: ROLE_LOGISTICO });
  const [adminSendSettings, setAdminSendSettings] = useState({ emailFrom: '', whatsappFrom: '' });
  const [uploading, setUploading] = useState(false);
  const [qrPreview, setQrPreview] = useState(null);
  const [bulkQrPreview, setBulkQrPreview] = useState(null);
  const [isGeneratingBulkQr, setIsGeneratingBulkQr] = useState(false);
  const [massInvitationText, setMassInvitationText] = useState('');
  const [isCreatingMassInvitations, setIsCreatingMassInvitations] = useState(false);
  const [massInvitationResult, setMassInvitationResult] = useState(null);
  const [invitationTemplate, setInvitationTemplate] = useState({ exists: false, size_bytes: 0 });
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ role: '', password: '' });


  const getErrorDetail = (error, fallbackMessage) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
      return detail.map((item) => item?.msg || String(item)).join(' | ');
    }
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    return fallbackMessage;
  };

  const buildUploadTroubleshootingHint = (error) => {
    const statusCode = error?.response?.status;
    if (statusCode === 400) {
      return 'Revisa que el archivo sea PDF válido y vuelva a intentar.';
    }
    if (statusCode === 404) {
      return 'La app parece desactualizada. Recarga con Ctrl+F5 e intenta de nuevo.';
    }
    if (statusCode === 413) {
      return 'El archivo es demasiado grande. Usa un PDF más liviano.';
    }
    if (error?.code === 'ERR_NETWORK') {
      return 'No hay conexión con el backend. Verifica que el servicio esté activo en el puerto 8000.';
    }
    return 'Si persiste, recarga la PWA (Ctrl+F5) y vuelve a intentar.';
  };

  const detectMassDelimiter = (line) => {
    const candidates = [';', ',', '\t', '|'];
    let selected = ';';
    let bestCount = -1;
    candidates.forEach((delimiter) => {
      const escaped = delimiter === '\t' ? '\\t' : delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const count = (line.match(new RegExp(escaped, 'g')) || []).length;
      if (count > bestCount) {
        bestCount = count;
        selected = delimiter;
      }
    });
    return selected;
  };

  const splitMassLine = (line) => {
    const delimiter = detectMassDelimiter(line);
    return line.split(delimiter).map((item) => item.trim());
  };

  const parseMassInvitationInput = (text) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed = lines.map((line, index) => {
      const columns = splitMassLine(line);
      const [name = '', cedula = '', email = '', phone = '', programa = '', sede = '', cohorte = '', promedio = '', ticketCount = '1'] = columns;
      const isValid = Boolean(name && cedula);
      return {
        index: index + 1,
        raw: line,
        name,
        cedula,
        email,
        phone,
        programa,
        sede,
        cohorte,
        promedio,
        ticketCount,
        separator: detectMassDelimiter(line),
        isValid,
      };
    });

    const valid = parsed.filter((item) => item.isValid);
    const invalid = parsed.filter((item) => !item.isValid);

    return {
      lines,
      parsed,
      valid,
      invalid,
    };
  };

  const massInvitationPreview = useMemo(() => parseMassInvitationInput(massInvitationText), [massInvitationText]);

  const loadEvents = async () => {
    const { data } = await api.get('/events');
    setEvents(data);
    if (!selectedEventId && data.length) {
      setSelectedEventId(data[0].id);
    }
  };

  const loadParticipants = async (eventId) => {
    if (!eventId) return;
    const { data } = await api.get(`/events/${eventId}/participants`);
    setParticipants(data);
  };

  const loadUsers = async () => {
    const { data } = await api.get('/users');
    setUsers(data);
  };

  const loadInvitationTemplateStatus = async () => {
    try {
      const { data } = await api.get('/invitations/template');
      setInvitationTemplate({
        exists: Boolean(data?.exists),
        size_bytes: Number(data?.size_bytes || 0),
      });
    } catch (error) {
      setInvitationTemplate({ exists: false, size_bytes: 0 });
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadInvitationTemplateStatus();
  }, []);

  useEffect(() => {
    const loadEmailStatus = async () => {
      try {
        const { data } = await api.get('/invitations/email/status');
        setEmailConfigured(Boolean(data?.configured));
      } catch (error) {
        setEmailConfigured(false);
      }
    };
    loadEmailStatus();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    loadParticipants(selectedEventId);
  }, [selectedEventId]);

  const createEvent = async (event) => {
    event.preventDefault();
    await api.post('/events', eventForm);
    setStatus('Evento creado correctamente.');
    setEventForm({ name: '', date: '', location: '', schedule: '', capacity: 100, mode: 'ONLINE', tickets_per_participant: 1 });
    await loadEvents();
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes de crear la invitación.');
      return;
    }
    await api.post('/participants', { ...participantForm, event_id: selectedEventId });
    setStatus('Invitación creada correctamente.');
    setParticipantForm({ name: '', cedula: '', email: '', phone: '', ticket_count: 1, sede: '', programa: '', cohorte: '', promedio: '' });
    await loadParticipants(selectedEventId);
  };

  const uploadExcel = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedEventId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    await api.post(`/participants/import?event_id=${selectedEventId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    setStatus('Participantes importados correctamente.');
    setUploading(false);
    await loadParticipants(selectedEventId);
  };

  const removeParticipant = async (participantId) => {
    await api.delete(`/participants/${participantId}`);
    setStatus('Participante eliminado.');
    await loadParticipants(selectedEventId);
  };

  const createUser = async (event) => {
    event.preventDefault();
    await api.post('/users', newUserForm);
    setStatus('Usuario creado correctamente.');
    setNewUserForm({ username: '', password: '', role: ROLE_LOGISTICO });
    await loadUsers();
  };

  const removeUser = async (userId) => {
    await api.delete(`/users/${userId}`);
    setStatus('Usuario eliminado.');
    await loadUsers();
  };

  const startEditUser = (targetUser) => {
    setEditingUserId(targetUser.id);
    setEditUserForm({ role: targetUser.role, password: '' });
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
    setEditUserForm({ role: '', password: '' });
  };

  const saveEditUser = async () => {
    const changes = {};
    if (editUserForm.role) changes.role = editUserForm.role;
    if (editUserForm.password) changes.password = editUserForm.password;
    if (!Object.keys(changes).length) {
      cancelEditUser();
      return;
    }
    await api.put(`/users/${editingUserId}`, changes);
    setStatus('Usuario actualizado correctamente.');
    cancelEditUser();
    await loadUsers();
  };

  const deleteEvent = async (eventId) => {
    await api.delete(`/events/${eventId}`);
    setStatus('Evento eliminado correctamente.');
    if (selectedEventId === eventId) {
      setSelectedEventId('');
    }
    await loadEvents();
  };

  const downloadReport = async () => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento para descargar el reporte.');
      return;
    }
    const response = await api.get(`/events/${selectedEventId}/report`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_asistencia_${selectedEventId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('Reporte descargado.');
  };

  const generateQr = async (participant) => {
    const { data } = await api.get(`/events/${selectedEventId}/qr/${participant.id}`);
    setQrPreview(data);
    setStatus('QR generado para la invitación.');
  };

  const generateBulkQr = async () => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes de generar QR masivo.');
      return;
    }
    setIsGeneratingBulkQr(true);
    try {
      const { data } = await api.get(`/events/${selectedEventId}/qr/bulk`);
      setBulkQrPreview(data);
      setStatus(`Se generaron QR masivos para ${data?.participants?.length || 0} invitaciones.`);
    } catch (error) {
      setStatus(`No fue posible generar QR masivos. ${getErrorDetail(error, 'Intenta nuevamente.')}`);
    } finally {
      setIsGeneratingBulkQr(false);
    }
  };

  const createInvitationsMassive = async () => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes de crear invitaciones masivas.');
      return;
    }
    const lines = massInvitationPreview.lines;
    const parsed = massInvitationPreview.parsed;

    if (!lines.length) {
      setStatus('Pegue al menos una línea para crear invitaciones masivas.');
      return;
    }

    setIsCreatingMassInvitations(true);
    let created = 0;
    const skipped = [];

    for (let index = 0; index < parsed.length; index += 1) {
      const item = parsed[index];
      if (!item.name || !item.cedula) {
        skipped.push({ line: index + 1, reason: 'Falta nombre o documento.' });
        continue;
      }
      try {
        await api.post('/participants', {
          event_id: selectedEventId,
          name: item.name,
          cedula: item.cedula,
          email: item.email,
          phone: item.phone,
          programa: item.programa,
          sede: item.sede,
          cohorte: item.cohorte,
          promedio: item.promedio,
          ticket_count: Number(item.ticketCount) > 0 ? Number(item.ticketCount) : 1,
        });
        created += 1;
      } catch (error) {
        const detail = error?.response?.data?.detail;
        skipped.push({ line: index + 1, reason: detail || 'Error al crear invitación.' });
      }
    }

    setIsCreatingMassInvitations(false);
    setMassInvitationText('');
    setMassInvitationResult({
      total: lines.length,
      created,
      skipped,
    });
    await loadParticipants(selectedEventId);
    setStatus(`Invitaciones masivas procesadas. Creadas: ${created}. Omitidas: ${skipped.length}.`);
  };

  const downloadMassTemplateCsv = () => {
    const header = 'Nombre,Documento,Email,Telefono,Programa,Sede,Cohorte,Promedio,CantidadQR';
    const sample = 'Ana Perez,12345,ana@correo.com,3001112233,Ingenieria,Bogota,2025-1,4.3,1';
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_invitaciones_masivas.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importMassInvitationCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!hasSelectedEventInAdmin) {
      setStatus('Selecciona un evento antes de importar CSV masivo.');
      event.target.value = '';
      return;
    }
    const raw = await file.text();
    const normalized = raw.replace(/^\uFEFF/, '');
    const rows = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!rows.length) {
      setStatus('El CSV está vacío.');
      event.target.value = '';
      return;
    }

    const maybeHeader = rows[0].toLowerCase();
    const hasHeader = maybeHeader.includes('nombre') && maybeHeader.includes('documento');
    const bodyRows = hasHeader ? rows.slice(1) : rows;
    setMassInvitationText(bodyRows.join('\n'));
    setMassInvitationResult(null);
    setStatus(`CSV cargado. Filas detectadas: ${bodyRows.length}.`);
    event.target.value = '';
  };

  const importMassInvitationPdf = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!hasSelectedEventInAdmin) {
      setStatus('Selecciona un evento antes de importar PDF masivo.');
      event.target.value = '';
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setStatus('Archivo inválido. Selecciona un PDF para importación masiva.');
      event.target.value = '';
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/participants/import-pdf-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      if (!rows.length) {
        setStatus('No se detectaron filas válidas en el PDF.');
      } else {
        setMassInvitationText(rows.join('\n'));
        setMassInvitationResult(null);
        setStatus(`PDF cargado. Filas detectadas: ${rows.length}.`);
      }
    } catch (error) {
      const detail = getErrorDetail(error, 'No fue posible leer el PDF.');
      const hint = buildUploadTroubleshootingHint(error);
      setStatus(`No fue posible importar el PDF. ${detail} ${hint}`);
    } finally {
      event.target.value = '';
    }
  };

  const uploadInvitationTemplatePdf = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setStatus('Archivo inválido. La plantilla institucional debe estar en formato PDF.');
      event.target.value = '';
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/invitations/template', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadInvitationTemplateStatus();
      setStatus('Plantilla PDF cargada correctamente.');
    } catch (error) {
      const detail = getErrorDetail(error, 'No fue posible subir la plantilla PDF.');
      const hint = buildUploadTroubleshootingHint(error);
      setStatus(`No fue posible cargar la plantilla PDF. ${detail} ${hint}`);
    } finally {
      event.target.value = '';
    }
  };

  const openInvitationTemplatePdf = () => {
    window.open('/api/invitations/template/download', '_blank', 'noopener');
  };

  const getBulkTicketsForParticipant = (participantId) => {
    const entry = bulkQrPreview?.participants?.find((item) => item?.participant?.id === participantId);
    return entry?.tickets || [];
  };

  const sendInvitation = (participant, channel) => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    const participantTickets = getBulkTicketsForParticipant(participant.id);
    const qrPayloadText = participantTickets.map((ticket) => ticket.payload).join('\n\n');
    const messageBase = `Hola ${participant.name}. Te invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''}.`;
    const sendFromNote = adminSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${adminSendSettings.whatsappFrom}` : '';
    const emailFromNote = adminSendSettings.emailFrom ? `Enviar desde correo: ${adminSendSettings.emailFrom}` : '';
    const extra = `${sendFromNote} ${emailFromNote}`.trim();
    const message = `${messageBase} ${extra}`.trim();

    if (channel === 'email') {
      const subject = encodeURIComponent(`Invitación a ${selectedEvent?.name || 'evento'}`);
      const body = encodeURIComponent(`${message}\n\nCódigo QR:\n${qrPayloadText || qrPreview?.tickets?.map((ticket) => ticket.payload).join('\n\n') || ''}`);
      window.location.href = `mailto:${participant.email || ''}?subject=${subject}&body=${body}`;
      setStatus('Se abrió el gestor de correo.');
      return;
    }

    const phone = (participant.phone || '').replace(/\D/g, '');
    if (!phone) {
      setStatus('No hay teléfono para WhatsApp.');
      return;
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message + '\n\n' + (qrPayloadText || qrPreview?.tickets?.map((ticket) => ticket.payload).join('\n\n') || ''))}`, '_blank', 'noopener');
    setStatus('Se abrió WhatsApp.');
  };

  // WhatsApp masivo -> Trello (1 card por invitado)
  const sendAllWhatsApp = async () => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }

    try {
      const fromNote = adminSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${adminSendSettings.whatsappFrom}` : '';
      const whatsappText = `Hola, te invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''}. ${fromNote}`.trim();

      const { data } = await api.post('/invitations/whatsapp/trello/program', {
        event_id: selectedEventId,
        whatsapp_text: whatsappText,
      });

      const created = data?.created ?? 0;
      const errors = data?.errors ?? 0;
      setStatus(`Trello: tarjetas creadas ${created}. Errores ${errors}.`);
    } catch (error) {
      setStatus(`No fue posible programar envíos WhatsApp en Trello. ${getErrorDetail(error, 'Intenta nuevamente.')}`);
    }
  };

  const sendAllEmail = async () => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }

    try {
      let qrData = bulkQrPreview;
      if (!qrData?.participants?.length) {
        const { data } = await api.get(`/events/${selectedEventId}/qr/bulk`);
        qrData = data;
        setBulkQrPreview(data);
      }

      const fromNote = adminSendSettings.emailFrom ? `Enviar desde correo: ${adminSendSettings.emailFrom}` : '';
      const recipients = participants.map((participant) => participant.email).filter(Boolean).join(',');
      const qrBlock = qrData?.participants?.map((entry) => {
        const participantName = entry?.participant?.name || 'Invitado';
        const payloads = (entry?.tickets || []).map((ticket) => ticket.payload).join('\n');
        return `${participantName}:\n${payloads}`;
      }).join('\n\n');

      const subject = encodeURIComponent(`Invitación a ${selectedEvent?.name || 'evento'}`);
      const body = encodeURIComponent(`${fromNote}\n\nTe invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''}.\n\nQR por participante:\n\n${qrBlock || ''}`);
      window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
      setStatus('Se abrió el gestor de correo para envío masivo con QR.');
    } catch (error) {
      setStatus(`No fue posible preparar email masivo. ${getErrorDetail(error, 'Intenta nuevamente.')}`);
    }
  };

  const sendParticipantEmailReal = async (participant) => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    try {
      const { data } = await api.post('/invitations/email/individual', {
        event_id: selectedEventId,
        participant_id: participant.id,
        subject: `Invitación a ${selectedEvent?.name || 'evento'}`,
        body_text: '',
      });
      if (data?.sent) {
        setStatus(`Correo enviado a ${participant.email} desde ${adminSendSettings.emailFrom || 'eventospolitecnicointernacional@pi.edu.co'}.`);
        return;
      }
      setStatus(`No se pudo enviar por SMTP (${data?.reason || 'sin configurar'}). Se abrirá el borrador de correo como respaldo.`);
      sendInvitation(participant, 'email');
    } catch (error) {
      setStatus('Error enviando correo por SMTP. Se abre borrador de respaldo.');
      sendInvitation(participant, 'email');
    }
  };

  const sendAllEmailReal = async () => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    try {
      const { data } = await api.post('/invitations/email/program', {
        event_id: selectedEventId,
        subject: `Invitación a ${selectedEvent?.name || 'evento'}`,
        body_text: '',
      });
      if (data?.configured) {
        setStatus(`Correos enviados por SMTP: ${data.sent}. Errores: ${data.errors}.`);
        return;
      }
      setStatus('SMTP no configurado en el servidor. Se abrirá el borrador de correo masivo como respaldo.');
      await sendAllEmail();
    } catch (error) {
      setStatus(`No fue posible enviar correos por SMTP. ${getErrorDetail(error, 'Se intentará el borrador de respaldo.')}`);
      await sendAllEmail();
    }
  };

  const selectedEventInAdmin = events.find((item) => item.id === selectedEventId);
  const hasSelectedEventInAdmin = Boolean(selectedEventId && selectedEventInAdmin);

  const banner = (
    <div className="card">
      <h3>Evento activo</h3>
      <p style={{ marginTop: '-0.25rem', color: '#64748b' }}>
        Selecciona el evento sobre el que trabajarán los pasos 2 a 5 (participantes, carga masiva, invitaciones y QR).
      </p>
      <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
        <option value="">Selecciona un evento</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>{event.name}</option>
        ))}
      </select>
      {hasSelectedEventInAdmin ? (
        <div className="badge" style={{ marginTop: '0.75rem' }}>
          Evento activo: {selectedEventInAdmin.name} · {selectedEventInAdmin.date} · {selectedEventInAdmin.mode}
        </div>
      ) : (
        <div className="badge" style={{ marginTop: '0.75rem', background: '#fff7ed', color: '#9a3412' }}>
          Selecciona un evento para habilitar participantes, carga masiva e invitaciones.
        </div>
      )}
    </div>
  );

  const step1 = (
    <>
      <form onSubmit={createEvent} className="stack">
        <input value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="Nombre del evento" />
        <input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
        <input value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Lugar" />
        <input value={eventForm.schedule} onChange={(e) => setEventForm({ ...eventForm, schedule: e.target.value })} placeholder="Horario (ej. 08:00 - 12:00)" />
        <input type="number" value={eventForm.capacity} onChange={(e) => setEventForm({ ...eventForm, capacity: Number(e.target.value) })} placeholder="Capacidad" />
        <input type="number" min={1} value={eventForm.tickets_per_participant} onChange={(e) => setEventForm({ ...eventForm, tickets_per_participant: Number(e.target.value) })} placeholder="Invitaciones por participante" />
        <select value={eventForm.mode} onChange={(e) => setEventForm({ ...eventForm, mode: e.target.value })}>
          <option value="ONLINE">ONLINE</option>
          <option value="OFFLINE">OFFLINE</option>
        </select>
        <button type="submit">Crear evento</button>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        <button type="button" onClick={downloadReport} disabled={!hasSelectedEventInAdmin}>Descargar reporte del evento (asistencia, fecha/hora, pendientes)</button>
      </div>

      <div className="stack">
        {events.map((event) => (
          <div key={event.id} className="list-item">
            <strong>{event.name}</strong>
            <span>{event.date} · {event.location}</span>
            <span>{event.schedule ? `Horario: ${event.schedule}` : 'Horario no asignado'}</span>
            <span>Modo: {event.mode} · Aforo: {event.capacity} · Invitaciones por invitado: {event.tickets_per_participant || 1}</span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => deleteEvent(event.id)}>Eliminar evento</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const step2 = (
    <>
      <form onSubmit={createInvitation} className="stack">
        <input value={participantForm.name} onChange={(e) => setParticipantForm({ ...participantForm, name: e.target.value })} placeholder="APELLIDOS Y NOMBRES" />
        <input value={participantForm.cedula} onChange={(e) => setParticipantForm({ ...participantForm, cedula: e.target.value })} placeholder="DOCUMENTO" />
        <input value={participantForm.programa} onChange={(e) => setParticipantForm({ ...participantForm, programa: e.target.value })} placeholder="PROGRAMA" />
        <input value={participantForm.sede} onChange={(e) => setParticipantForm({ ...participantForm, sede: e.target.value })} placeholder="SEDE" />
        <input value={participantForm.cohorte} onChange={(e) => setParticipantForm({ ...participantForm, cohorte: e.target.value })} placeholder="COHORTE" />
        <input value={participantForm.promedio} onChange={(e) => setParticipantForm({ ...participantForm, promedio: e.target.value })} placeholder="PROMEDIO" />
        <input type="number" min={1} value={participantForm.ticket_count} onChange={(e) => setParticipantForm({ ...participantForm, ticket_count: Number(e.target.value) })} placeholder="Cantidad de códigos QR" />
        <input value={participantForm.email} onChange={(e) => setParticipantForm({ ...participantForm, email: e.target.value })} placeholder="EMAIL INSTITUCIONAL" />
        <input value={participantForm.phone} onChange={(e) => setParticipantForm({ ...participantForm, phone: e.target.value })} placeholder="TEL1" />
        <button type="submit" disabled={!hasSelectedEventInAdmin}>Crear invitación</button>
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Formato del Excel para carga de participantes</h3>
        <p>El archivo debe incluir exactamente estas columnas (encabezados, sin tildes, en cualquier orden):</p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f1f5f9', padding: '0.5rem', borderRadius: '6px' }}>
No | DOCUMENTO | SEDE | PROGRAMA | APELLIDOS Y NOMBRES | TEL1 | EMAIL INSTITUCIONAL | COHORTE | PROMEDIO
        </pre>
        <label className="upload-box" style={{ marginTop: '0.75rem' }}>
          <input type="file" accept=".xlsx,.xls" onChange={uploadExcel} disabled={!hasSelectedEventInAdmin} />
          {uploading ? 'Importando…' : 'Importar Excel de participantes'}
        </label>
      </div>

      <div className="stack" style={{ marginTop: '1rem' }}>
        {participants.map((participant) => (
          <div key={participant.id} className="list-item">
            <strong>{participant.name}</strong>
            <span>{participant.cedula} · {participant.programa || '-'} · {participant.sede || '-'}</span>
            <span>{participant.email} · {participant.phone}</span>
            <span>QR usados: {participant.used_qr_count ?? 0} · pendientes: {participant.pending_qr_count ?? participant.ticket_count ?? 1}</span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => generateQr(participant)}>Generar QR</button>
              <button onClick={() => sendParticipantEmailReal(participant)}>Enviar correo</button>
              <button onClick={() => sendInvitation(participant, 'whatsapp')}>Enviar WhatsApp</button>
              <button onClick={() => removeParticipant(participant.id)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {qrPreview && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>QR generado</h3>
          {qrPreview.tickets ? (
            qrPreview.tickets.map((ticket) => (
              <div key={ticket.index} style={{ marginBottom: '1rem' }}>
                <strong>QR {ticket.index}</strong>
                <img src={ticket.image} alt={`QR ${ticket.index}`} style={{ maxWidth: '220px', display: 'block', marginTop: '0.5rem' }} />
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ticket.payload}</pre>
              </div>
            ))
          ) : (
            <>
              <img src={qrPreview.image} alt="QR de invitación" style={{ maxWidth: '220px' }} />
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{qrPreview.payload}</pre>
            </>
          )}
        </div>
      )}
    </>
  );

  const step3 = (
    <>
      <p>Pegue una fila por invitado con este orden: Nombre;Documento;Email;Teléfono;Programa;Sede;Cohorte;Promedio;CantidadQR</p>
      <button type="button" onClick={downloadMassTemplateCsv}>
        Descargar plantilla CSV
      </button>
      <label className="upload-box" style={{ marginTop: '0.75rem' }}>
        <input type="file" accept=".csv,text/csv" onChange={importMassInvitationCsv} disabled={!hasSelectedEventInAdmin} />
        Importar CSV de invitaciones masivas
      </label>
      <label className="upload-box" style={{ marginTop: '0.75rem' }}>
        <input type="file" accept="application/pdf,.pdf" onChange={importMassInvitationPdf} disabled={!hasSelectedEventInAdmin} />
        Importar PDF de invitaciones masivas
      </label>
      <textarea
        value={massInvitationText}
        onChange={(e) => setMassInvitationText(e.target.value)}
        rows={6}
        disabled={!hasSelectedEventInAdmin}
        placeholder={'Ejemplo:\nAna Pérez;12345;ana@correo.com;3001112233;Ingeniería;Bogotá;2025-1;4.3;1'}
      />
      <div className="badge" style={{ marginTop: '0.5rem' }}>
        Prevalidación: {massInvitationPreview.valid.length} válidas · {massInvitationPreview.invalid.length} inválidas
      </div>
      <button
        type="button"
        onClick={createInvitationsMassive}
        disabled={isCreatingMassInvitations || !hasSelectedEventInAdmin || massInvitationPreview.valid.length === 0}
      >
        {isCreatingMassInvitations ? 'Creando invitaciones...' : 'Crear invitaciones masivas'}
      </button>

      {massInvitationResult && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Reporte de carga masiva</h3>
          <p>Total procesadas: {massInvitationResult.total} · Creadas: {massInvitationResult.created} · Omitidas: {massInvitationResult.skipped.length}</p>
          {massInvitationResult.skipped.length > 0 && (
            <div className="stack">
              {massInvitationResult.skipped.map((item) => (
                <div key={item.line} className="list-item">
                  <span>Línea {item.line}: {String(item.reason)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  const step4 = (
    <>
      <div className="card">
        <h3>Plantilla PDF de invitaciones</h3>
        <p>Cargue la plantilla institucional en PDF para tenerla disponible desde el panel administrador.</p>
        <label className="upload-box" style={{ marginTop: '0.75rem' }}>
          <input type="file" accept="application/pdf,.pdf" onChange={uploadInvitationTemplatePdf} />
          Cargar plantilla PDF
        </label>
        <div className="badge" style={{ marginTop: '0.75rem' }}>
          {invitationTemplate.exists
            ? `Plantilla cargada (${Math.max(1, Math.round(invitationTemplate.size_bytes / 1024))} KB)`
            : 'No hay plantilla PDF cargada'}
        </div>
        <button type="button" onClick={openInvitationTemplatePdf} disabled={!invitationTemplate.exists}>
          Ver plantilla PDF cargada
        </button>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Generación masiva de QR</h3>
        <button type="button" onClick={generateBulkQr} disabled={isGeneratingBulkQr || !hasSelectedEventInAdmin}>
          {isGeneratingBulkQr ? 'Generando QR masivos...' : 'Generar QR masivos del evento'}
        </button>
        {bulkQrPreview?.participants?.length ? (
          <p>QR generados: {bulkQrPreview.participants.length} invitaciones.</p>
        ) : (
          <p>Genere los QR masivos para adjuntarlos en envíos masivos e individuales.</p>
        )}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Opciones de envío masivo</h3>
        <input value={adminSendSettings.whatsappFrom} onChange={(e) => setAdminSendSettings({ ...adminSendSettings, whatsappFrom: e.target.value })} placeholder="Enviar desde número WhatsApp" />
        <input value={adminSendSettings.emailFrom} onChange={(e) => setAdminSendSettings({ ...adminSendSettings, emailFrom: e.target.value })} placeholder="Enviar desde correo electrónico" />
        <div className="badge" style={{ marginTop: '0.5rem' }}>
          Envío de correo: {emailConfigured ? 'SMTP configurado en el servidor' : 'SMTP no configurado — se usará borrador de correo (mailto) como respaldo'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button type="button" onClick={sendAllWhatsApp} disabled={!hasSelectedEventInAdmin}>Programar WhatsApp masivo en Trello</button>
          <button type="button" onClick={sendAllEmailReal} disabled={!hasSelectedEventInAdmin}>Enviar email masivo</button>
        </div>
      </div>
    </>
  );

  const step5 = (
    <>
      <form onSubmit={createUser} className="stack">
        <input value={newUserForm.username} onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })} placeholder="Usuario" />
        <input type="password" value={newUserForm.password} onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })} placeholder="Contraseña" />
        <select value={newUserForm.role} onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}>
          <option value={ROLE_ADMIN}>ADMIN</option>
          <option value={ROLE_LOGISTICO}>LOGISTICO</option>
          <option value={ROLE_SCANNER}>SCANNER</option>
        </select>
        <button type="submit">Crear usuario</button>
      </form>
      <div className="stack">
        {users.map((item) => (
          <div key={item.id} className="list-item">
            {editingUserId === item.id ? (
              <>
                <strong>{item.username}</strong>
                <select value={editUserForm.role} onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}>
                  <option value={ROLE_ADMIN}>ADMIN</option>
                  <option value={ROLE_LOGISTICO}>LOGISTICO</option>
                  <option value={ROLE_SCANNER}>SCANNER</option>
                </select>
                <input type="password" value={editUserForm.password} onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })} placeholder="Nueva contraseña (opcional)" />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={saveEditUser}>Guardar</button>
                  <button onClick={cancelEditUser}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <strong>{item.username}</strong>
                <span>Rol: {item.role}</span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => startEditUser(item)}>Editar</button>
                  <button onClick={() => removeUser(item.id)}>Eliminar</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <AdminLayoutFiveSteps
      user={user}
      status={status}
      onLogout={onLogout}
      banner={banner}
      step1={step1}
      step2={step2}
      step3={step3}
      step4={step4}
      step5={step5}
    />
  );
}

function LogisticsPage({ user, onLogout }) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [searchCedula, setSearchCedula] = useState('');
  const [participant, setParticipant] = useState(null);
  const [attendances, setAttendances] = useState([]);
  const [logisticForm, setLogisticForm] = useState({ name: '', cedula: '', email: '', phone: '', ticket_count: 1, sede: '', programa: '', cohorte: '', promedio: '' });
  const [logisticSendSettings, setLogisticSendSettings] = useState({ emailFrom: '', whatsappFrom: '' });
  const [status, setStatus] = useState('');
  const [allParticipants, setAllParticipants] = useState([]);

  const loadEvents = async () => {
    const { data } = await api.get('/events');
    setEvents(data);
    if (!selectedEventId && data.length) {
      setSelectedEventId(data[0].id);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const loadAttendances = async () => {
      const { data } = await api.get(`/attendances/${selectedEventId}`);
      setAttendances(data);
    };
    const loadAllParticipants = async () => {
      const { data } = await api.get(`/events/${selectedEventId}/participants`);
      setAllParticipants(data);
    };
    loadAttendances();
    loadAllParticipants();
  }, [selectedEventId]);

  const invitationSummary = allParticipants.reduce(
    (acc, item) => ({
      total: acc.total + Number(item.ticket_count || 1),
      used: acc.used + Number(item.used_qr_count || 0),
      pending: acc.pending + Number(item.pending_qr_count ?? Math.max(0, Number(item.ticket_count || 1) - Number(item.used_qr_count || 0))),
    }),
    { total: 0, used: 0, pending: 0 },
  );

  const checkParticipant = async (event) => {
    event.preventDefault();
    if (!selectedEventId) {
      setStatus('Seleccione un evento primero.');
      return;
    }
    const { data } = await api.get('/participants/search', { params: { cedula: searchCedula, event_id: selectedEventId } });
    if (!data.length) {
      setParticipant(null);
      setStatus('No se encontró un invitado con esa cédula.');
      return;
    }
    const found = data[0];
    setParticipant(found);
    const checkedIn = attendances.some((entry) => entry.participant_id === found.id);
    setStatus(checkedIn ? 'El invitado ya registró ingreso.' : 'El invitado aún no ha ingresado.');
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes de crear la invitación.');
      return;
    }
    const createData = { ...logisticForm, event_id: selectedEventId };
    await api.post('/participants', createData);
    setStatus('Invitación individual creada correctamente.');
    setLogisticForm({ name: '', cedula: '', email: '', phone: '', ticket_count: 1, sede: '', programa: '', cohorte: '', promedio: '' });
    const { data } = await api.get(`/events/${selectedEventId}/participants`);
    setAllParticipants(data);
    setParticipant(data.find((item) => item.cedula === createData.cedula) || null);
  };

  const sendInvitation = (person, channel) => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    const messageBase = `Hola ${person.name}. Estás invitado al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''}.`;
    const fromNote = channel === 'email' ? logisticSendSettings.emailFrom : logisticSendSettings.whatsappFrom;
    const extra = fromNote ? `Enviar desde: ${fromNote}` : '';
    const message = `${messageBase} ${extra}`.trim();
    if (channel === 'email') {
      const subject = encodeURIComponent(`Invitación a ${selectedEvent?.name || 'evento'}`);
      const body = encodeURIComponent(`${message}`);
      window.location.href = `mailto:${person.email || ''}?subject=${subject}&body=${body}`;
      setStatus('Se abrió el gestor de correo.');
      return;
    }
    const phone = (person.phone || '').replace(/\D/g, '');
    if (!phone) {
      setStatus('No hay teléfono para WhatsApp.');
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    setStatus('Se abrió WhatsApp.');
  };

  const sendEmailReal = async (person) => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    try {
      const { data } = await api.post('/invitations/email/individual', {
        event_id: selectedEventId,
        participant_id: person.id,
        subject: `Invitación a ${selectedEvent?.name || 'evento'}`,
        body_text: '',
      });
      if (data?.sent) {
        setStatus(`Correo enviado a ${person.email}.`);
        return;
      }
      setStatus(`No se pudo enviar por SMTP (${data?.reason || 'sin configurar'}). Se abrirá el borrador de correo como respaldo.`);
      sendInvitation(person, 'email');
    } catch (error) {
      setStatus('Error enviando correo por SMTP. Se abre borrador de respaldo.');
      sendInvitation(person, 'email');
    }
  };

  const selectedEvent = events.find((item) => item.id === selectedEventId);
  const checkedInCount = attendances.length;
  const availableCapacity = selectedEvent ? Number(selectedEvent.capacity || 0) - checkedInCount : 0;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Panel logístico</h1>
          <p>Rol actual: {user.role}</p>
        </div>
        <button onClick={() => onLogout(null)}>Cerrar sesión</button>
      </div>
      {status && <div className="badge">{status}</div>}

      <section className="card">
        <h2>Consultar ingreso por cédula</h2>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
        <form onSubmit={checkParticipant} className="stack">
          <input value={searchCedula} onChange={(e) => setSearchCedula(e.target.value)} placeholder="Cédula del invitado" />
          <button type="submit">Buscar</button>
        </form>

        {selectedEvent && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Resumen de aforo</h3>
            <p>Total de ingresos: {checkedInCount}</p>
            <p>Aforo disponible: {availableCapacity}</p>
            <p>Capacidad total: {selectedEvent.capacity}</p>
            <p>Total de invitaciones usadas: {attendances.length}</p>
          </div>
        )}

        {selectedEvent && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Informe de invitaciones (todo el evento)</h3>
            <p>Invitados registrados: {allParticipants.length}</p>
            <p>Invitaciones emitidas (total QR): {invitationSummary.total}</p>
            <p>Invitaciones utilizadas: {invitationSummary.used}</p>
            <p>Invitaciones pendientes: {invitationSummary.pending}</p>
          </div>
        )}

        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Crear invitación individual</h3>
          <input value={logisticForm.name} onChange={(e) => setLogisticForm({ ...logisticForm, name: e.target.value })} placeholder="Nombres y apellidos" />
          <input value={logisticForm.cedula} onChange={(e) => setLogisticForm({ ...logisticForm, cedula: e.target.value })} placeholder="Cédula" />
          <input value={logisticForm.email} onChange={(e) => setLogisticForm({ ...logisticForm, email: e.target.value })} placeholder="Email institucional" />
          <input value={logisticForm.phone} onChange={(e) => setLogisticForm({ ...logisticForm, phone: e.target.value })} placeholder="Teléfono" />
          <input value={logisticForm.sede} onChange={(e) => setLogisticForm({ ...logisticForm, sede: e.target.value })} placeholder="SEDE" />
          <input value={logisticForm.programa} onChange={(e) => setLogisticForm({ ...logisticForm, programa: e.target.value })} placeholder="PROGRAMA" />
          <input value={logisticForm.cohorte} onChange={(e) => setLogisticForm({ ...logisticForm, cohorte: e.target.value })} placeholder="COHORTE" />
          <input value={logisticForm.promedio} onChange={(e) => setLogisticForm({ ...logisticForm, promedio: e.target.value })} placeholder="PROMEDIO" />
          <input type="number" min={1} value={logisticForm.ticket_count} onChange={(e) => setLogisticForm({ ...logisticForm, ticket_count: Number(e.target.value) })} placeholder="Cantidad de códigos QR" />
          <button type="button" onClick={createInvitation}>Crear invitación individual</button>
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Opciones de envío</h3>
          <input value={logisticSendSettings.whatsappFrom} onChange={(e) => setLogisticSendSettings({ ...logisticSendSettings, whatsappFrom: e.target.value })} placeholder="Número WhatsApp remitente" />
          <input value={logisticSendSettings.emailFrom} onChange={(e) => setLogisticSendSettings({ ...logisticSendSettings, emailFrom: e.target.value })} placeholder="Correo remitente" />
          {participant && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => sendInvitation(participant, 'whatsapp')}>Enviar WhatsApp</button>
              <button type="button" onClick={() => sendEmailReal(participant)}>Enviar Email</button>
            </div>
          )}
        </div>

        {participant && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Resultado</h3>
            <p><strong>{participant.name}</strong></p>
            <p>Cédula: {participant.cedula}</p>
            <p>Correo: {participant.email}</p>
            <p>Teléfono: {participant.phone}</p>
            <p>Usó códigos: {participant.used_qr_count || 0}</p>
            <p>Invitaciones pendientes: {participant.pending_qr_count || 0}</p>
            <p>Estado: {attendances.some((entry) => entry.participant_id === participant.id) ? 'Ingresó' : 'Sin ingreso'}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ScannerPage({ user, onLogout }) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [participants, setParticipants] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState('Esperando escaneo');
  const [scannerError, setScannerError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  const loadEvents = async () => {
    const { data } = await api.get('/events');
    setEvents(data);
    if (!selectedEventId && data.length) {
      setSelectedEventId(data[0].id);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const loadParticipants = async () => {
      const stored = await get(PARTICIPANTS_PREFIX + selectedEventId);
      if (stored) {
        setParticipants(stored);
      }
      try {
        const { data } = await api.get(`/events/${selectedEventId}/participants`);
        setParticipants(data);
        await set(PARTICIPANTS_PREFIX + selectedEventId, data);
      } catch (error) {
        setStatus('Sin conexión; se usarán los datos locales.');
      }
    };

    const loadAttendances = async () => {
      try {
        const { data } = await api.get(`/attendances/${selectedEventId}`);
        setAttendances(data);
      } catch (error) {
        setAttendances([]);
      }
    };

    loadParticipants();
    loadAttendances();
  }, [selectedEventId]);

  useEffect(() => {
    if (!scannerRef.current) return;
    let isMounted = true;
    const qrCode = new Html5Qrcode(scannerRef.current.id);
    html5QrCodeRef.current = qrCode;
    let started = false;

    const startScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('El navegador no soporta acceso a la cámara.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stream.getTracks().forEach((track) => track.stop());

        await qrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            await qrCode.stop();
            await handleScan(decodedText);
            await qrCode.start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 250, height: 250 } },
              () => {},
              () => {},
            );
          },
          () => {},
        );
        started = true;
        if (isMounted) {
          setScannerError('');
        }
      } catch (error) {
        console.error('Scanner init failed', error);
        if (isMounted) {
          setScannerError('No se pudo iniciar el escáner. Comprueba los permisos de cámara o utiliza la entrada manual.');
          setStatus('No se pudo iniciar el escáner.');
        }
      }
    };

    startScanner();
    return () => {
      isMounted = false;
      if (started) {
        qrCode.stop().catch(() => {});
      }
    };
  }, [selectedEventId]);

  const handleScan = async (decodedText) => {
    try {
      const payload = JSON.parse(decodedText);
      const participant = participants.find((item) => item.id === payload.participant_id);
      if (!participant) {
        setStatus('QR no encontrado en la lista del evento.');
        window.alert('QR no válido para este evento.');
        setLog((prev) => [{ status: 'invalid', message: 'QR inválido', time: new Date().toLocaleTimeString(), participant: payload.cedula }, ...prev]);
        return;
      }

      const ticketCount = Number(participant.ticket_count || 1);
      const priorUsed = Number(participant.used_qr_count || 0);
      const sessionUsed = log.filter((entry) => entry.participantId === participant.id && (entry.status === 'valid' || entry.status === 'queued')).length;

      const alreadyUsed = log.some((entry) => entry.participantId === participant.id);
      if (alreadyUsed) {
        setStatus('Duplicado: este invitado ya registró ingreso.');
        setScanResult({
          participant,
          status: 'duplicate',
          message: 'Este invitado ya registró ingreso.',
          usedCount: priorUsed + sessionUsed,
          pendingCount: Math.max(0, ticketCount - (priorUsed + sessionUsed)),
          ticketCount,
        });
        window.alert('Este usuario ya ingresó.');
        setLog((prev) => [{ status: 'duplicate', message: 'Duplicado', time: new Date().toLocaleTimeString(), participantId: participant.id }, ...prev]);
        return;
      }

      const usedCount = priorUsed + sessionUsed + 1;
      const pendingCount = Math.max(0, ticketCount - usedCount);

      if (isOnline) {
        const { data } = await api.post('/attendance/scan', { event_id: selectedEventId, payload: decodedText, source: 'online' });
        const message = data.status === 'valid' ? 'Entrada registrada correctamente.' : 'Este invitado ya ingresó.';
        setStatus(message);
        setScanResult({ participant, status: data.status, message, usedCount, pendingCount, ticketCount });
        const updatedAttendances = await api.get(`/attendances/${selectedEventId}`).then((resp) => resp.data).catch(() => attendances);
        setAttendances(updatedAttendances);
        window.alert(message);
        setLog((prev) => [{ status: data.status, message, time: new Date().toLocaleTimeString(), participantId: participant.id }, ...prev]);
      } else {
        const queue = (await get(QUEUE_KEY)) || [];
        const item = { event_id: selectedEventId, payload: decodedText, source: 'offline' };
        await set(QUEUE_KEY, [...queue, item]);
        const message = 'Escaneo guardado para sincronizar cuando vuelva la conexión.';
        setStatus(message);
        setScanResult({ participant, status: 'queued', message, usedCount, pendingCount, ticketCount });
        window.alert(message);
        setLog((prev) => [{ status: 'queued', message, time: new Date().toLocaleTimeString(), participantId: participant.id }, ...prev]);
      }
    } catch (error) {
      setStatus('QR inválido.');
      setScanResult(null);
      window.alert('QR inválido.');
      setLog((prev) => [{ status: 'invalid', message: 'QR inválido', time: new Date().toLocaleTimeString() }, ...prev]);
    }
  };

  const syncQueue = async () => {
    const queue = (await get(QUEUE_KEY)) || [];
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await api.post('/attendance/scan', item);
      } catch (error) {
        remaining.push(item);
      }
    }
    await set(QUEUE_KEY, remaining);
    setStatus(remaining.length ? `Sincronización pendiente: ${remaining.length}` : 'Sincronización completada');
  };

  useEffect(() => {
    if (isOnline) {
      syncQueue();
    }
  }, [isOnline]);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Scanner móvil</h1>
          <p>Usuario: {user.username} · Rol: {user.role}</p>
        </div>
        <button onClick={() => onLogout(null)}>Cerrar sesión</button>
      </div>
      <p>Escanee el QR del invitado para validar el ingreso.</p>
      <div className="badge">{isOnline ? 'ONLINE' : 'OFFLINE'}</div>
      {scannerError && (
        <div className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>{scannerError}</div>
      )}
      <div className="card-grid">
        <section className="card">
          <h2>Evento activo</h2>
          <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
          <div id="scanner" ref={scannerRef} className="scanner-frame" />
          <button onClick={() => syncQueue()}>Sincronizar cola</button>
          <form onSubmit={async (event) => { event.preventDefault(); await handleScan(manualCode); setManualCode(''); }} className="stack" style={{ marginTop: '1rem' }}>
            <input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="Pega aquí el JSON del QR manual" />
            <button type="submit">Procesar código manual</button>
          </form>
        </section>
        <section className="card">
          <h2>Resultado</h2>
          <p>{status}</p>
          {scanResult ? (
            <div style={{ marginTop: '1rem' }}>
              <p><strong>{scanResult.participant.name}</strong></p>
              <p>Cédula: {scanResult.participant.cedula}</p>
              <p>Estado: {scanResult.status === 'valid' ? 'Ingreso validado' : scanResult.status === 'duplicate' ? 'QR ya utilizado (rechazado)' : scanResult.status === 'queued' ? 'Guardado offline, pendiente de sincronizar' : 'Inválido'}</p>
              <p>QR usados de este invitado: {scanResult.usedCount} de {scanResult.ticketCount}</p>
              <p>QR pendientes de este invitado: {scanResult.pendingCount}</p>
            </div>
          ) : (
            <p>Escanee un QR válido para ver el detalle del invitado.</p>
          )}
          <div style={{ marginTop: '1rem' }}>
            <p>Total códigos usados en este evento: {attendances.length}</p>
            <p>Escaneos válidos recientes: {log.filter((entry) => entry.status === 'valid').length}</p>
          </div>
          <div className="stack">
            {log.slice(0, 8).map((entry, index) => (
              <div key={index} className="list-item">
                <strong>{entry.message}</strong>
                <span>{entry.time}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RoleDashboard({ user, onLogout }) {
  if (user.role === ROLE_ADMIN) {
    return <AdminPage user={user} onLogout={onLogout} />;
  }
  if (user.role === ROLE_LOGISTICO) {
    return <LogisticsPage user={user} onLogout={onLogout} />;
  }
  if (user.role === ROLE_SCANNER) {
    return <ScannerPage user={user} onLogout={onLogout} />;
  }
  return <LoginScreen onLogin={() => {}} />;
}

function App() {
  const [user, setUser] = useState(() => loadStoredAuth());

  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  const handleLogin = (data) => {
    persistAuth(data);
    setUser({ username: data.username, role: data.role });
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
  };

  return (
    <div className="app-shell">
      <nav className="topbar">
        <h2>Asistencia del Politécnico Internacional</h2>
        <div className="nav-links">
          <Link to="/">Inicio</Link>
          <Link to="/admin">Administración</Link>
          <Link to="/logistico">Logístico</Link>
          <Link to="/scanner">Scanner</Link>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={user ? <RoleDashboard user={user} onLogout={handleLogout} /> : <LoginScreen onLogin={handleLogin} />} />
        <Route path="/login" element={<LoginScreen onLogin={handleLogin} />} />
        <Route path="/admin" element={user?.role === ROLE_ADMIN ? <AdminPage user={user} onLogout={handleLogout} /> : <LoginScreen onLogin={handleLogin} />} />
        <Route path="/logistico" element={user?.role === ROLE_LOGISTICO ? <LogisticsPage user={user} onLogout={handleLogout} /> : <LoginScreen onLogin={handleLogin} />} />
        <Route path="/scanner" element={user?.role === ROLE_SCANNER ? <ScannerPage user={user} onLogout={handleLogout} /> : <LoginScreen onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;

