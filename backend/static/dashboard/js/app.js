/**
 * RMHealth Dashboard — Main Application
 * SPA router, view rendering, and state management.
 * © 2025 MORALES ZEPEDA RAUL
 */

(() => {
  'use strict';

  // ── State ──
  let currentView = 'overview';
  let patientsCache = [];
  let currentPatientId = null;

  // ── DOM Refs ──
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Init ──
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Check existing session
    const { token, user } = Auth.loadSession();
    if (token && user) {
      showDashboard(user);
    }

    // Login form
    $('login-form').addEventListener('submit', handleLogin);
    $('logout-btn').addEventListener('click', Auth.logout);

    // Nav buttons
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    // Invite button
    $('generate-invite-btn').addEventListener('click', handleGenerateInvite);

    // Back button in detail
    $('back-to-patients').addEventListener('click', () => navigateTo('patients'));

    // Detail tabs
    $$('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => handleDetailTab(tab.dataset.detail));
    });
  }

  // ── Login ──
  async function handleLogin(e) {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const btn = $('login-btn');
    const errEl = $('login-error');

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    errEl.style.display = 'none';

    try {
      const result = await Auth.login(email, password);

      if (result.requires_2fa) {
        // For now, prompt for 2FA code
        const code = prompt('Ingresa el código de verificación enviado a tu correo:');
        if (!code) {
          btn.disabled = false;
          btn.textContent = 'Iniciar Sesión';
          return;
        }
        const r2 = await Auth.verify2FA(result.user_id, code);
        showDashboard(r2.user);
      } else if (result.success) {
        showDashboard(result.user);
      }
    } catch (err) {
      errEl.textContent = err.message || 'Error de autenticación';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión';
    }
  }

  // ── Show Dashboard ──
  function showDashboard(user) {
    $('login-screen').classList.remove('active');
    $('dashboard-screen').classList.add('active');
    $('doctor-name').textContent = user.full_name || user.email || 'Médico';

    // Set date
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    $('overview-date').textContent = now.toLocaleDateString('es-MX', opts);

    navigateTo('overview');
  }

  // ── Navigation ──
  function navigateTo(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $$('.nav-btn').forEach(b => b.classList.remove('active'));

    const target = $(`view-${view}`);
    if (target) target.classList.add('active');

    const navBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Load data for the view
    if (view === 'overview') loadOverview();
    if (view === 'patients') loadPatients();
  }

  // ── Overview ──
  async function loadOverview() {
    try {
      const data = await DashboardAPI.getDashboardSummary();
      if (data.status === 'success') {
        const s = data.summary;
        $('stat-patients').textContent = s.total_patients;
        $('stat-alerts').textContent = s.active_alerts;
        $('stat-escalations').textContent = s.escalations_24h;
        $('stat-pending').textContent = s.pending_invites;
      }
    } catch (e) {
      console.error('[Dashboard] Summary error:', e);
    }

    // Load recent patients
    try {
      const data = await DashboardAPI.getPatients();
      if (data.status === 'success') {
        patientsCache = data.patients.filter(p => p.status === 'active');
        renderRecentPatients(patientsCache.slice(0, 5));
      }
    } catch (e) {
      console.error('[Dashboard] Patients error:', e);
    }
  }

  function renderRecentPatients(patients) {
    const container = $('recent-patients-list');
    if (!patients.length) {
      container.innerHTML = '<p class="empty-state">No tienes pacientes vinculados. Genera un código de invitación.</p>';
      return;
    }

    container.innerHTML = patients.map(p => {
      const vitals = p.last_vitals;
      let info = 'Sin registros recientes';
      if (vitals) {
        const t = new Date(vitals.timestamp);
        info = `FC: ${vitals.heart_rate} | PA: ${vitals.systolic}/${vitals.diastolic} | SpO2: ${vitals.spo2}% — ${t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
      }
      const alertBadge = p.active_alerts > 0
        ? `<span class="badge badge-danger">${p.active_alerts} alertas</span>`
        : '<span class="badge badge-success">Estable</span>';

      return `
        <div class="patient-row" onclick="App.openPatient('${p.patient_id}', '${p.full_name}')">
          <div>
            <div class="patient-row-name">${p.full_name}</div>
            <div class="patient-row-info">${info}</div>
          </div>
          <div>${alertBadge}</div>
        </div>
      `;
    }).join('');
  }

  // ── Patients List ──
  async function loadPatients() {
    try {
      const data = await DashboardAPI.getPatients();
      if (data.status === 'success') {
        patientsCache = data.patients;
        renderPatientsTable(patientsCache);
      }
    } catch (e) {
      console.error('[Dashboard] Patients error:', e);
    }
  }

  function renderPatientsTable(patients) {
    const tbody = $('patients-tbody');
    if (!patients.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Sin pacientes vinculados</td></tr>';
      return;
    }

    tbody.innerHTML = patients.filter(p => p.status === 'active').map(p => {
      const v = p.last_vitals || {};
      const alertBadge = p.active_alerts > 0
        ? `<span class="badge badge-danger">${p.active_alerts}</span>`
        : '<span class="badge badge-success">0</span>';

      const timestamp = v.timestamp
        ? new Date(v.timestamp).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '--';

      return `
        <tr onclick="App.openPatient('${p.patient_id}', '${p.full_name}')">
          <td><strong>${p.full_name}</strong></td>
          <td>${timestamp}</td>
          <td>${v.heart_rate || '--'}</td>
          <td>${v.systolic || '--'}/${v.diastolic || '--'}</td>
          <td>${v.spo2 || '--'}%</td>
          <td>${v.glucose || '--'}</td>
          <td>${alertBadge}</td>
          <td><button class="btn-sm">Ver detalle</button></td>
        </tr>
      `;
    }).join('');
  }

  // ── Invite ──
  async function handleGenerateInvite() {
    const btn = $('generate-invite-btn');
    btn.disabled = true;
    btn.textContent = 'Generando...';

    try {
      const data = await DashboardAPI.generateInvite();
      if (data.status === 'success') {
        $('invite-code-value').textContent = data.invite_code;
        $('invite-expiry').textContent = `Válido hasta: ${new Date(data.expires_at).toLocaleString('es-MX')}`;
        $('invite-result').style.display = 'block';
      }
    } catch (e) {
      alert('Error generando código: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generar Otro Código';
    }
  }

  // ── Patient Detail ──
  function openPatient(patientId, patientName) {
    currentPatientId = patientId;
    $('detail-patient-name').textContent = patientName;

    // Show detail view
    $$('.view').forEach(v => v.classList.remove('active'));
    $('view-patient-detail').classList.add('active');

    // Reset tabs
    $$('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.detail-tab[data-detail="vitals"]').classList.add('active');

    loadPatientVitals(patientId);
  }

  function handleDetailTab(tab) {
    $$('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.detail-tab[data-detail="${tab}"]`).classList.add('active');

    if (tab === 'vitals') loadPatientVitals(currentPatientId);
    if (tab === 'alerts') loadPatientAlerts(currentPatientId);
    if (tab === 'meds') loadPatientMedications(currentPatientId);
    if (tab === 'profile') loadPatientProfile(currentPatientId);
  }

  async function loadPatientVitals(id) {
    const container = $('detail-content');
    container.innerHTML = '<p class="empty-state">Cargando signos vitales...</p>';

    try {
      const data = await DashboardAPI.getPatientVitals(id);
      if (data.status !== 'success' || !data.records.length) {
        container.innerHTML = '<p class="empty-state">Sin registros de signos vitales</p>';
        return;
      }

      const latest = data.records[0];
      const hrColor = latest.heart_rate > 100 || latest.heart_rate < 50 ? 'var(--danger)' : 'var(--success)';
      const bpColor = latest.systolic > 140 || latest.diastolic > 90 ? 'var(--danger)' : 'var(--success)';
      const spo2Color = latest.spo2 < 92 ? 'var(--danger)' : 'var(--success)';

      container.innerHTML = `
        <div class="vitals-grid">
          <div class="vital-card">
            <div class="vital-card-label">Frecuencia Cardíaca</div>
            <div class="vital-card-value" style="color:${hrColor}">${latest.heart_rate} <span class="vital-card-unit">bpm</span></div>
          </div>
          <div class="vital-card">
            <div class="vital-card-label">Presión Arterial</div>
            <div class="vital-card-value" style="color:${bpColor}">${latest.systolic}/${latest.diastolic} <span class="vital-card-unit">mmHg</span></div>
          </div>
          <div class="vital-card">
            <div class="vital-card-label">SpO2</div>
            <div class="vital-card-value" style="color:${spo2Color}">${latest.spo2} <span class="vital-card-unit">%</span></div>
          </div>
          <div class="vital-card">
            <div class="vital-card-label">Glucosa</div>
            <div class="vital-card-value">${latest.glucose || '--'} <span class="vital-card-unit">mg/dL</span></div>
          </div>
          <div class="vital-card">
            <div class="vital-card-label">Temperatura</div>
            <div class="vital-card-value">${latest.temperature || '--'} <span class="vital-card-unit">°C</span></div>
          </div>
          <div class="vital-card">
            <div class="vital-card-label">Nivel de Riesgo</div>
            <div class="vital-card-value">${latest.risk_level || 'N/A'}</div>
          </div>
        </div>
        <h4 style="margin-top:20px;font-size:14px;font-weight:800;color:var(--text-secondary)">Historial reciente (${data.records.length} registros)</h4>
        <div class="chart-container">
          <canvas id="chart-vitals"></canvas>
        </div>
      `;

      // Draw chart with HR data
      const chartData = data.records.slice(0, 14).reverse().map((r, i) => ({
        value: r.heart_rate,
        label: new Date(r.timestamp).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
        status: r.heart_rate > 100 ? 'danger' : r.heart_rate > 90 ? 'warning' : 'normal',
      }));

      setTimeout(() => Charts.drawBarChart('chart-vitals', chartData), 100);

    } catch (e) {
      container.innerHTML = `<p class="empty-state">Error: ${e.message}</p>`;
    }
  }

  async function loadPatientAlerts(id) {
    const container = $('detail-content');
    container.innerHTML = '<p class="empty-state">Cargando alertas...</p>';

    try {
      const data = await DashboardAPI.getPatientAlerts(id);
      if (data.status !== 'success' || !data.alerts.length) {
        container.innerHTML = '<p class="empty-state">Sin alertas registradas</p>';
        return;
      }

      container.innerHTML = data.alerts.map(a => {
        const sevColor = a.severity === 'HIGH' ? 'var(--danger)' : a.severity === 'MEDIUM' ? 'var(--warning)' : 'var(--info)';
        const sevLabel = a.severity === 'HIGH' ? 'EMERGENCIA' : a.severity === 'MEDIUM' ? 'URGENTE' : 'ALERTA';
        const statusBadge = a.response_type === 'need_help'
          ? '<span class="badge badge-danger">Escalado</span>'
          : a.response_type === 'false_alarm'
            ? '<span class="badge badge-info">Descartado</span>'
            : a.acknowledged
              ? '<span class="badge badge-success">Visto</span>'
              : '<span class="badge badge-warning">Pendiente</span>';

        return `
          <div class="alert-card">
            <div class="alert-sev-bar" style="background:${sevColor}"></div>
            <div class="alert-card-body">
              <div class="alert-card-header">
                <span class="badge" style="background:${sevColor}20;color:${sevColor}">${sevLabel}</span>
                <span class="alert-card-time">${new Date(a.created_at).toLocaleString('es-MX')}</span>
              </div>
              <div class="alert-card-title">${a.title}</div>
              <div class="alert-card-msg">${a.message}</div>
              <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
                <span class="badge badge-info">${a.metric}: ${a.current_value}</span>
                ${statusBadge}
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (e) {
      container.innerHTML = `<p class="empty-state">Error: ${e.message}</p>`;
    }
  }

  async function loadPatientMedications(id) {
    const container = $('detail-content');
    container.innerHTML = '<p class="empty-state">Cargando medicamentos...</p>';

    try {
      const data = await DashboardAPI.getPatientMedications(id);
      if (data.status !== 'success' || !data.medications.length) {
        container.innerHTML = '<p class="empty-state">Sin medicamentos registrados</p>';
        return;
      }

      const typeIcons = { pill: 'Pastilla', injection: 'Inyectable', liquid: 'Liquido', patch: 'Parche', inhaler: 'Inhalador' };

      container.innerHTML = `
        <table class="data-table" style="margin:0">
          <thead><tr><th>Nombre</th><th>Dosis</th><th>Frecuencia</th><th>Tipo</th><th>Prescriptor</th><th>Estado</th></tr></thead>
          <tbody>
            ${data.medications.map(m => `
              <tr>
                <td><strong>${m.name}</strong></td>
                <td>${m.dosage || '--'}</td>
                <td>${m.frequency || '--'}</td>
                <td>${typeIcons[m.med_type] || m.med_type || '--'}</td>
                <td>${m.doctor || '--'}</td>
                <td>${m.active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-info">Inactivo</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      container.innerHTML = `<p class="empty-state">Error: ${e.message}</p>`;
    }
  }

  async function loadPatientProfile(id) {
    const container = $('detail-content');
    container.innerHTML = '<p class="empty-state">Cargando perfil...</p>';

    try {
      const data = await DashboardAPI.getPatientProfile(id);
      if (data.status !== 'success') {
        container.innerHTML = '<p class="empty-state">Error cargando perfil</p>';
        return;
      }

      const p = data.profile;

      container.innerHTML = `
        <div class="profile-section">
          <div class="profile-section-title">Información General</div>
          <div class="profile-item"><span class="profile-item-label">Nombre</span><span class="profile-item-value">${p.full_name}</span></div>
          <div class="profile-item"><span class="profile-item-label">Email</span><span class="profile-item-value">${p.email}</span></div>
          <div class="profile-item"><span class="profile-item-label">Idioma</span><span class="profile-item-value">${p.language === 'es' ? 'Español' : 'English'}</span></div>
          <div class="profile-item"><span class="profile-item-label">Miembro desde</span><span class="profile-item-value">${new Date(p.member_since).toLocaleDateString('es-MX')}</span></div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Condiciones Médicas (${p.conditions.length})</div>
          ${p.conditions.length
            ? p.conditions.map(c => `
              <div class="profile-item">
                <span class="profile-item-label">${c.name}</span>
                <span class="profile-item-value">${c.status || 'Activa'} ${c.treating_doctor ? '— Dr. ' + c.treating_doctor : ''}</span>
              </div>
            `).join('')
            : '<p class="empty-state" style="padding:8px">Sin condiciones registradas</p>'
          }
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Alergias (${p.allergies.length})</div>
          ${p.allergies.length
            ? p.allergies.map(a => `
              <div class="profile-item">
                <span class="profile-item-label">${a.agent}</span>
                <span class="profile-item-value">${a.severity} — ${a.allergy_type}</span>
              </div>
            `).join('')
            : '<p class="empty-state" style="padding:8px">Sin alergias registradas</p>'
          }
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Contactos de Emergencia (${p.emergency_contacts.length})</div>
          ${p.emergency_contacts.length
            ? p.emergency_contacts.map(c => `
              <div class="profile-item">
                <span class="profile-item-label">${c.name} (${c.relationship})</span>
                <span class="profile-item-value">${c.phone} ${c.is_primary ? '— Primario' : ''}</span>
              </div>
            `).join('')
            : '<p class="empty-state" style="padding:8px">Sin contactos registrados</p>'
          }
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p class="empty-state">Error: ${e.message}</p>`;
    }
  }

  // ── Expose for onclick handlers ──
  window.App = { openPatient };

})();
