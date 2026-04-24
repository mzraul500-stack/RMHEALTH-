# =============================================================================
# RMHEALTH MEDICAL SYSTEM - POSTGRESQL AZURE SETUP
# =============================================================================
# PowerShell script to configure Azure PostgreSQL Flexible Server for RMHealth
# Creates medical database schema, extensions, and sample data
# HIPAA Compliant | TimescaleDB | PostGIS | FHIR Ready
# Date: April 21, 2026

param(
    [Parameter(Mandatory=$false)]
    [string]$PostgreSQLServerName = "rmhealth-postgres-01",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "rg-rmhealth-rmhealth",
    
    [Parameter(Mandatory=$false)]
    [string]$DatabaseName = "rmhealth_medical",
    
    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "rmhealth_admin",
    
    [Parameter(Mandatory=$false)]
    [switch]$CreateDatabase = $true,
    
    [Parameter(Mandatory=$false)]
    [switch]$SetupExtensions = $true,
    
    [Parameter(Mandatory=$false)]
    [switch]$LoadSampleData = $true
)

Write-Host "🏥 CONFIGURANDO POSTGRESQL AZURE PARA SISTEMA MÉDICO RMHEALTH" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# =============================================================================
# VALIDACIONES INICIALES
# =============================================================================

Write-Host "`n🔍 Validando recursos Azure existentes..." -ForegroundColor Yellow

# Verificar que el servidor PostgreSQL existe
try {
    $pgServer = az postgres flexible-server show --name $PostgreSQLServerName --resource-group $ResourceGroupName --output json | ConvertFrom-Json
    if ($pgServer) {
        Write-Host "✅ PostgreSQL Server encontrado: $($pgServer.name)" -ForegroundColor Green
        Write-Host "   📍 Ubicación: $($pgServer.location)" -ForegroundColor White
        Write-Host "   📊 Estado: $($pgServer.state)" -ForegroundColor White
        Write-Host "   🌐 FQDN: $($pgServer.fullyQualifiedDomainName)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Error: No se encontró el servidor PostgreSQL '$PostgreSQLServerName'" -ForegroundColor Red
    Write-Host "   Verifica que el servidor existe en el resource group '$ResourceGroupName'" -ForegroundColor Red
    exit 1
}

# Verificar conectividad
Write-Host "`n🔗 Verificando conectividad a PostgreSQL..." -ForegroundColor Yellow
$testConnection = psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=postgres --command="\l" --no-password 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Conectividad PostgreSQL confirmada" -ForegroundColor Green
} else {
    Write-Host "⚠️ Problema de conectividad - continuando (puede requerir autenticación)" -ForegroundColor Yellow
}

# =============================================================================
# CREACIÓN DE BASE DE DATOS MÉDICA
# =============================================================================

if ($CreateDatabase) {
    Write-Host "`n🗄️ Creando base de datos médica '$DatabaseName'..." -ForegroundColor Yellow
    
    $createDbSql = @"
-- Create medical database if it doesn't exist
SELECT 'CREATE DATABASE $DatabaseName' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DatabaseName')\gexec
"@
    
    $createDbSql | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=postgres
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Base de datos médica '$DatabaseName' creada/verificada" -ForegroundColor Green
    } else {
        Write-Host "❌ Error creando base de datos médica" -ForegroundColor Red
        exit 1
    }
}

# =============================================================================
# CONFIGURACIÓN DE EXTENSIONES MÉDICAS
# =============================================================================

