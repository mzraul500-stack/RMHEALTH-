-- =============================================================================
-- RMHEALTH MEDICAL SYSTEM - DATABASE SCHEMA
-- =============================================================================
-- PostgreSQL with TimescaleDB Extension for Time-Series Vital Signs
-- Date: April 20, 2026
-- HIPAA Compliant Medical Database

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS AND AUTHENTICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'admin', 'nurse')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20),
    blood_type VARCHAR(5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255)
);

-- Index for fast email lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- =============================================================================
-- PATIENT MEDICAL PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    medical_record_number VARCHAR(50) UNIQUE,
    allergies JSONB DEFAULT '[]',
    chronic_conditions JSONB DEFAULT '[]',
    medications JSONB DEFAULT '[]',
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    emergency_notes TEXT,
    insurance_provider VARCHAR(100),
    insurance_policy VARCHAR(50),
    primary_physician_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patient_profiles_user ON patient_profiles(user_id);
CREATE INDEX idx_patient_profiles_mrn ON patient_profiles(medical_record_number);

-- =============================================================================
-- VITAL SIGNS - TIME-SERIES TABLE (TimescaleDB Hypertable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vital_signs (
    id UUID DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Core vital signs
    heart_rate DECIMAL(5,2),
    blood_pressure_systolic DECIMAL(5,2),
    blood_pressure_diastolic DECIMAL(5,2),
    oxygen_saturation DECIMAL(5,2),
    temperature_celsius DECIMAL(4,2),
    respiratory_rate DECIMAL(5,2),
    glucose_level DECIMAL(6,2),
    
    -- Additional metrics
    hrv_ms DECIMAL(6,2),  -- Heart Rate Variability
    steps_count INTEGER,
    calories_burned DECIMAL(8,2),
    sleep_quality_score DECIMAL(3,2),
    
    -- Source and quality
    source VARCHAR(50) DEFAULT 'wearable',  -- wearable, manual, hospital
    device_id VARCHAR(100),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    
    -- Risk assessment (calculated by AI)
    risk_level VARCHAR(20) DEFAULT 'normal',
    anomaly_detected BOOLEAN DEFAULT FALSE,
    anomaly_type VARCHAR(100),
    
    PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable for efficient time-series queries
SELECT create_hypertable('vital_signs', 'timestamp', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes for common queries
CREATE INDEX idx_vital_signs_patient_time ON vital_signs(patient_id, timestamp DESC);
CREATE INDEX idx_vital_signs_anomaly ON vital_signs(patient_id, anomaly_detected) WHERE anomaly_detected = TRUE;
CREATE INDEX idx_vital_signs_risk ON vital_signs(risk_level, timestamp DESC) WHERE risk_level IN ('high', 'critical');

-- =============================================================================
-- EMERGENCY CONTACTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    phone_primary VARCHAR(20) NOT NULL,
    phone_secondary VARCHAR(20),
    email VARCHAR(255),
    is_primary BOOLEAN DEFAULT FALSE,
    notify_on_emergency BOOLEAN DEFAULT TRUE,
    notification_preference VARCHAR(20) DEFAULT 'sms',  -- sms, call, email, all
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emergency_contacts_patient ON emergency_contacts(patient_id);

-- Ensure only one primary contact per patient
CREATE UNIQUE INDEX idx_emergency_contacts_primary 
    ON emergency_contacts(patient_id) 
    WHERE is_primary = TRUE;

-- =============================================================================
-- HOSPITALS AND HEALTHCARE FACILITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS hospitals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'general',  -- general, specialty, clinic, emergency
    
    -- Location (PostGIS)
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Mexico',
    postal_code VARCHAR(20),
    
    -- Contact
    phone_emergency VARCHAR(20),
    phone_general VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    
    -- Capabilities
    specialties JSONB DEFAULT '[]',
    has_emergency_room BOOLEAN DEFAULT TRUE,
    has_icu BOOLEAN DEFAULT FALSE,
    has_cardiac_care BOOLEAN DEFAULT FALSE,
    has_stroke_center BOOLEAN DEFAULT FALSE,
    
    -- Capacity and availability
    total_beds INTEGER,
    available_beds INTEGER,
    emergency_wait_minutes INTEGER,
    last_capacity_update TIMESTAMPTZ,
    
    -- Integration
    fhir_endpoint VARCHAR(500),
    hl7_capable BOOLEAN DEFAULT FALSE,
    integration_status VARCHAR(50) DEFAULT 'pending',
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    verified BOOLEAN DEFAULT FALSE,
    rating DECIMAL(2,1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for fast proximity searches
CREATE INDEX idx_hospitals_location ON hospitals USING GIST(location);
CREATE INDEX idx_hospitals_active ON hospitals(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- EMERGENCY ALERTS AND INCIDENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS emergency_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id),
    
    -- Alert details
    alert_type VARCHAR(50) NOT NULL,  -- cardiac, glucose, fall, manual, other
    severity VARCHAR(20) NOT NULL,     -- low, medium, high, critical
    status VARCHAR(50) DEFAULT 'active',  -- active, acknowledged, dispatched, resolved, cancelled
    
    -- Vital signs at time of alert
    vital_signs_snapshot JSONB NOT NULL,
    anomaly_details JSONB,
    
    -- Location at time of alert
    patient_location GEOGRAPHY(POINT, 4326),
    location_accuracy_meters DECIMAL(8,2),
    
    -- Hospital assignment
    assigned_hospital_id UUID REFERENCES hospitals(id),
    hospital_eta_minutes INTEGER,
    hospital_notified_at TIMESTAMPTZ,
    hospital_acknowledged_at TIMESTAMPTZ,
    
    -- Response tracking
    emergency_contacts_notified JSONB DEFAULT '[]',
    ambulance_dispatched BOOLEAN DEFAULT FALSE,
    ambulance_dispatch_time TIMESTAMPTZ,
    
    -- AI analysis
    ai_risk_score DECIMAL(5,2),
    ai_recommendations JSONB,
    ai_confidence DECIMAL(3,2),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- FHIR integration
    fhir_alert_id VARCHAR(100),
    fhir_sent_at TIMESTAMPTZ
);

CREATE INDEX idx_emergency_alerts_patient ON emergency_alerts(patient_id, created_at DESC);
CREATE INDEX idx_emergency_alerts_status ON emergency_alerts(status, created_at DESC);
CREATE INDEX idx_emergency_alerts_severity ON emergency_alerts(severity) WHERE status = 'active';

-- =============================================================================
-- AUDIT LOG (HIPAA Compliance)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    
    -- Action details
    action VARCHAR(100) NOT NULL,  -- login, view_patient, update_record, etc.
    resource_type VARCHAR(100),     -- patient, vital_signs, emergency_alert, etc.
    resource_id UUID,
    
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    
    -- Data changes (for updates/deletes)
    old_values JSONB,
    new_values JSONB,
    
    -- Result
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Convert audit_log to hypertable for efficient time-based queries
SELECT create_hypertable('audit_log', 'timestamp', 
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, timestamp DESC);

-- =============================================================================
-- DOCTOR-PATIENT ASSIGNMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS doctor_patient_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES users(id),
    patient_id UUID NOT NULL REFERENCES users(id),
    assignment_type VARCHAR(50) DEFAULT 'primary',  -- primary, specialist, temporary
    specialty VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    
    CONSTRAINT unique_doctor_patient_type UNIQUE (doctor_id, patient_id, assignment_type)
);

CREATE INDEX idx_assignments_doctor ON doctor_patient_assignments(doctor_id) WHERE is_active = TRUE;
CREATE INDEX idx_assignments_patient ON doctor_patient_assignments(patient_id) WHERE is_active = TRUE;

-- =============================================================================
-- CONTINUOUS AGGREGATES FOR DASHBOARD PERFORMANCE
-- =============================================================================

-- Hourly vital signs aggregates (for dashboard charts)
CREATE MATERIALIZED VIEW IF NOT EXISTS vital_signs_hourly
WITH (timescaledb.continuous) AS
SELECT
    patient_id,
    time_bucket('1 hour', timestamp) AS bucket,
    AVG(heart_rate) AS avg_heart_rate,
    MIN(heart_rate) AS min_heart_rate,
    MAX(heart_rate) AS max_heart_rate,
    AVG(blood_pressure_systolic) AS avg_bp_systolic,
    AVG(blood_pressure_diastolic) AS avg_bp_diastolic,
    AVG(oxygen_saturation) AS avg_oxygen,
    AVG(glucose_level) AS avg_glucose,
    COUNT(*) AS reading_count,
    SUM(CASE WHEN anomaly_detected THEN 1 ELSE 0 END) AS anomaly_count
FROM vital_signs
GROUP BY patient_id, bucket
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('vital_signs_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- =============================================================================
-- DATA RETENTION POLICIES (HIPAA: 7 years for medical records)
-- =============================================================================

-- Vital signs: retain for 7 years (2557 days)
SELECT add_retention_policy('vital_signs', INTERVAL '2557 days', if_not_exists => TRUE);

-- Audit logs: retain for 7 years
SELECT add_retention_policy('audit_log', INTERVAL '2557 days', if_not_exists => TRUE);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_profiles_updated_at BEFORE UPDATE ON patient_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_contacts_updated_at BEFORE UPDATE ON emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hospitals_updated_at BEFORE UPDATE ON hospitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DATA: Sample Hospitals in Mexico City
-- =============================================================================

INSERT INTO hospitals (name, type, location, address, city, state, phone_emergency, has_emergency_room, has_icu, has_cardiac_care, specialties)
VALUES 
    ('Hospital ABC Santa Fe', 'general', ST_SetSRID(ST_MakePoint(-99.2647, 19.3590), 4326), 
     'Av. Carlos Graef Fernández 154', 'Ciudad de México', 'CDMX', '+525516471111', 
     TRUE, TRUE, TRUE, '["cardiology", "neurology", "trauma", "pediatrics"]'),
    
    ('Instituto Nacional de Cardiología', 'specialty', ST_SetSRID(ST_MakePoint(-99.1576, 19.2919), 4326),
     'Juan Badiano 1', 'Ciudad de México', 'CDMX', '+525555732911',
     TRUE, TRUE, TRUE, '["cardiology", "cardiac_surgery", "vascular"]'),
    
    ('Hospital General de México', 'general', ST_SetSRID(ST_MakePoint(-99.1393, 19.4115), 4326),
     'Dr. Balmis 148', 'Ciudad de México', 'CDMX', '+525527892000',
     TRUE, TRUE, TRUE, '["general", "trauma", "oncology", "neurology"]'),
    
    ('Hospital Médica Sur', 'general', ST_SetSRID(ST_MakePoint(-99.1765, 19.3031), 4326),
     'Puente de Piedra 150', 'Ciudad de México', 'CDMX', '+525554247200',
     TRUE, TRUE, TRUE, '["cardiology", "oncology", "orthopedics", "neurology"]'),
    
    ('Hospital Ángeles Pedregal', 'general', ST_SetSRID(ST_MakePoint(-99.1889, 19.3116), 4326),
     'Camino a Santa Teresa 1055', 'Ciudad de México', 'CDMX', '+525556527100',
     TRUE, TRUE, TRUE, '["cardiology", "trauma", "pediatrics", "obstetrics"]')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- GRANTS AND PERMISSIONS
-- =============================================================================

-- Create roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rmhealth_readonly') THEN
        CREATE ROLE rmhealth_readonly;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rmhealth_readwrite') THEN
        CREATE ROLE rmhealth_readwrite;
    END IF;
END
$$;

-- Grant permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO rmhealth_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rmhealth_readwrite;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rmhealth_readwrite;

-- =============================================================================
-- COMPLETED - RMHealth Medical Database Schema
-- =============================================================================
