-- =============================================================================
-- EXTENSIÓN DE BASE DE DATOS PARA WEARABLES
-- =============================================================================
-- Autor: RM HEALTH - Integración Smartwatch
-- Fecha: 2026-04-21
-- Descripción: Tablas para almacenar datos de dispositivos wearables y alertas médicas
-- Compatibilidad: PostgreSQL 13+ con extensiones PostGIS y TimescaleDB

-- =============================================================================
-- TABLAS PARA DATOS DE WEARABLES
-- =============================================================================

-- Tabla principal para datos de wearables
CREATE TABLE IF NOT EXISTS wearable_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN (
        'apple_watch', 'samsung_watch', 'fitbit', 'garmin', 'wear_os', 'generic'
    )),
    device_id VARCHAR(100) NOT NULL,
    device_model VARCHAR(100),
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN (
        'heart_rate', 'blood_pressure', 'spo2', 'ecg', 'activity', 
        'steps', 'sleep', 'stress', 'body_temperature', 'fall_detection'
    )),
    value JSONB NOT NULL,
    unit VARCHAR(20),
    recorded_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    metadata JSONB DEFAULT '{}',
    fhir_observation JSONB,
    is_critical BOOLEAN DEFAULT FALSE,
    
    -- Índices para rendimiento
    CONSTRAINT wearable_data_unique_record UNIQUE (patient_id, device_id, data_type, recorded_at)
);

-- Crear hypertable para datos time-series (si TimescaleDB está disponible)
DO $$
BEGIN
    -- Intentar crear hypertable, fallar silenciosamente si no hay TimescaleDB
    PERFORM create_hypertable('wearable_data', 'recorded_at', if_not_exists => TRUE);
    RAISE NOTICE 'TimescaleDB hypertable created for wearable_data';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'TimescaleDB not available, using regular table for wearable_data';
END$$;

