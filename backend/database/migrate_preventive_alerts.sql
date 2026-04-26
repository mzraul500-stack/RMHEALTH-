-- RMHEALTH: Preventive Alerts Table
-- Migration for user-specific preventive trend alerts
-- PostgreSQL 15+ compatible

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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prev_alerts_user ON preventive_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prev_alerts_dedup ON preventive_alerts(user_id, metric, severity, data_window, created_at DESC);
