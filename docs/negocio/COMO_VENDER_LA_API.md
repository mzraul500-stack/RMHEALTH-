# 💰 CÓMO VENDER LA API RMHEALTH COMO SERVICIO

**Autor:** Raúl Morales Zepeda  
**Fecha:** 22 de Abril 2026  
**INDAUTOR:** 03-2025-070109072500-01

---

## LO QUE YA TIENES (Hoy)

| Componente | Estado |
|---|---|
| API en producción (Cloud Run v3.0.0) | ✅ Funciona |
| Motor de IA (Triage 91.8% accuracy) | ✅ Funciona |
| Interoperabilidad FHIR R4 / HL7 | ✅ Funciona |
| Enrutamiento GPS de hospitales | ✅ Funciona |
| Base de datos PostgreSQL | ✅ Funciona |
| Documentación Swagger (/docs) | ✅ Automática |
| App Móvil (Expo/React Native) | ✅ Funciona |
| Dashboard Hospital (Hostinger) | ✅ Funciona |

---

## LO QUE TE FALTA PARA VENDER

### 🔑 1. Sistema de API Keys por Cliente (CRÍTICO)
**Hoy:** Un solo token compartido (`rmhealth_2025_secure`)  
**Necesitas:** Cada hospital/cliente recibe su propio API Key único  

**Solución más rápida:** Crear una tabla `api_keys` en PostgreSQL:
```sql
CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    client_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'basic',  -- basic, pro, enterprise
    requests_limit INT DEFAULT 1000,
    requests_used INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Tiempo estimado: **2-3 horas de desarrollo**

---

### 📊 2. Medidor de Uso (Para cobrar)
Necesitas saber cuántas llamadas hace cada cliente para cobrarles.

**Solución:** Agregar un middleware en FastAPI que registre cada request:
- Quién llamó (API Key)
- Qué endpoint usó
- Cuándo
- Tiempo de respuesta

Tiempo estimado: **1-2 horas**

---

### 💳 3. Forma de Cobrar

#### Opción A: Stripe (Recomendada para empezar)
- Creas planes: Básico ($99/mes), Pro ($299/mes), Enterprise ($999/mes)
- Stripe cobra automáticamente cada mes
- URL: https://stripe.com
- **Costo:** 3.6% + $3 MXN por transacción
- **Tiempo:** 1 día para configurar

#### Opción B: Facturación manual
- Para los primeros 1-5 clientes hospitalarios
- Envías factura mensual por transferencia bancaria
- **Costo:** $0
- **Tiempo:** 0

---

### 📄 4. Portal de Documentación para Clientes

Tu API ya genera documentación automática en `/docs` (Swagger). Pero para vender necesitas algo más profesional.

**Opciones:**
1. **Tu propio portal en rmhealth.ai** — Agregar una página `/api-docs` con ejemplos de código, precios, y formulario de contacto
2. **ReadMe.io** — Portal de API docs profesional (gratis hasta 1 proyecto)
3. **La documentación Swagger que ya tienes** — Suficiente para empezar con clientes técnicos

---

## 🛒 DÓNDE VENDERLA

### Opción 1: Venta Directa B2B (⭐ RECOMENDADA PARA TI)
- **Contactas hospitales directamente** (ya tienes los mensajes de LinkedIn listos)
- Les das un API Key personalizado
- Les cobras mensualidad por transferencia o Stripe
- **Ventaja:** Máximo margen, relación directa con el cliente
- **Para quién:** Hospitales, clínicas, aseguradoras en México

### Opción 2: Google Cloud Marketplace
- **URL:** https://cloud.google.com/marketplace
- Publicas tu API como producto en el marketplace de Google
- Los clientes pagan a través de su factura de Google Cloud
- **Ventaja:** Acceso a miles de empresas que ya usan Google Cloud
- **Requisito:** Ser Google Cloud Partner (aplicar en https://cloud.google.com/partners)
- **Tiempo:** 2-4 semanas para la aprobación

### Opción 3: RapidAPI (Marketplace de APIs)
- **URL:** https://rapidapi.com
- Listas tu API gratis, ellos manejan los pagos
- Miles de desarrolladores buscan APIs médicas
- **Ventaja:** Visibilidad inmediata, $0 para empezar
- **Comisión:** RapidAPI se queda 20% de cada venta
- **Tiempo:** 1 día para publicar

### Opción 4: AWS Marketplace / Azure Marketplace
- Similar a Google pero en otras nubes
- Más complejo, dejarlo para después

---

## 📋 PLANES DE PRECIOS SUGERIDOS

| Plan | Precio/Mes | Incluye | Para quién |
|---|---|---|---|
| **Básico** | $2,000 MXN (~$99 USD) | 1,000 análisis/mes, 1 API Key | Consultorios, clínicas pequeñas |
| **Profesional** | $6,000 MXN (~$299 USD) | 10,000 análisis/mes, 5 API Keys, FHIR R4 | Hospitales medianos |
| **Enterprise** | $20,000 MXN (~$999 USD) | Ilimitado, SLA 99.9%, soporte prioritario | Hospitales grandes, aseguradoras |

---

## 🎯 PLAN DE ACCIÓN INMEDIATO (Próximos 3 días)

### Día 1: Publicar en RapidAPI (GRATIS, visibilidad inmediata)
1. Crear cuenta en https://rapidapi.com/provider
2. Registrar la API con tu URL de Cloud Run
3. Configurar los 3 planes de precios
4. Publicar

### Día 2: Implementar API Keys por cliente
1. Crear tabla `api_keys` en PostgreSQL
2. Modificar `verify_token()` para validar contra la tabla
3. Agregar endpoint `POST /admin/api-keys` para crear keys
4. Redesplegar

### Día 3: Primer cliente
1. Enviar mensaje LinkedIn a TecSalud (ya lo tienes listo)
2. Enviar mensaje a Hospital Civil de Guadalajara
3. Ofrecer prueba gratuita de 30 días

---

## 💡 CONSEJO CLAVE

> **No esperes a tener todo perfecto para vender.**
> Con lo que tienes HOY ya puedes hacer demos a hospitales.
> Tu API tiene documentación automática en `/docs`, triage con IA real, y FHIR R4.
> El 90% de las startups médicas no tienen ni la mitad de esto.

---

*Documento creado por Raúl Morales Zepeda*  
*rm@rmhealth.com.mx | rmhealth.ai*  
*INDAUTOR: 03-2025-070109072500-01*
