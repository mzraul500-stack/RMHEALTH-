-- RMHEALTH PRODUCTION DATABASE SCHEMA
-- PostgreSQL 15+ compatible
-- Optimized for Medical Records and Real-time Monitoring

-- 1. Table for Patient Profiles
CREATE TABLE IF NOT EXISTS patients (
    usuario_id TEXT PRIMARY KEY,
    nombre_completo TEXT NOT NULL,
    edad INTEGER,
    genero TEXT,
    tipo_sangre TEXT,
    diabetico BOOLEAN DEFAULT FALSE,
    hipertenso BOOLEAN DEFAULT FALSE,
    cardiopata BOOLEAN DEFAULT FALSE,
    contacto_nombre TEXT,
    contacto_tel TEXT,
    alergias TEXT[], -- Array of strings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table for Real-time Vital Signs (Time-series)
CREATE TABLE IF NOT EXISTS vital_signs (
    id SERIAL PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES patients(usuario_id),
    ritmo_cardiaco INTEGER,
    spo2 INTEGER,
    presion_sistolica INTEGER,
    presion_diastolica INTEGER,
    temperatura REAL,
    glucosa REAL,
    ecg REAL,
    ppg REAL,
    dispositivo_id TEXT,
    ubicacion_lat DOUBLE PRECISION,
    ubicacion_lon DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table for Emergency Alerts
CREATE TABLE IF NOT EXISTS emergency_alerts (
    id SERIAL PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES patients(usuario_id),
    tipo_emergencia TEXT NOT NULL, -- CRISIS_HIPERTENSIVA, FALL_DETECTED, etc.
    descripcion TEXT,
    severidad TEXT, -- CRITICAL, HIGH, MEDIUM
    ubicacion_lat DOUBLE PRECISION,
    ubicacion_lon DOUBLE PRECISION,
    estado TEXT DEFAULT 'activa', -- activa, atendida, falsa_alarma
    hospital_asignado TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table for Medication Adherence
CREATE TABLE IF NOT EXISTS medications (
    id SERIAL PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES patients(usuario_id),
    nombre_medicina TEXT NOT NULL,
    dosis TEXT,
    horario TIME NOT NULL,
    dias_semana TEXT[], -- ['Lun', 'Mie', 'Vie']
    activo BOOLEAN DEFAULT TRUE,
    ultima_toma TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vitals_user_time ON vital_signs(usuario_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_emergencies_user ON emergency_alerts(usuario_id);
CREATE INDEX IF NOT EXISTS idx_meds_user ON medications(usuario_id);

-- 5. Table for Preventive Trend Alerts
CREATE TABLE IF NOT EXISTS preventive_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    metric TEXT NOT NULL,           -- heart_rate, systolic, diastolic, spo2, glucose
    severity TEXT NOT NULL,         -- LOW, MEDIUM, HIGH
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    baseline_value REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    delta REAL DEFAULT 0,
    data_window TEXT NOT NULL,      -- 15m, 2h, 24h
    source TEXT DEFAULT 'unknown',  -- manual, health_connect, unknown
    requires_human_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_prev_alerts_user ON preventive_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prev_alerts_dedup ON preventive_alerts(user_id, metric, severity, data_window, created_at DESC);

-- ================================================================
-- 6. Authentication & Security (M1 + M8)
-- ================================================================

-- 6a. Users table — central auth identity
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,        -- bcrypt salt:12
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'PACIENTE',  -- PACIENTE | CUIDADOR | MEDICO
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_code TEXT,               -- 6-digit code (transient)
    two_factor_expires_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    automatic_escalation_consent BOOLEAN DEFAULT FALSE,
    language TEXT DEFAULT 'es',
    patient_id TEXT REFERENCES patients(usuario_id),  -- link to medical profile
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6b. Refresh tokens for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,           -- SHA-256 of the refresh token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6c. Login attempt audit log (rate limiting + security)
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    ip_address TEXT,
    success BOOLEAN NOT NULL,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Auth indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, revoked);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, timestamp DESC);

-- ================================================================
-- 7. Granular Consent (M2 — GDPR/LFPDPPP)
-- ================================================================

CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL,           -- vital_signs | location | medications | emergency_contacts | analytics
    accepted BOOLEAN NOT NULL DEFAULT TRUE,
    text_version TEXT NOT NULL DEFAULT '1.0',
    ip_address TEXT,
    user_agent TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,  -- NULL = active, set = revoked
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, consent_type, revoked_at);

-- ================================================================
-- 8. Medical Profile (M3)
-- ================================================================

CREATE TABLE IF NOT EXISTS allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent TEXT NOT NULL,
    allergy_type TEXT DEFAULT 'medication',   -- medication | food | environmental | other
    severity TEXT DEFAULT 'moderate',          -- mild | moderate | severe | life_threatening
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    diagnosis_date DATE,
    treating_doctor TEXT,
    status TEXT DEFAULT 'active',             -- active | managed | resolved
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    notify_on_emergency BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_card_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_allergies_user ON allergies(user_id, active);
CREATE INDEX IF NOT EXISTS idx_conditions_user ON medical_conditions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_card_tokens ON emergency_card_tokens(token);