-- Índices optimizados para consultas wearables
CREATE INDEX IF NOT EXISTS idx_wearable_data_patient_time 
    ON wearable_data(patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_wearable_data_type_time 
    ON wearable_data(patient_id, data_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_wearable_data_device 
    ON wearable_data(device_id, device_type);

CREATE INDEX IF NOT EXISTS idx_wearable_data_critical 
    ON wearable_data(patient_id, is_critical, recorded_at DESC);

-- Índice GIN para metadata JSONB
CREATE INDEX IF NOT EXISTS idx_wearable_data_metadata_gin 
    ON wearable_data USING GIN (metadata);

-- =============================================================================
-- TABLAS PARA ALERTAS MÉDICAS
-- =============================================================================

-- Tabla para alertas médicas generadas por wearables
CREATE TABLE IF NOT EXISTS health_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'bradycardia', 'tachycardia', 'hypertension', 'hypotension',
        'low_oxygen', 'fall_detected', 'arrhythmia', 'abnormal_sleep',
        'high_stress', 'device_error', 'data_anomaly'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    triggered_by JSONB NOT NULL, -- Información del dato que disparó la alerta
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolution_timestamp TIMESTAMPTZ,
    resolution_note TEXT,
    
    -- Metadata adicional
    notification_sent BOOLEAN DEFAULT FALSE,
    emergency_contacts_notified BOOLEAN DEFAULT FALSE,
    physician_notified BOOLEAN DEFAULT FALSE
);

-- Índices para alertas
CREATE INDEX IF NOT EXISTS idx_health_alerts_patient_time 
    ON health_alerts(patient_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_health_alerts_severity 
    ON health_alerts(patient_id, severity, acknowledged);

CREATE INDEX IF NOT EXISTS idx_health_alerts_type 
    ON health_alerts(alert_type, severity, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_health_alerts_unacknowledged 
    ON health_alerts(patient_id, acknowledged, severity) WHERE acknowledged = FALSE;

-- Índice GIN para triggered_by JSONB
CREATE INDEX IF NOT EXISTS idx_health_alerts_triggered_by_gin 
    ON health_alerts USING GIN (triggered_by);

-- =============================================================================
-- TABLAS PARA AUTENTICACIÓN DE DISPOSITIVOS
-- =============================================================================

-- Tabla para tokens de autenticación de wearables
CREATE TABLE IF NOT EXISTS wearable_auth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    access_token_hash VARCHAR(256) NOT NULL, -- Hash del token, no almacenar en texto plano
    refresh_token_hash VARCHAR(256),
    expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Constraint único por paciente y dispositivo
    CONSTRAINT wearable_auth_unique_device UNIQUE (patient_id, device_id)
);

-- Índices para autenticación
CREATE INDEX IF NOT EXISTS idx_wearable_auth_tokens_patient 
    ON wearable_auth_tokens(patient_id, is_active);

CREATE INDEX IF NOT EXISTS idx_wearable_auth_tokens_device 
    ON wearable_auth_tokens(device_id, is_active);

CREATE INDEX IF NOT EXISTS idx_wearable_auth_tokens_expires 
    ON wearable_auth_tokens(expires_at) WHERE is_active = TRUE;

-- =============================================================================
-- VISTAS PARA CONSULTAS OPTIMIZADAS
-- =============================================================================

-- Vista para últimos datos por tipo de dispositivo
CREATE OR REPLACE VIEW latest_wearable_data AS
SELECT DISTINCT ON (patient_id, data_type, device_id)
    patient_id,
    device_type,
    device_id,
    data_type,
    value,
    unit,
    recorded_at,
    confidence,
    is_critical
FROM wearable_data
ORDER BY patient_id, data_type, device_id, recorded_at DESC;

-- Vista para alertas activas (no reconocidas)
CREATE OR REPLACE VIEW active_health_alerts AS
SELECT 
    ha.*,
    p.first_name,
    p.last_name,
    p.email
FROM health_alerts ha
JOIN patients p ON ha.patient_id = p.id
WHERE ha.acknowledged = FALSE
ORDER BY ha.severity DESC, ha.timestamp DESC;

-- Vista para resumen de dispositivos por paciente
CREATE OR REPLACE VIEW patient_wearable_summary AS
SELECT 
    patient_id,
    COUNT(DISTINCT device_id) as total_devices,
    COUNT(DISTINCT device_type) as device_types,
    MAX(synced_at) as last_sync,
    COUNT(*) as total_data_points,
    COUNT(*) FILTER (WHERE recorded_at > NOW() - INTERVAL '24 hours') as data_points_24h,
    COUNT(*) FILTER (WHERE is_critical = TRUE) as critical_data_points
FROM wearable_data
GROUP BY patient_id;

-- =============================================================================
-- FUNCIONES PARA ANÁLISIS DE DATOS
-- =============================================================================

-- Función para obtener estadísticas de signos vitales
CREATE OR REPLACE FUNCTION get_vital_stats(
    p_patient_id UUID,
    p_data_type VARCHAR,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
    avg_value DECIMAL,
    min_value DECIMAL,
    max_value DECIMAL,
    count_readings BIGINT,
    latest_reading TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        AVG((value->>'value')::DECIMAL) as avg_value,
        MIN((value->>'value')::DECIMAL) as min_value,
        MAX((value->>'value')::DECIMAL) as max_value,
        COUNT(*) as count_readings,
        MAX(recorded_at) as latest_reading
    FROM wearable_data
    WHERE patient_id = p_patient_id
        AND data_type = p_data_type
        AND recorded_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Función para detectar anomalías simples
CREATE OR REPLACE FUNCTION detect_anomalies(
    p_patient_id UUID,
    p_data_type VARCHAR,
    p_threshold_multiplier DECIMAL DEFAULT 2.0
)
RETURNS TABLE(
    data_id UUID,
    value DECIMAL,
    recorded_at TIMESTAMPTZ,
    is_anomaly BOOLEAN
) AS $$
DECLARE
    v_avg DECIMAL;
    v_stddev DECIMAL;
BEGIN
    -- Calcular media y desviación estándar
    SELECT AVG((value->>'value')::DECIMAL), STDDEV((value->>'value')::DECIMAL)
    INTO v_avg, v_stddev
    FROM wearable_data
    WHERE patient_id = p_patient_id
        AND data_type = p_data_type
        AND recorded_at > NOW() - INTERVAL '30 days';
    
    -- Retornar datos con indicador de anomalía
    RETURN QUERY
    SELECT 
        id,
        (value->>'value')::DECIMAL as value,
        recorded_at,
        ABS((value->>'value')::DECIMAL - v_avg) > (p_threshold_multiplier * v_stddev) as is_anomaly
    FROM wearable_data
    WHERE patient_id = p_patient_id
        AND data_type = p_data_type
        AND recorded_at > NOW() - INTERVAL '7 days'
    ORDER BY recorded_at DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS PARA AUDITORÍA Y NOTIFICACIONES
-- =============================================================================

-- Función trigger para notificaciones automáticas
CREATE OR REPLACE FUNCTION notify_critical_alert()
RETURNS TRIGGER AS $$
BEGIN
    -- Si es una alerta crítica, activar notificación inmediata
    IF NEW.severity = 'critical' THEN
        -- En producción: integrar con sistema de notificaciones
        RAISE NOTICE 'CRITICAL ALERT: Patient %, Type: %, Description: %', 
            NEW.patient_id, NEW.alert_type, NEW.description;
        
        -- Marcar para notificación
        NEW.notification_sent = TRUE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para alertas críticas
CREATE TRIGGER trigger_critical_alert_notification
    BEFORE INSERT ON health_alerts
    FOR EACH ROW
    EXECUTE FUNCTION notify_critical_alert();

-- =============================================================================
-- POLÍTICAS DE RETENCIÓN DE DATOS
-- =============================================================================

-- Función para limpieza de datos antiguos (ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_old_wearable_data(
    p_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Eliminar datos antiguos no críticos
    DELETE FROM wearable_data
    WHERE recorded_at < NOW() - (p_retention_days || ' days')::INTERVAL
        AND is_critical = FALSE;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Deleted % old wearable data records', v_deleted_count;
    
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PERMISOS Y SEGURIDAD
-- =============================================================================

-- Revocar permisos públicos
REVOKE ALL ON wearable_data FROM PUBLIC;
REVOKE ALL ON health_alerts FROM PUBLIC;
REVOKE ALL ON wearable_auth_tokens FROM PUBLIC;

-- Otorgar permisos específicos al usuario de la aplicación
-- (Reemplazar 'rmhealth_user' con el usuario real de la aplicación)
GRANT SELECT, INSERT, UPDATE ON wearable_data TO rmhealth_user;
GRANT SELECT, INSERT, UPDATE ON health_alerts TO rmhealth_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON wearable_auth_tokens TO rmhealth_user;

-- Permisos de secuencia para UUIDs (si se usan secuencias)
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rmhealth_user;

-- Permisos para vistas
GRANT SELECT ON latest_wearable_data TO rmhealth_user;
GRANT SELECT ON active_health_alerts TO rmhealth_user;
GRANT SELECT ON patient_wearable_summary TO rmhealth_user;

-- Permisos para funciones
GRANT EXECUTE ON FUNCTION get_vital_stats(UUID, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ) TO rmhealth_user;
GRANT EXECUTE ON FUNCTION detect_anomalies(UUID, VARCHAR, DECIMAL) TO rmhealth_user;
GRANT EXECUTE ON FUNCTION cleanup_old_wearable_data(INTEGER) TO rmhealth_user;

-- =============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- =============================================================================

COMMENT ON TABLE wearable_data IS 'Almacena datos de signos vitales y actividad de dispositivos wearables';
COMMENT ON TABLE health_alerts IS 'Alertas médicas generadas automáticamente por análisis de datos wearables';
COMMENT ON TABLE wearable_auth_tokens IS 'Tokens de autenticación para dispositivos wearables registrados';

COMMENT ON COLUMN wearable_data.value IS 'Valor del dato en formato JSONB para flexibilidad de tipos';
COMMENT ON COLUMN wearable_data.is_critical IS 'Marca datos críticos que requieren procesamiento prioritario';
COMMENT ON COLUMN health_alerts.triggered_by IS 'Información del dato que disparó la alerta en formato JSONB';

-- =============================================================================
-- DATOS DE PRUEBA (OPCIONAL - SOLO PARA DESARROLLO)
-- =============================================================================

-- Insertar datos de prueba solo si no existen pacientes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM patients LIMIT 1) THEN
        RAISE NOTICE 'No patients found. Please run medical database setup first.';
    ELSE
        RAISE NOTICE 'Wearable database extension created successfully';
        RAISE NOTICE 'Ready to receive smartwatch data!';
    END IF;
END$$;

-- =============================================================================
-- VERIFICACIÓN FINAL
-- =============================================================================

-- Verificar que todas las tablas fueron creadas
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
        AND table_name IN ('wearable_data', 'health_alerts', 'wearable_auth_tokens');
    
    IF table_count = 3 THEN
        RAISE NOTICE '✅ All wearable tables created successfully';
    ELSE
        RAISE WARNING '❌ Some wearable tables missing. Expected 3, found %', table_count;
    END IF;
END$$;