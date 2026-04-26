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
