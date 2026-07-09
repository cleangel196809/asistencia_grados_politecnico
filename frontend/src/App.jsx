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

// Abre el WebSocket de /ws/attendances (el backend transmite un mensaje cada
// vez que CUALQUIER scanner registra un ingreso/salida) y llama a onEvent con
// cada mensaje recibido, para que los dashboards se actualicen en vivo sin
// depender de que el propio usuario haga el escaneo. Reintenta la conexion
// si se cae. Devuelve una funcion para cerrar la conexion (cleanup de effect).
function openAttendanceSocket(onEvent) {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  let wsUrl;
  if (apiBase) {
    wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/attendances';
  } else {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${proto}//${window.location.host}/api/ws/attendances`;
  }

  let socket;
  let closedByUs = false;
  let retryTimeout;

  const connect = () => {
    socket = new WebSocket(wsUrl);
    socket.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch (error) {
        // ignorar mensajes que no sean JSON valido
      }
    };
    socket.onclose = () => {
      if (!closedByUs) {
        retryTimeout = setTimeout(connect, 4000);
      }
    };
    socket.onerror = () => socket.close();
  };
  connect();

  return () => {
    closedByUs = true;
    clearTimeout(retryTimeout);
    socket?.close();
  };
}

function getErrorDetail(error, fallbackMessage) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || String(item)).join(' | ');
  }
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  return fallbackMessage;
}

// Intenta ubicar, dentro de "events", el que corresponde a AHORA MISMO segun
// su fecha (event.date, YYYY-MM-DD) y su horario en texto libre (event.schedule,
// ej. "10:00 - 13:00" o "15:00 a 17:00" -- se toma el primer y ultimo HH:MM que
// aparezcan). Si ninguno coincide (o el horario no se pudo interpretar),
// devuelve null para que el llamador decida el respaldo (ej. el primero de la lista).
function findCurrentEvent(events) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const parseTimes = (schedule) => {
    const matches = [...(schedule || '').matchAll(/(\d{1,2}):(\d{2})/g)];
    return matches.map((m) => parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
  };

  for (const event of events) {
    if (event.date !== todayStr) continue;
    const times = parseTimes(event.schedule);
    if (times.length < 2) continue;
    const [start, end] = [Math.min(...times), Math.max(...times)];
    if (nowMinutes >= start - 60 && nowMinutes <= end + 60) {
      // margen de 1h antes/despues por si la gente llega temprano o el evento se extiende
      return event;
    }
  }
  return null;
}

