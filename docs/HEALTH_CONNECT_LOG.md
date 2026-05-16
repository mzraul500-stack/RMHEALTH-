# Registro de Integración con Health Connect

## Estado Actual: Pospuesto para v3.0

**Fecha**: 11 de Mayo de 2026
**Versión Actual**: v2.5.4-stable

### Resumen de la Situación
Durante el desarrollo de la versión experimental (rama `feature/health-connect-controlled`), se intentó integrar de forma completa el ecosistema de Health Connect para sincronizar datos del Galaxy Watch 8 (frecuencia cardíaca, SpO2, presión arterial, temperatura, etc.) con RMHealth.

Se identificaron los siguientes bloqueos técnicos y de sistema operativo en Android 14:
1. **Problemas con Keystores y Perfiles de Firma**: Health Connect requiere que la aplicación esté firmada con un keystore reconocido y avalado por Google Play Services. Los APKs firmados con perfiles de desarrollo o `preview` no son reconocidos como aplicaciones válidas para solicitar y acceder a permisos de salud en dispositivos físicos.
2. **Visibilidad en Lista de Permisos**: A pesar de que los permisos (`READ_HEART_RATE`, `READ_OXYGEN_SATURATION`, etc.) y el `intent-filter` correspondiente a `HealthConnectRationaleActivity` se encontraban correctamente configurados en el `AndroidManifest.xml`, la app no aparecía en la lista del sistema debido a restricciones inherentes de seguridad y firma de paquetes.
3. **Flujo de Ejecución Requerido**: Se validó que el llamado a `requestPermission` debía ejecutarse y presentar un diálogo nativo válido para que Android asimilara la aplicación. 

### Decisión de Arquitectura
Para garantizar la estabilidad y usabilidad inmediata de la plataforma, y no retrasar los despliegues de la versión estable en producción:
- Se ha **revertido completamente** el estado del proyecto a la rama `master` (versión v2.5.4-stable).
- La bandera de configuración `HEALTH_CONNECT_ENABLED` en `src/config/features.js` se mantiene en `false`.
- La integración de Health Connect se **pospone para la versión v3.0**, donde se planeará una arquitectura de permisos que incluya configuraciones de distribución e `internal testing` de Google Play Store para permitir que el servicio de Health Connect interactúe adecuadamente con las firmas de producción.

### Pasos Futuros para v3.0
- Configurar pistas de pruebas internas (Internal Testing) en Google Play Console.
- Generar builds con el perfil `production` firmados con la clave oficial de la Play Store para realizar las pruebas en dispositivos físicos.
- Reactivar el código en la nueva rama y reevaluar la respuesta del sensor del Galaxy Watch 8.
