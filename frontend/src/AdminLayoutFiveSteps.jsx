import { useMemo } from 'react';

/**
 * Layout de administración dividido en 5 pasos.
 *
 * Este componente no implementa lógica de negocio: solo organiza el JSX en pasos.
 * Requiere props que ya maneja `AdminPage` dentro de `App.jsx`.
 */
export default function AdminLayoutFiveSteps({
  user,
  status,
  onLogout,
  dashboard,
  banner,
  step1,
  step2,
  step3,
  step4,
  step5,
  step6,
}) {
  const header = useMemo(
    () => (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Panel administrativo</h1>
          <p>Rol actual: {user?.role}</p>
        </div>
        <button onClick={() => onLogout(null)}>Cerrar sesión</button>
      </div>
    ),
    [onLogout, user?.role],
  );

  const isErrorStatus = Boolean(status) && /no fue posible|error|inválid|no se pudo/i.test(status);

  return (
    <div className="page">
      {header}
      {dashboard}
      {status ? (
        <div
          className="badge"
          style={{
            position: 'sticky',
            top: '0.5rem',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
            ...(isErrorStatus ? { background: '#fee2e2', color: '#991b1b' } : {}),
          }}
        >
          {status}
        </div>
      ) : null}
      {banner}

      <div className="card-grid">
        <section className="card">
          <h2>1) Crear eventos</h2>
          {step1}
        </section>

        <section className="card">
          <h2>2) Crear participantes (individual + import Excel)</h2>
          {step2}
        </section>

        <section className="card">
          <h2>3) Carga masiva (CSV/PDF → participantes)</h2>
          {step3}
        </section>

        <section className="card">
          <h2>4) Creación de invitaciones (armar + preview + QR)</h2>
          {step4}
        </section>

        <section className="card">
          <h2>5) Usuarios que manejan la app</h2>
          {step5}
        </section>

        <section className="card">
          <h2>6) Backup y mantenimiento</h2>
          {step6}
        </section>
      </div>
    </div>
  );
}