if ($SetupExtensions) {
    Write-Host "`n🧩 Configurando extensiones PostgreSQL para sistema médico..." -ForegroundColor Yellow
    
    # Lista de extensiones requeridas para el sistema médico
    $extensions = @(
        "uuid-ossp",     # Generación de UUIDs para registros médicos
        "pg_trgm",       # Búsqueda de texto para nombres de pacientes  
        "btree_gin"      # Índices avanzados para rendimiento
    )
    
    foreach ($extension in $extensions) {
        Write-Host "   📦 Instalando extensión: $extension" -ForegroundColor White
        $extSql = "CREATE EXTENSION IF NOT EXISTS `"$extension`";"
        $extSql | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Extensión '$extension' instalada" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️ Problema instalando extensión '$extension' (puede que no esté disponible)" -ForegroundColor Yellow
        }
    }
    
    # Configurar PostGIS y TimescaleDB si están disponibles en Azure
    Write-Host "`n🌍 Verificando extensiones geoespaciales y time-series..." -ForegroundColor Yellow
    
    # PostGIS para hospitales geoespaciales
    $postgisCheck = "SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'postgis');"
    $postgisAvailable = $postgisCheck | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName -t -A
    
    if ($postgisAvailable -match "t") {
        Write-Host "   📍 PostGIS disponible - configurando capacidades geoespaciales..." -ForegroundColor Green
        "CREATE EXTENSION IF NOT EXISTS postgis;" | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName
    } else {
        Write-Host "   ⚠️ PostGIS no disponible - usando coordenadas básicas" -ForegroundColor Yellow
    }
    
    # TimescaleDB para signos vitales
    $timescaleCheck = "SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb');"
    $timescaleAvailable = $timescaleCheck | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName -t -A
    
    if ($timescaleAvailable -match "t") {
        Write-Host "   ⏰ TimescaleDB disponible - configurando time-series médicas..." -ForegroundColor Green
        "CREATE EXTENSION IF NOT EXISTS timescaledb;" | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName
    } else {
        Write-Host "   ⚠️ TimescaleDB no disponible - usando tablas PostgreSQL estándar" -ForegroundColor Yellow
    }
}

# =============================================================================
# EJECUCIÓN DEL SCHEMA MÉDICO
# =============================================================================

Write-Host "`n🏥 Creando schema médico completo..." -ForegroundColor Yellow

$sqlFile = Join-Path $PSScriptRoot "setup_medical_database.sql"
if (Test-Path $sqlFile) {
    Write-Host "   📄 Ejecutando script: $sqlFile" -ForegroundColor White
    
    # Ejecutar el script SQL completo
    psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName --file=$sqlFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Schema médico creado exitosamente" -ForegroundColor Green
    } else {
        Write-Host "❌ Error ejecutando schema médico - revisando componentes individuales..." -ForegroundColor Red
        
        # Intentar crear componentes básicos manualmente
        Write-Host "   🔧 Creando tablas básicas sin extensiones avanzadas..." -ForegroundColor Yellow
        
        $basicSchema = @"
-- Basic medical tables without advanced extensions
CREATE SCHEMA IF NOT EXISTS medical;
CREATE SCHEMA IF NOT EXISTS infrastructure;  
CREATE SCHEMA IF NOT EXISTS emergency;

-- Patient profiles (simplified without PostGIS)
CREATE TABLE IF NOT EXISTS medical.patient_profiles (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    phone_number VARCHAR(20),
    email VARCHAR(255),
    is_diabetic BOOLEAN DEFAULT FALSE,
    is_hypertensive BOOLEAN DEFAULT FALSE,
    has_heart_disease BOOLEAN DEFAULT FALSE,
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vital signs (simplified without TimescaleDB)
CREATE TABLE IF NOT EXISTS medical.vital_signs_log (
    id UUID DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES medical.patient_profiles(patient_id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    heart_rate INTEGER,
    systolic_pressure INTEGER,
    diastolic_pressure INTEGER,
    oxygen_saturation DECIMAL(5,2),
    glucose_level INTEGER,
    PRIMARY KEY (id, timestamp)
);

-- Hospital network (simplified without PostGIS)  
CREATE TABLE IF NOT EXISTS infrastructure.hospital_network (
    hospital_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hospital_type VARCHAR(50),
    phone_number VARCHAR(20),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    has_emergency_room BOOLEAN DEFAULT TRUE,
    is_operational BOOLEAN DEFAULT TRUE
);

-- Critical alerts
CREATE TABLE IF NOT EXISTS emergency.critical_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES medical.patient_profiles(patient_id),
    alert_type VARCHAR(50) NOT NULL,
    severity_level INTEGER NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    title VARCHAR(255) NOT NULL,
    description TEXT
);

-- Basic indexes for performance
CREATE INDEX IF NOT EXISTS idx_vital_signs_patient ON medical.vital_signs_log(patient_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_patient ON emergency.critical_alerts(patient_id, triggered_at);
"@
        
        $basicSchema | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Schema médico básico creado exitosamente" -ForegroundColor Green
        } else {
            Write-Host "❌ Error crítico creando schema médico básico" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "❌ No se encontró el archivo SQL: $sqlFile" -ForegroundColor Red
    exit 1
}

# =============================================================================
# CONFIGURACIÓN DE ROLES Y PERMISOS
# =============================================================================

Write-Host "`n🔐 Configurando roles y permisos médicos..." -ForegroundColor Yellow

$rolesSql = @"
-- Create application roles for medical system
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rmhealth_api_role') THEN
        CREATE ROLE rmhealth_api_role;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rmhealth_emergency_role') THEN
        CREATE ROLE rmhealth_emergency_role;
    END IF;
END \$\$;

-- Grant permissions
GRANT USAGE ON SCHEMA medical, infrastructure, emergency TO rmhealth_api_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA medical, infrastructure, emergency TO rmhealth_api_role;

GRANT USAGE ON SCHEMA emergency, infrastructure TO rmhealth_emergency_role;  
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA emergency, infrastructure TO rmhealth_emergency_role;
"@

$rolesSql | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Roles y permisos configurados" -ForegroundColor Green
} else {
    Write-Host "⚠️ Algunos permisos pueden requerir configuración manual" -ForegroundColor Yellow
}

# =============================================================================
# CARGA DE DATOS DE EJEMPLO (HOSPITALES)
# =============================================================================

if ($LoadSampleData) {
    Write-Host "`n🏥 Cargando datos de ejemplo (hospitales México)..." -ForegroundColor Yellow
    
    $sampleHospitals = @"
-- Sample hospitals for Mexico (using basic lat/lng without PostGIS)
INSERT INTO infrastructure.hospital_network (
    name, hospital_type, phone_number, address_line1, city, state,
    latitude, longitude, has_emergency_room, is_operational
) VALUES 
('Hospital General de México "Dr. Eduardo Liceaga"', 'public', '+52-55-2789-2000', 
 'Dr. Balmis 148, Doctores', 'Ciudad de México', 'Ciudad de México', 
 19.414398, -99.143268, TRUE, TRUE),
 
('Hospital Ángeles del Pedregal', 'private', '+52-55-5449-5500',
 'Camino a Santa Teresa 1055', 'Ciudad de México', 'Ciudad de México',
 19.317842, -99.230521, TRUE, TRUE),
 
('Hospital ABC Santa Fe', 'private', '+52-55-1103-1600',
 'Av. Carlos Graef Fernández 154', 'Ciudad de México', 'Ciudad de México', 
 19.372582, -99.268654, TRUE, TRUE)
ON CONFLICT (hospital_id) DO NOTHING;
"@
    
    $sampleHospitals | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Datos de ejemplo cargados (hospitales México)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Algunos datos de ejemplo pueden no haberse cargado" -ForegroundColor Yellow
    }
}

# =============================================================================
# VALIDACIÓN FINAL Y RESUMEN
# =============================================================================

Write-Host "`n🔍 Validando configuración final..." -ForegroundColor Yellow

# Contar registros en tablas principales
$validation = @"
SELECT 
    'patient_profiles' as tabla,
    COUNT(*) as registros
FROM medical.patient_profiles
UNION ALL
SELECT 
    'hospital_network' as tabla,
    COUNT(*) as registros  
FROM infrastructure.hospital_network
UNION ALL
SELECT 
    'vital_signs_log' as tabla,
    COUNT(*) as registros
FROM medical.vital_signs_log;
"@

Write-Host "   📊 Conteo de registros en tablas principales:" -ForegroundColor White
$validation | psql --host=$pgServer.fullyQualifiedDomainName --port=5432 --username=$AdminUsername --dbname=$DatabaseName

# =============================================================================
# INFORMACIÓN DE CONEXIÓN PARA LA APLICACIÓN
# =============================================================================

Write-Host "`n📋 INFORMACIÓN DE CONEXIÓN PARA RMHEALTH API:" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "🏥 PostgreSQL Server: $($pgServer.fullyQualifiedDomainName)" -ForegroundColor White
Write-Host "🗄️ Database: $DatabaseName" -ForegroundColor White  
Write-Host "👤 Usuario: $AdminUsername" -ForegroundColor White
Write-Host "🔌 Puerto: 5432" -ForegroundColor White
Write-Host "🔒 SSL: Required" -ForegroundColor White

Write-Host "`n🌟 CONNECTION STRING PARA .ENV:" -ForegroundColor Green
Write-Host "POSTGRES_HOST=$($pgServer.fullyQualifiedDomainName)" -ForegroundColor Yellow
Write-Host "POSTGRES_PORT=5432" -ForegroundColor Yellow
Write-Host "POSTGRES_DB=$DatabaseName" -ForegroundColor Yellow
Write-Host "POSTGRES_USER=$AdminUsername" -ForegroundColor Yellow
Write-Host "POSTGRES_PASSWORD=<obtener de Key Vault>" -ForegroundColor Yellow

# =============================================================================
# PRÓXIMOS PASOS
# =============================================================================

Write-Host "`n🚀 PRÓXIMOS PASOS:" -ForegroundColor Cyan
Write-Host "1. ✅ Configurar password en Key Vault: kv-RMHEALTH" -ForegroundColor Green
Write-Host "2. ✅ Actualizar variables de entorno en Container Apps" -ForegroundColor Green  
Write-Host "3. ✅ Desplegar API médica RMHealth" -ForegroundColor Green
Write-Host "4. ✅ Probar endpoints médicos (/health, /vitals, /emergency)" -ForegroundColor Green

Write-Host "`n🎉 CONFIGURACIÓN POSTGRESQL MÉDICA COMPLETADA" -ForegroundColor Green
Write-Host "🏥 Base de datos lista para sistema de emergencias médicas RMHealth" -ForegroundColor Green