function ProgressBar({ value, max, label, color }) {
  const safeMax = Number(max) || 0;
  const pct = safeMax > 0 ? Math.min(100, Math.round((Number(value) / safeMax) * 100)) : 0;
  return (
    <div style={{ marginTop: '0.4rem' }}>
      {label && <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>{label}</div>}
      <div style={{ background: '#e2e8f0', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            background: color || '#2563eb',
            height: '100%',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>{value}/{safeMax} ({pct}%)</div>
    </div>
  );
}

function SendChecklist({ participant }) {
  const emailCount = participant.email_sent_count ?? 0;
  const whatsappCount = participant.whatsapp_sent_count ?? 0;
  const used = participant.used_qr_count ?? 0;
  const total = participant.ticket_count ?? 1;
  const item = (ok, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <span style={{ color: ok ? '#16a34a' : '#cbd5e1' }}>{ok ? '✅' : '⬜'}</span>
      {text}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.85rem', marginTop: '0.2rem' }}>
      {item(emailCount > 0, `Correo enviado${emailCount > 0 ? ` (${emailCount}x)` : ''}`)}
      {item(whatsappCount > 0, `WhatsApp enviado${whatsappCount > 0 ? ` (${whatsappCount}x)` : ''}`)}
      {item(used > 0, `Usadas: ${used}/${total}`)}
    </div>
  );
}

function PreviewModal({ preview, onConfirm, onCancel, isSending }) {
  if (!preview) return null;
  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{preview.title}</h3>
        {preview.recipientCount != null && (
          <div className="preview-field">
            <label>Destinatarios</label>
            <div>{preview.recipientCount} invitado(s) recibirán este mensaje.</div>
          </div>
        )}
        {preview.subject && (
          <div className="preview-field">
            <label>Asunto</label>
            <div>{preview.subject}</div>
          </div>
        )}
        {preview.body && (
          <div className="preview-field">
            <label>Mensaje (ejemplo con el primer invitado)</label>
            <div className="preview-body">{preview.body}</div>
          </div>
        )}
        {preview.sampleImage && (
          <div className="preview-field">
            <label>Invitación adjunta (ejemplo)</label>
            <img className="preview-thumb" src={preview.sampleImage} alt="Vista previa de la invitación" />
          </div>
        )}
        {preview.note && <div className="badge" style={{ background: '#fff7ed', color: '#9a3412' }}>{preview.note}</div>}
        <div className="preview-actions">
          <button type="button" onClick={onConfirm} disabled={isSending}>
            {isSending ? 'Enviando…' : 'Confirmar y enviar'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={isSending}>Cancelar</button>
        </div>
      </div>
    </div>
  );
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
    <div className="card" style={{ maxWidth: '420px', margin: '3rem auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
        <img src="/brand/logo-politecnico.png" alt="Politécnico Internacional" style={{ maxWidth: '260px', width: '100%' }} />
      </div>
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
  const [searchCedulaAdmin, setSearchCedulaAdmin] = useState('');
  const [foundParticipantAdmin, setFoundParticipantAdmin] = useState(null);
  const [searchStatusAdmin, setSearchStatusAdmin] = useState('');
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
  const [layoutForm, setLayoutForm] = useState({
    name: { x: 0.5, y: 0.385, font_size: 130, max_width: 0.78, color: '#26265f' },
    qr: { x: 0.5, y: 0.665, size: 0.48 },
  });
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isLoadingLayoutPreview, setIsLoadingLayoutPreview] = useState(false);
  const [layoutPreviewImage, setLayoutPreviewImage] = useState(null);
  const [composedInvitation, setComposedInvitation] = useState(null);
  const [isLoadingComposedInvitation, setIsLoadingComposedInvitation] = useState(false);
  const [isGeneratingInvitationsDocument, setIsGeneratingInvitationsDocument] = useState(false);
  const [isSendingBulkEmail, setIsSendingBulkEmail] = useState(false);
  const [emailSendProgress, setEmailSendProgress] = useState(null);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsappSendProgress, setWhatsappSendProgress] = useState(null);
  const [eventSummaries, setEventSummaries] = useState({});
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ role: '', password: '' });
  const [bulkEmailPreview, setBulkEmailPreview] = useState(null);
  const [bulkWhatsappPreview, setBulkWhatsappPreview] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editEventForm, setEditEventForm] = useState({ name: '', date: '', location: '', schedule: '', capacity: 100, mode: 'ONLINE', tickets_per_participant: 1 });


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

  const isMassInvitationHeaderLine = (line) => {
    const lowercase = line.toLowerCase();
    return lowercase.includes('documento') && (lowercase.includes('nombre') || lowercase.includes('apellidos'));
  };

  const parseMassInvitationInput = (text) => {
    const rawLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    // Si el usuario pega directo desde Excel/CSV con encabezado (sin pasar por
    // "Importar CSV", que sí lo quita), la primera fila no debe crearse como invitado.
    const lines = rawLines.length && isMassInvitationHeaderLine(rawLines[0]) ? rawLines.slice(1) : rawLines;

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
      const current = findCurrentEvent(data);
      setSelectedEventId((current || data[0]).id);
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

  const [liveRefreshTick, setLiveRefreshTick] = useState(0);

  useEffect(() => {
    if (!events.length) return;
    let cancelled = false;
    const loadEventSummaries = async () => {
      const entries = await Promise.all(
        events.map(async (event) => {
          try {
            const { data } = await api.get(`/events/${event.id}/summary`);
            return [event.id, data];
          } catch (error) {
            return [event.id, null];
          }
        }),
      );
      if (!cancelled) {
        setEventSummaries(Object.fromEntries(entries));
      }
    };
    loadEventSummaries();
    return () => {
      cancelled = true;
    };
  }, [events, liveRefreshTick]);

  // Actualizacion en vivo: cualquier ingreso/salida registrado por cualquier
  // scanner refresca de inmediato los tiles del dashboard.
  useEffect(() => {
    return openAttendanceSocket((msg) => {
      if (msg?.type === 'attendance') {
        setLiveRefreshTick((tick) => tick + 1);
      }
    });
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
    const loadInvitationLayout = async () => {
      try {
        const { data } = await api.get('/invitations/template/layout');
        if (data?.name && data?.qr) {
          setLayoutForm(data);
        }
      } catch (error) {
        // se mantienen los valores por defecto
      }
    };
    loadInvitationLayout();
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

  const searchParticipantByCedulaAdmin = async (event) => {
    event.preventDefault();
    if (!selectedEventId) {
      setSearchStatusAdmin('Seleccione un evento antes de buscar.');
      return;
    }
    const { data } = await api.get('/participants/search', { params: { cedula: searchCedulaAdmin, event_id: selectedEventId } });
    if (!data.length) {
      setFoundParticipantAdmin(null);
      setSearchStatusAdmin('No se encontró un invitado con esa cédula en este evento.');
      return;
    }
    setFoundParticipantAdmin(data[0]);
    setSearchStatusAdmin('');
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

  const startEditEvent = (targetEvent) => {
    setEditingEventId(targetEvent.id);
    setEditEventForm({
      name: targetEvent.name || '',
      date: targetEvent.date || '',
      location: targetEvent.location || '',
      schedule: targetEvent.schedule || '',
      capacity: Number(targetEvent.capacity || 0),
      mode: targetEvent.mode || 'ONLINE',
      tickets_per_participant: Number(targetEvent.tickets_per_participant || 1),
    });
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
  };

  const saveEditEvent = async () => {
    await api.put(`/events/${editingEventId}`, editEventForm);
    setStatus('Evento actualizado correctamente.');
    setEditingEventId(null);
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

  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const downloadBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const response = await api.get('/admin/backup', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `backup_asistencia_${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Backup descargado correctamente.');
    } catch (error) {
      setStatus('No se pudo generar el backup.');
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const generateQr = async (participant) => {
    const { data } = await api.get(`/events/${selectedEventId}/qr/${participant.id}`);
    setQrPreview(data);
    setStatus('QR generado para la invitación.');
  };

  const updateLayoutField = (section, field, value) => {
    setLayoutForm((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const saveInvitationLayout = async () => {
    setIsSavingLayout(true);
    try {
      const { data } = await api.put('/invitations/template/layout', layoutForm);
      setLayoutForm(data);
      setStatus('Posición del nombre y el QR guardada.');
    } catch (error) {
      setStatus(`No fue posible guardar la posición. ${getErrorDetail(error, 'Intenta nuevamente.')}`);
    } finally {
      setIsSavingLayout(false);
    }
  };

  const previewInvitationLayout = async () => {
    setIsLoadingLayoutPreview(true);
    try {
      const { data } = await api.get('/invitations/template/preview', {
        params: { name: 'Nombre De Ejemplo Apellido' },
      });
      setLayoutPreviewImage(data.image);
    } catch (error) {
      setStatus(`No fue posible generar la vista previa. ${getErrorDetail(error, 'Verifica que haya una plantilla PDF cargada.')}`);
    } finally {
      setIsLoadingLayoutPreview(false);
    }
  };

  const viewComposedInvitation = async (participant) => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes de armar la invitación.');
      return;
    }
    setIsLoadingComposedInvitation(true);
    try {
      const { data } = await api.get(`/events/${selectedEventId}/invitation/${participant.id}`);
      setComposedInvitation(data);
      setStatus('Invitación armada correctamente.');
    } catch (error) {
      setStatus(`No fue posible armar la invitación. ${getErrorDetail(error, 'Verifica que haya una plantilla PDF cargada.')}`);
    } finally {
      setIsLoadingComposedInvitation(false);
    }
  };

  const generateInvitationsDocument = async (mode = 'view') => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes de generar el documento de invitaciones.');
      return;
    }
    setIsGeneratingInvitationsDocument(true);
    setStatus('Generando documento con todas las invitaciones... puede tardar unos segundos si hay muchos invitados.');
    try {
      const response = await api.get(`/events/${selectedEventId}/invitations/document`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const selectedEvent = events.find((item) => item.id === selectedEventId);
      const safeName = (selectedEvent?.name || 'evento').toLowerCase().replace(/[^a-z0-9]+/g, '_');

      if (mode === 'download') {
        const link = document.createElement('a');
        link.href = url;
        link.download = `invitaciones_${safeName}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setStatus('Documento descargado con todas las invitaciones en PDF.');
      } else {
        window.open(url, '_blank', 'noopener');
        setStatus('Documento generado. Se abrió en una pestaña nueva para revisarlo (también puedes guardarlo desde ahí).');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      let detail = 'Verifica que haya una plantilla PDF cargada y participantes en el evento.';
      if (error?.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          detail = parsed.detail || detail;
        } catch (parseError) {
          // se usa el mensaje genérico
        }
      }
      setStatus(`No fue posible generar el documento de invitaciones. ${detail}`);
    } finally {
      setIsGeneratingInvitationsDocument(false);
    }
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
    setStatus(`Creando invitaciones masivas... 0/${parsed.length}`);
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
      if ((index + 1) % 5 === 0 || index === parsed.length - 1) {
        setStatus(`Creando invitaciones masivas... ${index + 1}/${parsed.length}`);
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
  const openBulkWhatsappPreview = () => {
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }
    const targets = participants.filter((participant) => participant.phone);
    if (!targets.length) {
      setStatus('Ningún participante del evento tiene teléfono registrado.');
      return;
    }
    const fromNote = adminSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${adminSendSettings.whatsappFrom}` : '';
    const whatsappText = `Hola, te invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''}. ${fromNote}`.trim();
    setBulkWhatsappPreview({
      title: 'Vista previa · WhatsApp masivo',
      recipientCount: targets.length,
      body: whatsappText,
      note: 'Se crea una tarjeta en Trello por cada invitado, con su invitación adjunta, para que el equipo la envíe desde WhatsApp Business.',
    });
  };

  const sendAllWhatsApp = async () => {
    if (isSendingWhatsApp) return; // evita doble envío por doble clic mientras está en curso
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }

    const targets = participants.filter((participant) => participant.phone);
    if (!targets.length) {
      setStatus('Ningún participante del evento tiene teléfono registrado.');
      return;
    }

    setIsSendingWhatsApp(true);
    setWhatsappSendProgress({ sent: 0, total: targets.length, errors: 0 });
    const fromNote = adminSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${adminSendSettings.whatsappFrom}` : '';
    const whatsappText = `Hola, te invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''}. ${fromNote}`.trim();
    let createdCount = 0;
    let errorCount = 0;

    for (let index = 0; index < targets.length; index += 1) {
      const participant = targets[index];
      try {
        const { data } = await api.post('/invitations/whatsapp/trello/individual', {
          event_id: selectedEventId,
          participant_id: participant.id,
          whatsapp_text: whatsappText,
        });
        if (data?.created) {
          createdCount += 1;
        } else {
          errorCount += 1;
        }
      } catch (error) {
        errorCount += 1;
      }
      setWhatsappSendProgress({ sent: index + 1, total: targets.length, errors: errorCount });
    }

    setIsSendingWhatsApp(false);
    setStatus(`Trello: tarjetas creadas ${createdCount} de ${targets.length}. Errores ${errorCount}.`);
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

  const sendParticipantWhatsAppReal = async (participant) => {
    const fromNote = adminSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${adminSendSettings.whatsappFrom}` : '';
    const whatsappText = `Hola ${participant.name}. Estás invitado. ${fromNote}`.trim();
    try {
      const { data } = await api.post('/invitations/whatsapp/twilio/individual', {
        event_id: selectedEventId,
        participant_id: participant.id,
        whatsapp_text: whatsappText,
      });
      if (data?.sent) {
        setStatus(`WhatsApp enviado de verdad a ${participant.name} (${participant.phone}) vía Twilio.`);
        return;
      }
      setStatus(`No se pudo enviar por Twilio (${data?.reason || 'sin configurar'}). Nota: en modo Sandbox el número debe haberse unido antes con el código "join ...". Se abrirá WhatsApp directo como respaldo.`);
      sendInvitation(participant, 'whatsapp');
    } catch (error) {
      setStatus(`No fue posible usar Twilio (${getErrorDetail(error, 'sin configurar')}). Se abre WhatsApp directo como respaldo.`);
      sendInvitation(participant, 'whatsapp');
    }
  };

  const openBulkEmailPreview = async () => {
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }
    const targets = participants.filter((participant) => participant.email);
    if (!targets.length) {
      setStatus('Ningún participante del evento tiene correo registrado.');
      return;
    }
    const selectedEvent = events.find((item) => item.id === selectedEventId);
    const sample = targets[0];
    const ticketCount = Math.max(1, Number(sample.ticket_count || 1));
    const ticketWord = ticketCount === 1 ? 'invitación' : 'invitaciones';
    const body = `Hola ${sample.name}, te invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''} el ${selectedEvent?.date || ''}.\n\nAdjuntamos tu(s) ${ticketCount} ${ticketWord} de ingreso, cada una con su código QR único.`;

    setBulkEmailPreview({
      title: 'Vista previa · Email masivo',
      recipientCount: targets.length,
      subject: `Invitación a ${selectedEvent?.name || 'evento'}`,
      body,
      note: !emailConfigured ? 'SMTP no configurado: se abrirá el borrador de correo (mailto) como respaldo en vez de enviar de verdad.' : null,
    });

    if (emailConfigured && invitationTemplate.exists) {
      try {
        const { data } = await api.get(`/events/${selectedEventId}/invitation/${sample.id}`);
        const sampleImage = data?.invitations?.[0]?.image;
        if (sampleImage) {
          setBulkEmailPreview((prev) => (prev ? { ...prev, sampleImage } : prev));
        }
      } catch (error) {
        // sin imagen de muestra no es bloqueante, la vista previa de texto sigue siendo util
      }
    }
  };

  const sendAllEmailReal = async () => {
    if (isSendingBulkEmail) return; // evita doble envío por doble clic mientras está en curso
    if (!selectedEventId) {
      setStatus('Seleccione un evento antes del envío masivo.');
      return;
    }

    if (!emailConfigured) {
      setStatus('SMTP no configurado en el servidor. Se abrirá el borrador de correo masivo como respaldo.');
      await sendAllEmail();
      return;
    }

    const targets = participants.filter((participant) => participant.email);
    if (!targets.length) {
      setStatus('Ningún participante del evento tiene correo registrado.');
      return;
    }

    const selectedEvent = events.find((item) => item.id === selectedEventId);
    setIsSendingBulkEmail(true);
    setEmailSendProgress({ sent: 0, total: targets.length, errors: 0 });
    let sentCount = 0;
    let errorCount = 0;

    for (let index = 0; index < targets.length; index += 1) {
      const participant = targets[index];
      try {
        const { data } = await api.post('/invitations/email/individual', {
          event_id: selectedEventId,
          participant_id: participant.id,
          subject: `Invitación a ${selectedEvent?.name || 'evento'}`,
          body_text: '',
        });
        if (data?.sent) {
          sentCount += 1;
        } else {
          errorCount += 1;
        }
      } catch (error) {
        errorCount += 1;
      }
      setEmailSendProgress({ sent: index + 1, total: targets.length, errors: errorCount });
    }

    setIsSendingBulkEmail(false);
    setStatus(`Envío de correos terminado: ${sentCount} enviados, ${errorCount} con error, de ${targets.length} participantes con correo registrado.`);
  };

  const selectedEventInAdmin = events.find((item) => item.id === selectedEventId);
  const hasSelectedEventInAdmin = Boolean(selectedEventId && selectedEventInAdmin);

  const adminAggregate = Object.values(eventSummaries).reduce(
    (acc, summary) => ({
      participants: acc.participants + Number(summary?.participants_count || 0),
      totalInvitations: acc.totalInvitations + Number(summary?.total_invitations || 0),
      usedInvitations: acc.usedInvitations + Number(summary?.used_invitations || 0),
      insideNow: acc.insideNow + Number(summary?.currently_inside || 0),
    }),
    { participants: 0, totalInvitations: 0, usedInvitations: 0, insideNow: 0 },
  );
  const attendancePct = adminAggregate.totalInvitations
    ? Math.round((adminAggregate.usedInvitations / adminAggregate.totalInvitations) * 100)
    : 0;

  const dashboardTiles = (
    <div className="dash-tiles">
      <div className="dash-tile">
        <div className="dash-label">Ceremonias</div>
        <div className="dash-value">{events.length}</div>
        <div className="dash-sub">eventos configurados</div>
      </div>
      <div className="dash-tile">
        <div className="dash-label">Invitados</div>
        <div className="dash-value">{adminAggregate.participants}</div>
        <div className="dash-sub">en todos los eventos</div>
      </div>
      <div className="dash-tile accent-good">
        <div className="dash-label">Ingresos registrados</div>
        <div className="dash-value">{adminAggregate.usedInvitations}</div>
        <div className="dash-sub">de {adminAggregate.totalInvitations} invitaciones ({attendancePct}%)</div>
      </div>
      <div className="dash-tile">
        <div className="dash-label">Actualmente adentro</div>
        <div className="dash-value">{adminAggregate.insideNow}</div>
        <div className="dash-sub">boletas sin salida registrada</div>
      </div>
      <div className="dash-tile">
        <div className="dash-label">Correo institucional</div>
        <div className="dash-value" style={{ fontSize: '1.1rem' }}>{emailConfigured ? 'Activo' : 'No configurado'}</div>
        <div className="dash-sub">SMTP para envío de invitaciones</div>
      </div>
    </div>
  );

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
        {events.map((event) => {
          const summary = eventSummaries[event.id];
          if (editingEventId === event.id) {
            return (
              <div key={event.id} className="list-item">
                <input value={editEventForm.name} onChange={(e) => setEditEventForm({ ...editEventForm, name: e.target.value })} placeholder="Nombre del evento" />
                <input type="date" value={editEventForm.date} onChange={(e) => setEditEventForm({ ...editEventForm, date: e.target.value })} />
                <input value={editEventForm.location} onChange={(e) => setEditEventForm({ ...editEventForm, location: e.target.value })} placeholder="Lugar" />
                <input value={editEventForm.schedule} onChange={(e) => setEditEventForm({ ...editEventForm, schedule: e.target.value })} placeholder="Horario (ej. 08:00 - 12:00)" />
                <input type="number" value={editEventForm.capacity} onChange={(e) => setEditEventForm({ ...editEventForm, capacity: Number(e.target.value) })} placeholder="Capacidad" />
                <input type="number" min={1} value={editEventForm.tickets_per_participant} onChange={(e) => setEditEventForm({ ...editEventForm, tickets_per_participant: Number(e.target.value) })} placeholder="Invitaciones por participante" />
                <select value={editEventForm.mode} onChange={(e) => setEditEventForm({ ...editEventForm, mode: e.target.value })}>
                  <option value="ONLINE">ONLINE</option>
                  <option value="OFFLINE">OFFLINE</option>
                </select>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={saveEditEvent}>Guardar cambios</button>
                  <button style={{ background: '#e2e8f0', color: '#334155' }} onClick={cancelEditEvent}>Cancelar</button>
                </div>
              </div>
            );
          }
          return (
            <div key={event.id} className="list-item">
              <strong>{event.name}</strong>
              <span>{event.date} · {event.location}</span>
              <span>{event.schedule ? `Horario: ${event.schedule}` : 'Horario no asignado'}</span>
              <span>Modo: {event.mode} · Aforo: {event.capacity} · Invitaciones por invitado: {event.tickets_per_participant || 1}</span>
              {summary && (
                <ProgressBar
                  value={summary.used_invitations}
                  max={summary.total_invitations}
                  label={`Actividad del evento: ${summary.used_invitations} de ${summary.total_invitations} invitaciones usadas · ${summary.participants_count} invitados`}
                  color="#16a34a"
                />
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => startEditEvent(event)}>Editar evento</button>
                <button onClick={() => deleteEvent(event.id)}>Eliminar evento</button>
              </div>
            </div>
          );
        })}
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

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Buscar invitado por cédula</h3>
        <p style={{ marginTop: '-0.25rem', color: '#64748b' }}>
          Consulta el estado de un invitado del evento activo: correos y WhatsApp enviados, e invitaciones usadas.
        </p>
        <form onSubmit={searchParticipantByCedulaAdmin} className="stack">
          <input value={searchCedulaAdmin} onChange={(e) => setSearchCedulaAdmin(e.target.value)} placeholder="Cédula del invitado" disabled={!hasSelectedEventInAdmin} />
          <button type="submit" disabled={!hasSelectedEventInAdmin}>Buscar</button>
        </form>
        {searchStatusAdmin && <div className="badge" style={{ marginTop: '0.5rem' }}>{searchStatusAdmin}</div>}
        {foundParticipantAdmin && (
          <div className="list-item" style={{ marginTop: '0.75rem' }}>
            <strong>{foundParticipantAdmin.name}</strong>
            <span>{foundParticipantAdmin.cedula} · {foundParticipantAdmin.programa || '-'} · {foundParticipantAdmin.sede || '-'}</span>
            <span>{foundParticipantAdmin.email} · {foundParticipantAdmin.phone}</span>
            <span>QR usados: {foundParticipantAdmin.used_qr_count ?? 0} · pendientes: {foundParticipantAdmin.pending_qr_count ?? foundParticipantAdmin.ticket_count ?? 1}</span>
            <SendChecklist participant={foundParticipantAdmin} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => sendParticipantEmailReal(foundParticipantAdmin)}>Enviar correo</button>
              <button onClick={() => sendParticipantWhatsAppReal(foundParticipantAdmin)}>Enviar WhatsApp</button>
            </div>
          </div>
        )}
      </div>

      <div className="stack" style={{ marginTop: '1rem' }}>
        {participants.map((participant) => (
          <div key={participant.id} className="list-item">
            <strong>{participant.name}</strong>
            <span>{participant.cedula} · {participant.programa || '-'} · {participant.sede || '-'}</span>
            <span>{participant.email} · {participant.phone}</span>
            <span>QR usados: {participant.used_qr_count ?? 0} · pendientes: {participant.pending_qr_count ?? participant.ticket_count ?? 1}</span>
            <SendChecklist participant={participant} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => generateQr(participant)}>Generar QR</button>
              <button onClick={() => viewComposedInvitation(participant)} disabled={isLoadingComposedInvitation || !invitationTemplate.exists}>
                Ver invitación armada
              </button>
              <button onClick={() => sendParticipantEmailReal(participant)}>Enviar correo</button>
              <button onClick={() => sendParticipantWhatsAppReal(participant)}>Enviar WhatsApp</button>
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

      {composedInvitation && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Invitación armada: {composedInvitation.participant?.name}</h3>
          <p style={{ marginTop: '-0.25rem', color: '#64748b' }}>Nombre y QR ya combinados sobre la plantilla institucional. Clic derecho → Guardar imagen para descargarla.</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {(composedInvitation.invitations || []).map((invitation) => (
              <div key={invitation.index}>
                <strong>Boleta {invitation.index}</strong>
                <img
                  src={invitation.image}
                  alt={`Invitación ${invitation.index}`}
                  style={{ maxWidth: '260px', display: 'block', marginTop: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const step3 = (
    <>
      <div className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', marginBottom: '0.75rem' }}>
        Para cargar un archivo con muchos participantes, usa el Excel del paso 2. Este paso es solo para pegar manualmente
        unas pocas filas de texto (por ejemplo, invitados agregados de último momento).
      </div>
      <p>Pegue una fila por invitado con este orden: Nombre;Documento;Email;Teléfono;Programa;Sede;Cohorte;Promedio;CantidadQR</p>
      <button type="button" onClick={downloadMassTemplateCsv}>
        Descargar plantilla de ejemplo (formato de referencia)
      </button>
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
        <h3>Posición del nombre y el QR sobre la plantilla</h3>
        <p style={{ marginTop: '-0.25rem', color: '#64748b' }}>
          Define en qué parte de la plantilla se dibuja el nombre del invitado y en qué parte se pega su código QR.
          Los valores de posición y tamaño son porcentajes del ancho/alto de la imagen (0 = borde izquierdo/superior, 1 = borde derecho/inferior).
        </p>
        <div className="card-grid">
          <div>
            <h4>Nombre (primer cuadro)</h4>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Posición horizontal (0-1)</span>
            <input type="number" step="0.01" min="0" max="1" value={layoutForm.name.x} onChange={(e) => updateLayoutField('name', 'x', Number(e.target.value))} />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Posición vertical (0-1)</span>
            <input type="number" step="0.01" min="0" max="1" value={layoutForm.name.y} onChange={(e) => updateLayoutField('name', 'y', Number(e.target.value))} />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Tamaño de letra (px, se reduce solo si el nombre es muy largo)</span>
            <input type="number" min="10" value={layoutForm.name.font_size} onChange={(e) => updateLayoutField('name', 'font_size', Number(e.target.value))} />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Ancho máximo del texto (0-1)</span>
            <input type="number" step="0.01" min="0.1" max="1" value={layoutForm.name.max_width} onChange={(e) => updateLayoutField('name', 'max_width', Number(e.target.value))} />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Color del texto</span>
            <input type="color" value={layoutForm.name.color} onChange={(e) => updateLayoutField('name', 'color', e.target.value)} />
          </div>
          <div>
            <h4>Código QR (cuadro final)</h4>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Posición horizontal (0-1)</span>
            <input type="number" step="0.01" min="0" max="1" value={layoutForm.qr.x} onChange={(e) => updateLayoutField('qr', 'x', Number(e.target.value))} />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Posición vertical (0-1)</span>
            <input type="number" step="0.01" min="0" max="1" value={layoutForm.qr.y} onChange={(e) => updateLayoutField('qr', 'y', Number(e.target.value))} />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Tamaño del QR (0-1 del ancho de la plantilla)</span>
            <input type="number" step="0.01" min="0.05" max="1" value={layoutForm.qr.size} onChange={(e) => updateLayoutField('qr', 'size', Number(e.target.value))} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button type="button" onClick={saveInvitationLayout} disabled={isSavingLayout}>
            {isSavingLayout ? 'Guardando...' : 'Guardar posición'}
          </button>
          <button type="button" onClick={previewInvitationLayout} disabled={isLoadingLayoutPreview || !invitationTemplate.exists}>
            {isLoadingLayoutPreview ? 'Generando vista previa...' : 'Vista previa con nombre de ejemplo'}
          </button>
        </div>
        {!invitationTemplate.exists && (
          <div className="badge" style={{ marginTop: '0.5rem', background: '#fff7ed', color: '#9a3412' }}>
            Carga la plantilla PDF arriba antes de ajustar la posición.
          </div>
        )}
        {layoutPreviewImage && (
          <div style={{ marginTop: '1rem' }}>
            <img src={layoutPreviewImage} alt="Vista previa de la invitación" style={{ maxWidth: '280px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
          </div>
        )}
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
        <h3>Documento con todas las invitaciones</h3>
        <p style={{ marginTop: '-0.25rem', color: '#64748b' }}>
          Genera un PDF con una página por invitación (nombre + QR ya armados) de todo el evento, para revisar de un vistazo que todo quedó correcto antes de enviarlo.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => generateInvitationsDocument('view')} disabled={isGeneratingInvitationsDocument || !hasSelectedEventInAdmin || !invitationTemplate.exists}>
            {isGeneratingInvitationsDocument ? 'Generando documento...' : 'Ver documento de invitaciones'}
          </button>
          <button type="button" onClick={() => generateInvitationsDocument('download')} disabled={isGeneratingInvitationsDocument || !hasSelectedEventInAdmin || !invitationTemplate.exists}>
            {isGeneratingInvitationsDocument ? 'Generando documento...' : 'Descargar todas las invitaciones (PDF)'}
          </button>
        </div>
        {!invitationTemplate.exists && (
          <div className="badge" style={{ marginTop: '0.5rem', background: '#fff7ed', color: '#9a3412' }}>
            Carga la plantilla PDF arriba antes de generar el documento.
          </div>
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
          <button type="button" onClick={openBulkWhatsappPreview} disabled={!hasSelectedEventInAdmin || isSendingWhatsApp} style={{ background: 'var(--surface-alt)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
            Vista previa WhatsApp
          </button>
          <button type="button" onClick={sendAllWhatsApp} disabled={!hasSelectedEventInAdmin || isSendingWhatsApp}>
            {isSendingWhatsApp ? `Programando en Trello... ${whatsappSendProgress?.sent ?? 0}/${whatsappSendProgress?.total ?? 0}` : 'Programar WhatsApp masivo en Trello'}
          </button>
          <button type="button" onClick={openBulkEmailPreview} disabled={!hasSelectedEventInAdmin || isSendingBulkEmail} style={{ background: 'var(--surface-alt)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
            Vista previa Email
          </button>
          <button type="button" onClick={sendAllEmailReal} disabled={!hasSelectedEventInAdmin || isSendingBulkEmail}>
            {isSendingBulkEmail ? `Enviando correos... ${emailSendProgress?.sent ?? 0}/${emailSendProgress?.total ?? 0}` : 'Enviar email masivo'}
          </button>
        </div>
        <PreviewModal
          preview={bulkWhatsappPreview}
          isSending={isSendingWhatsApp}
          onCancel={() => setBulkWhatsappPreview(null)}
          onConfirm={async () => { setBulkWhatsappPreview(null); await sendAllWhatsApp(); }}
        />
        <PreviewModal
          preview={bulkEmailPreview}
          isSending={isSendingBulkEmail}
          onCancel={() => setBulkEmailPreview(null)}
          onConfirm={async () => { setBulkEmailPreview(null); await sendAllEmailReal(); }}
        />
        {isSendingWhatsApp && whatsappSendProgress && (
          <ProgressBar
            value={whatsappSendProgress.sent}
            max={whatsappSendProgress.total}
            label={`Progreso de tarjetas en Trello (${whatsappSendProgress.errors} con error hasta ahora)`}
            color="#25D366"
          />
        )}
        {isSendingBulkEmail && emailSendProgress && (
          <ProgressBar
            value={emailSendProgress.sent}
            max={emailSendProgress.total}
            label={`Progreso de envío (${emailSendProgress.errors} con error hasta ahora)`}
          />
        )}
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

  const step6 = (
    <>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.25rem' }}>
        Descarga una copia completa de la base de datos (eventos, participantes, asistencias y usuarios) en un
        archivo JSON. Es solo lectura: no borra ni modifica nada en el sistema.
      </p>
      <button type="button" onClick={downloadBackup} disabled={isDownloadingBackup}>
        {isDownloadingBackup ? 'Generando backup…' : 'Descargar backup completo (JSON)'}
      </button>
    </>
  );

  return (
    <AdminLayoutFiveSteps
      user={user}
      status={status}
      onLogout={onLogout}
      dashboard={dashboardTiles}
      banner={banner}
      step1={step1}
      step2={step2}
      step3={step3}
      step4={step4}
      step5={step5}
      step6={step6}
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
  const [sendPreview, setSendPreview] = useState(null);
  const [isSendingPreview, setIsSendingPreview] = useState(false);

  const loadEvents = async () => {
    const { data } = await api.get('/events');
    setEvents(data);
    if (!selectedEventId && data.length) {
      const current = findCurrentEvent(data);
      setSelectedEventId((current || data[0]).id);
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

  // Actualizacion en vivo: refresca ingresos/invitados apenas cualquier
  // scanner registre un movimiento en el evento seleccionado.
  useEffect(() => {
    if (!selectedEventId) return undefined;
    const close = openAttendanceSocket((msg) => {
      if (msg?.type === 'attendance' && msg?.payload?.attendance?.event_id === selectedEventId) {
        api.get(`/attendances/${selectedEventId}`).then(({ data }) => setAttendances(data)).catch(() => {});
      }
    });
    return close;
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

  const sendWhatsAppReal = async (person) => {
    const fromNote = logisticSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${logisticSendSettings.whatsappFrom}` : '';
    const whatsappText = `Hola ${person.name}. Estás invitado al evento. ${fromNote}`.trim();
    try {
      const { data } = await api.post('/invitations/whatsapp/twilio/individual', {
        event_id: selectedEventId,
        participant_id: person.id,
        whatsapp_text: whatsappText,
      });
      if (data?.sent) {
        setStatus(`WhatsApp enviado de verdad a ${person.name} (${person.phone}) vía Twilio.`);
        return;
      }
      setStatus(`No se pudo enviar por Twilio (${data?.reason || 'sin configurar'}). Nota: en modo Sandbox el número debe haberse unido antes con "join ...". Se abrirá WhatsApp directo como respaldo.`);
      sendInvitation(person, 'whatsapp');
    } catch (error) {
      setStatus(`No fue posible usar Twilio (${getErrorDetail(error, 'sin configurar')}). Se abre WhatsApp directo como respaldo.`);
      sendInvitation(person, 'whatsapp');
    }
  };

  const selectedEvent = events.find((item) => item.id === selectedEventId);
  const checkedInCount = attendances.length;
  const availableCapacity = selectedEvent ? Number(selectedEvent.capacity || 0) - checkedInCount : 0;

  const openEmailPreview = (person) => {
    const body = `Hola ${person.name}, te invitamos al evento ${selectedEvent?.name || ''} en ${selectedEvent?.location || ''} el ${selectedEvent?.date || ''}.\n\nAdjuntamos tu(s) ${person.ticket_count || 1} invitación(es) de ingreso, cada una con su código QR único.`;
    setSendPreview({
      title: 'Vista previa · Correo individual',
      subject: `Invitación a ${selectedEvent?.name || 'evento'}`,
      body,
      note: `Se enviará a ${person.email || '(sin correo registrado)'}.`,
      onConfirm: () => sendEmailReal(person),
    });
  };

  const openWhatsappPreview = (person) => {
    const fromNote = logisticSendSettings.whatsappFrom ? `Enviar desde WhatsApp: ${logisticSendSettings.whatsappFrom}` : '';
    const whatsappText = `Hola ${person.name}. Estás invitado al evento. ${fromNote}`.trim();
    setSendPreview({
      title: 'Vista previa · WhatsApp individual',
      body: whatsappText,
      note: `Se creará una tarjeta en Trello para ${person.phone || '(sin teléfono registrado)'}.`,
      onConfirm: () => sendWhatsAppReal(person),
    });
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Panel logístico</h1>
          <p>Rol actual: {user.role}</p>
        </div>
        <button onClick={() => onLogout(null)}>Cerrar sesión</button>
      </div>
      {status && (
        <div
          className="badge"
          style={{
            position: 'sticky',
            top: '0.5rem',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
            ...(/no fue posible|error|inválid|no se pudo/i.test(status) ? { background: '#fee2e2', color: '#991b1b' } : {}),
          }}
        >
          {status}
        </div>
      )}

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
          <div className="dash-tiles">
            <div className="dash-tile">
              <div className="dash-label">Ingresos</div>
              <div className="dash-value">{checkedInCount}</div>
              <div className="dash-sub">de {selectedEvent.capacity} de aforo</div>
            </div>
            <div className="dash-tile accent-good">
              <div className="dash-label">Aforo disponible</div>
              <div className="dash-value">{availableCapacity}</div>
              <div className="dash-sub">cupos restantes</div>
            </div>
            <div className="dash-tile">
              <div className="dash-label">Invitados</div>
              <div className="dash-value">{allParticipants.length}</div>
              <div className="dash-sub">registrados en este evento</div>
            </div>
            <div className="dash-tile">
              <div className="dash-label">Invitaciones usadas</div>
              <div className="dash-value">{invitationSummary.used}</div>
              <div className="dash-sub">de {invitationSummary.total} emitidas · {invitationSummary.pending} pendientes</div>
            </div>
          </div>
        )}
        {selectedEvent && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <ProgressBar value={checkedInCount} max={Number(selectedEvent.capacity) || 0} label="Ocupación del aforo" color="var(--brand-cyan)" />
            <ProgressBar value={invitationSummary.used} max={invitationSummary.total} label="Actividad del evento (invitaciones usadas)" color="#16a34a" />
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
              <button type="button" onClick={() => openWhatsappPreview(participant)} style={{ background: 'var(--surface-alt)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Vista previa WhatsApp</button>
              <button type="button" onClick={() => sendWhatsAppReal(participant)}>Enviar WhatsApp</button>
              <button type="button" onClick={() => openEmailPreview(participant)} style={{ background: 'var(--surface-alt)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Vista previa Email</button>
              <button type="button" onClick={() => sendEmailReal(participant)}>Enviar Email</button>
            </div>
          )}
        </div>
        <PreviewModal
          preview={sendPreview}
          isSending={isSendingPreview}
          onCancel={() => setSendPreview(null)}
          onConfirm={async () => {
            const action = sendPreview?.onConfirm;
            setSendPreview(null);
            if (action) {
              setIsSendingPreview(true);
              await action();
              setIsSendingPreview(false);
            }
          }}
        />

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
            <SendChecklist participant={participant} />
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
  const [toast, setToast] = useState(null);
  const [scanDirection, setScanDirection] = useState('in');
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const showToast = (type, text, sub) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ type, text, sub, key: Date.now() });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  const loadEvents = async () => {
    const { data } = await api.get('/events');
    setEvents(data);
    if (!selectedEventId && data.length) {
      const current = findCurrentEvent(data);
      setSelectedEventId((current || data[0]).id);
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

  // Actualizacion en vivo: cuando CUALQUIER scanner (este u otro dispositivo)
  // registra un ingreso/salida, refresca el conteo de este evento al instante.
  useEffect(() => {
    if (!selectedEventId) return undefined;
    const close = openAttendanceSocket((msg) => {
      if (msg?.type === 'attendance' && msg?.payload?.attendance?.event_id === selectedEventId) {
        api.get(`/attendances/${selectedEventId}`).then(({ data }) => setAttendances(data)).catch(() => {});
      }
    });
    return close;
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
        const belongsTo = payload.event_name ? `Este QR es de "${payload.event_name}" (${payload.event_date || ''} ${payload.event_schedule || ''}).` : 'Este QR no corresponde al evento activo.';
        const mismatchMsg = payload.event_id && payload.event_id !== selectedEventId
          ? `${belongsTo} Cambia el "Evento activo" arriba de esta pantalla al evento correcto.`
          : 'QR no encontrado en la lista de invitados de este evento.';
        setStatus(mismatchMsg);
        setScanResult({ participant: { name: 'QR de otro evento', cedula: payload.cedula || '' }, status: 'invalid', message: mismatchMsg, ticketCount: '-' });
        showToast('invalid', mismatchMsg, 'Listo para escanear el siguiente.');
        setLog((prev) => [{ status: 'invalid', message: mismatchMsg, time: new Date().toLocaleTimeString(), participant: payload.cedula }, ...prev]);
        return;
      }

      const ticketCount = Number(participant.ticket_count || 1);

      if (isOnline) {
        const { data } = await api.post('/attendance/scan', {
          event_id: selectedEventId,
          payload: decodedText,
          source: 'online',
          action: scanDirection,
        });
        const message = data.message || (data.status === 'valid' ? 'Registrado correctamente.' : 'Esta boleta ya fue registrada en ese estado.');
        setStatus(message);
        setScanResult({ participant, status: data.status, direction: data.direction, message, ticketCount });
        const updatedAttendances = await api.get(`/attendances/${selectedEventId}`).then((resp) => resp.data).catch(() => attendances);
        setAttendances(updatedAttendances);
        const label = data.direction === 'out' ? 'Salida' : 'Ingreso';
        showToast(
          data.status === 'valid' ? 'valid' : 'duplicate',
          data.status === 'valid' ? `${participant.name} — ${label.toLowerCase()} validado.` : `${participant.name} — ${message}`,
          'Listo para escanear el siguiente.',
        );
        setLog((prev) => [{ status: data.status, message: `${label}: ${message}`, time: new Date().toLocaleTimeString(), participantId: participant.id }, ...prev]);
      } else {
        const queue = (await get(QUEUE_KEY)) || [];
        const item = { event_id: selectedEventId, payload: decodedText, source: 'offline', action: scanDirection };
        await set(QUEUE_KEY, [...queue, item]);
        const message = 'Escaneo guardado para sincronizar cuando vuelva la conexión.';
        setStatus(message);
        setScanResult({ participant, status: 'queued', direction: scanDirection, message, ticketCount });
        showToast('queued', `${participant.name} — guardado offline.`, 'Se sincronizará al volver la conexión. Listo para el siguiente.');
        setLog((prev) => [{ status: 'queued', message, time: new Date().toLocaleTimeString(), participantId: participant.id }, ...prev]);
      }
    } catch (error) {
      setStatus('QR inválido.');
      setScanResult(null);
      showToast('invalid', 'QR inválido.', 'Listo para escanear el siguiente.');
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
      <p>Escanee el QR del invitado para validar su ingreso o salida.</p>
      <div className="badge">{isOnline ? 'ONLINE' : 'OFFLINE'}</div>
      <div className="stack" style={{ marginBottom: '0.8rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Modo de esta estación:</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setScanDirection('in')}
            style={{ flex: 1, background: scanDirection === 'in' ? '#16a34a' : '#e2e8f0', color: scanDirection === 'in' ? 'white' : '#334155' }}
          >
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => setScanDirection('out')}
            style={{ flex: 1, background: scanDirection === 'out' ? '#4f46e5' : '#e2e8f0', color: scanDirection === 'out' ? 'white' : '#334155' }}
          >
            Salida
          </button>
        </div>
      </div>
      {scannerError && (
        <div className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>{scannerError}</div>
      )}
      {toast && (
        <div className={`scan-toast ${toast.type}`} key={toast.key} role="status" aria-live="polite">
          <span className="scan-toast-icon" aria-hidden="true">
            {toast.type === 'valid' ? '✓' : toast.type === 'invalid' ? '✕' : toast.type === 'queued' ? '↻' : '!'}
          </span>
          <span>
            {toast.text}
            {toast.sub && <span className="scan-toast-sub">{toast.sub}</span>}
          </span>
        </div>
      )}
      <div className="card-grid">
        <section className="card">
          <h2>Evento activo</h2>
          <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
          {(() => {
            const activeEvent = events.find((e) => e.id === selectedEventId);
            if (!activeEvent) return null;
            const isToday = activeEvent.date === new Date().toISOString().slice(0, 10);
            return (
              <div className="badge" style={!isToday ? { background: '#fef3c7', color: '#92400e' } : {}}>
                {activeEvent.date} · {activeEvent.schedule || 'sin horario'} {!isToday && '— esta ceremonia NO es hoy, confirma que sea la correcta'}
              </div>
            );
          })()}
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
              <p>
                Estado:{' '}
                {scanResult.status === 'valid'
                  ? scanResult.direction === 'out' ? 'Salida validada' : 'Ingreso validado'
                  : scanResult.status === 'duplicate' ? 'Rechazado (ya estaba en ese estado)'
                  : scanResult.status === 'queued' ? 'Guardado offline, pendiente de sincronizar'
                  : 'Inválido'}
              </p>
              <p>Boletas de este invitado: {scanResult.ticketCount}</p>
            </div>
          ) : (
            <p>Escanee un QR válido para ver el detalle del invitado.</p>
          )}
          <div className="dash-tiles" style={{ marginTop: '1rem' }}>
            <div className="dash-tile">
              <div className="dash-label">Códigos usados</div>
              <div className="dash-value">{attendances.length}</div>
              <div className="dash-sub">en este evento</div>
            </div>
            <div className="dash-tile accent-good">
              <div className="dash-label">Escaneos válidos</div>
              <div className="dash-value">{log.filter((entry) => entry.status === 'valid').length}</div>
              <div className="dash-sub">en esta sesión</div>
            </div>
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
        <div className="brand">
          <img src="/brand/logo-shield.png" alt="Politécnico Internacional" />
          <div className="brand-text">
            <strong>Politécnico Internacional</strong>
            <span>Control de asistencia a grados</span>
          </div>
        </div>
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

