-- RMHEALTH Phase 7 — Record Corrections (Immutability)
-- Append-only corrections for medical records
-- NOM-004 compliant: records are never edited, only annotated

CREATE TABLE IF NOT EXISTS record_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL,       -- vital_sign | medication | emergency_alert | preventive_alert
    record_id TEXT NOT NULL,         -- ID of the original record
    correction_note TEXT NOT NULL,   -- Free-text correction/annotation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_corrections_record
    ON record_corrections(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_corrections_user
    ON record_corrections(user_id, created_at DESC);

-- Add retention tracking to users (NOM-004: 5 years minimum)
ALTER TABLE users ADD COLUMN IF NOT EXISTS
    retention_until TIMESTAMP WITH TIME ZONE;

-- Set default retention for existing users (5 years from now)
UPDATE users SET retention_until = CURRENT_TIMESTAMP + INTERVAL '5 years'
    WHERE retention_until IS NULL;
