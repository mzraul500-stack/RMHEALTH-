-- ============================================================
-- RMHealth — Patient Profiles Table
-- ============================================================
-- Run this against the rmhealth_medical PostgreSQL database.
-- This replaces the hardcoded PatientContext with real profiles.
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (
    id              SERIAL PRIMARY KEY,
    usuario_id      VARCHAR(64) UNIQUE NOT NULL,  -- Must match vital_signs.usuario_id
    nombre_completo VARCHAR(200) NOT NULL,
    edad            INTEGER NOT NULL CHECK (edad BETWEEN 0 AND 120),
    tipo_sangre     VARCHAR(10) DEFAULT 'No especificado',

    -- Comorbidities (affect ML risk multiplier)
    diabetico       BOOLEAN DEFAULT FALSE,
    hipertenso      BOOLEAN DEFAULT FALSE,
    cardiopata      BOOLEAN DEFAULT FALSE,
    alergias        TEXT DEFAULT '',

    -- Emergency contact
    contacto_nombre VARCHAR(200) DEFAULT '',
    contacto_tel    VARCHAR(20) DEFAULT '',   -- E.164 format: +521234567890

    -- Metadata
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup during vital sign processing
CREATE INDEX IF NOT EXISTS idx_patients_usuario_id ON patients(usuario_id);

-- ============================================================
-- Seed: Insert YOUR profile as the first real patient
-- CHANGE THESE VALUES to match your real data.
-- ============================================================
INSERT INTO patients (usuario_id, nombre_completo, edad, tipo_sangre, diabetico, hipertenso, cardiopata, alergias, contacto_nombre, contacto_tel)
VALUES (
    'raul_morales_001',
    'Raul Morales Zepeda',
    30,                        -- Cambia a tu edad real
    'O+',                      -- Cambia a tu tipo de sangre
    FALSE,                     -- ¿Diabético?
    FALSE,                     -- ¿Hipertenso?
    FALSE,                     -- ¿Cardiopatía?
    '',                        -- Alergias separadas por coma
    'Contacto de Emergencia',  -- Nombre del contacto
    '+521234567890'            -- Teléfono del contacto (E.164)
)
ON CONFLICT (usuario_id) DO NOTHING;
