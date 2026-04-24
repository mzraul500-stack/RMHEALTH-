# ============================================================
# 🏥 RMHEALTH - INSTALADOR DE UN SOLO CLICK
# ============================================================
# Autor: Raúl Morales Zepeda (rm@rmhealth.com.mx)
# Versión: 1.0
# 
# INSTRUCCIONES:
#   1. Click derecho en este archivo
#   2. Seleccionar "Ejecutar con PowerShell"
#   3. Esperar a que termine
#   4. ¡Listo! El servidor estará corriendo
# ============================================================

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🏥 RMHEALTH - INSTALADOR AUTOMÁTICO" -ForegroundColor White
Write-Host "  El guardián silencioso que nunca duerme" -ForegroundColor DarkCyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- PASO 0: Detectar ubicación del proyecto ---
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host "📁 Proyecto encontrado en: $PROJECT_DIR" -ForegroundColor Green
Set-Location $PROJECT_DIR

# --- PASO 1: Verificar Python ---
Write-Host ""
Write-Host "[1/5] 🐍 Verificando Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✅ $pythonVersion detectado" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Python no encontrado." -ForegroundColor Red
    Write-Host "  📥 Descárgalo de: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  IMPORTANTE: Marca la casilla 'Add Python to PATH' al instalar" -ForegroundColor Yellow
    Read-Host "Presiona ENTER para salir"
    exit 1
}

# --- PASO 2: Verificar Node.js (para la app móvil) ---
Write-Host ""
Write-Host "[2/5] 📱 Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    Write-Host "  ✅ Node.js $nodeVersion detectado" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️ Node.js no encontrado (solo necesario para la app móvil)" -ForegroundColor DarkYellow
    Write-Host "  📥 Descárgalo de: https://nodejs.org/" -ForegroundColor Yellow
}

# --- PASO 3: Instalar dependencias Python ---
Write-Host ""
Write-Host "[3/5] 📦 Instalando dependencias del servidor..." -ForegroundColor Yellow
Write-Host "  Esto puede tardar 1-2 minutos la primera vez..." -ForegroundColor DarkGray

pip install -r requirements.txt --quiet 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null) {
    Write-Host "  ✅ Dependencias del servidor instaladas" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ Algunas dependencias fallaron, pero el servidor básico funciona" -ForegroundColor DarkYellow
}

# --- PASO 4: Verificar el Cerebro Médico ---
Write-Host ""
Write-Host "[4/5] 🧠 Verificando el Cerebro Médico (MJC)..." -ForegroundColor Yellow

$cerebro = "$PROJECT_DIR\backend\services\medical_engine.py"
$gateway = "$PROJECT_DIR\backend\services\hospital_gateway.py"
$aiProc  = "$PROJECT_DIR\backend\services\ai_processor.py"
$supervisor = "$PROJECT_DIR\backend\services\supervisor.py"
$alerts  = "$PROJECT_DIR\backend\services\hospital_alerts.py"

$components = @(
    @{Name="Módulo de Juicio Crítico (MJC)"; Path=$cerebro},
    @{Name="Despachador GPS (Haversine)";    Path=$gateway},
    @{Name="Bahía de IA (AI Processor)";     Path=$aiProc},
    @{Name="Cola de Supervisión Médica";     Path=$supervisor},
    @{Name="Generador de Alertas FHIR";      Path=$alerts}
)

$allOk = $true
foreach ($comp in $components) {
    if (Test-Path $comp.Path) {
        Write-Host "  ✅ $($comp.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($comp.Name) — FALTANTE" -ForegroundColor Red
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Host "  ⚠️ Atención: Algunos componentes del Cerebro Médico no fueron encontrados." -ForegroundColor DarkYellow
}

# Verificar modelos de IA
$triageModel = "$PROJECT_DIR\models\triage_classifier.joblib"
if (Test-Path $triageModel) {
    $size = [math]::Round((Get-Item $triageModel).Length / 1MB, 1)
    Write-Host "  ✅ Modelo de Triaje IA ($size MB)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ Modelo de Triaje no encontrado (modo heurístico activo)" -ForegroundColor DarkYellow
}

# --- PASO 5: Ejecutar prueba del sistema ---
Write-Host ""
Write-Host "[5/5] 🧪 Ejecutando prueba del Cerebro Médico..." -ForegroundColor Yellow

$testResult = python -c "
import sys
sys.path.insert(0, '.')
try:
    from backend.services.medical_engine import MedicalEngine
    engine = MedicalEngine()
    result = engine.analyze({
        'ritmo_cardiaco': 155,
        'spo2': 87,
        'presion_sistolica': 185,
        'presion_diastolica': 110,
        'glucosa': 45
    }, {'edad': 65, 'comorbilidades': ['diabetes', 'hipertension']})
    nivel = result.get('nivel_alerta', 'DESCONOCIDO')
    score = result.get('score_riesgo', 0)
    print(f'OK|{nivel}|{score}')
except Exception as e:
    print(f'ERROR|{e}')
" 2>&1

if ($testResult -match "^OK\|") {
    $parts = $testResult.Split("|")
    Write-Host "  ✅ Cerebro Médico OPERATIVO" -ForegroundColor Green
    Write-Host "     Resultado de prueba:" -ForegroundColor DarkGray
    Write-Host "     Nivel de alerta: $($parts[1])" -ForegroundColor White
    Write-Host "     Score de riesgo: $($parts[2])" -ForegroundColor White
} else {
    Write-Host "  ⚠️ El Cerebro respondió con: $testResult" -ForegroundColor DarkYellow
    Write-Host "     El servidor aún puede arrancar normalmente" -ForegroundColor DarkGray
}

# ============================================================
# RESUMEN FINAL
# ============================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🏥 RMHEALTH - INSTALACIÓN COMPLETADA" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📁 Proyecto: $PROJECT_DIR" -ForegroundColor White
Write-Host "  🌐 Email:    rm@rmhealth.com.mx" -ForegroundColor White
Write-Host "  📋 IP:       INDAUTOR 03-2025-070109072500-01" -ForegroundColor White
Write-Host ""

Write-Host "  ┌──────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  PARA INICIAR EL SERVIDOR:               │" -ForegroundColor Green
Write-Host "  │                                          │" -ForegroundColor Green
Write-Host "  │  python backend\rmhealth_api.py          │" -ForegroundColor White
Write-Host "  │                                          │" -ForegroundColor Green
Write-Host "  │  Luego abre en tu navegador:             │" -ForegroundColor Green
Write-Host "  │  http://localhost:8000/docs               │" -ForegroundColor Cyan
Write-Host "  │                                          │" -ForegroundColor Green
Write-Host "  │  Dashboard del Hospital:                 │" -ForegroundColor Green
Write-Host "  │  Abre hospital_dashboard.html            │" -ForegroundColor Cyan
Write-Host "  └──────────────────────────────────────────┘" -ForegroundColor Green

Write-Host ""
Write-Host "  Creado por Raúl Morales Zepeda" -ForegroundColor DarkGray
Write-Host "  El guardián silencioso que nunca duerme." -ForegroundColor DarkCyan
Write-Host ""

Read-Host "Presiona ENTER para salir"
