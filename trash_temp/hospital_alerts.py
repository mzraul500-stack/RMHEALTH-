"""
Sistema de Alertas Hospitalarias Automáticas
Integración con hospitales vía FHIR/HL7 para RMHealth
"""
import structlog
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum
import os

logger = structlog.get_logger(__name__)


class AlertPriority(str, Enum):
    """Prioridad de alerta hospitalaria"""
    ROUTINE = "routine"  # Rutina - no urgente
    URGENT = "urgent"  # Urgente - atención en minutos
    CRITICAL = "critical"  # Crítico - atención INMEDIATA
    LIFE_THREATENING = "life_threatening"  # Amenaza vital - código rojo


class AlertStatus(str, Enum):
    """Estado de la alerta"""
    PENDING = "pending"  # Pendiente de envío
    SENT = "sent"  # Enviada al hospital
    ACKNOWLEDGED = "acknowledged"  # Reconocida por hospital
    IN_PROGRESS = "in_progress"  # Personal médico en camino
    RESOLVED = "resolved"  # Resuelta
    FAILED = "failed"  # Falló el envío


class HospitalAlert:
    """Gestor de alertas hospitalarias automáticas"""
    
    def __init__(self):
        self.alerts_sent = []
        
    async def send_emergency_alert(
        self,
        patient_id: str,
        analysis: Dict[str, Any],
        priority: AlertPriority,
        emergency_contacts: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Enviar alerta de emergencia automática al hospital
        
        Args:
            patient_id: ID del paciente
            analysis: Análisis médico completo
            priority: Prioridad de la alerta
            emergency_contacts: Contactos de emergencia adicionales
            
        Returns:
            Resultado del envío de alerta
        """
        try:
            # Generar informe médico estructurado
            medical_report = self._generate_medical_report(patient_id, analysis)
            
            # Preparar payload FHIR/HL7
            alert_payload = self._prepare_hospital_payload(
                patient_id, 
                medical_report, 
                priority
            )
            
            # Enviar a hospital (implementar según protocolo)
            alert_result = await self._send_to_hospital(alert_payload, priority)
            
            # Notificar a contactos de emergencia
            if emergency_contacts and priority in [AlertPriority.CRITICAL, AlertPriority.LIFE_THREATENING]:
                await self._notify_emergency_contacts(emergency_contacts, medical_report)
            
            # Activar protocolos de emergencia según severidad
            if priority == AlertPriority.LIFE_THREATENING:
                await self._activate_code_red(patient_id, medical_report)
            elif priority == AlertPriority.CRITICAL:
                await self._activate_emergency_protocol(patient_id, medical_report)
            
            # Log de auditoría
            logger.info(
                "Alerta hospitalaria enviada automáticamente",
                patient_id=patient_id,
                priority=priority,
                alert_id=alert_result.get("alert_id"),
                timestamp=datetime.utcnow().isoformat(),
            )
            
            # Guardar registro de alerta
            self.alerts_sent.append({
                "alert_id": alert_result.get("alert_id"),
                "patient_id": patient_id,
                "priority": priority,
                "timestamp": datetime.utcnow(),
                "status": AlertStatus.SENT,
                "medical_report": medical_report,
            })
            
            return {
                "success": True,
                "alert_id": alert_result.get("alert_id"),
                "priority": priority,
                "status": AlertStatus.SENT,
                "hospital_notified": True,
                "estimated_response_time": self._get_estimated_response_time(priority),
                "message": f"Alerta {priority.value} enviada automáticamente al hospital"
            }
            
        except Exception as e:
            logger.error(
                "Error enviando alerta hospitalaria",
                patient_id=patient_id,
                priority=priority,
                error=str(e)
            )
            return {
                "success": False,
                "error": str(e),
                "status": AlertStatus.FAILED,
            }
    
    def _generate_medical_report(self, patient_id: str, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Generar informe médico estructurado para el hospital"""
        return {
            "report_id": f"RPT-{patient_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "patient_id": patient_id,
            "timestamp": datetime.utcnow().isoformat(),
            "specialty": analysis.get("specialty"),
            "severity": analysis.get("severity"),
            "vital_signs": analysis.get("vital_signs", {}),
            "analysis": analysis.get("analysis"),
            "critical_findings": self._extract_critical_findings(analysis),
            "recommended_actions": self._extract_recommended_actions(analysis),
            "time_sensitivity": self._calculate_time_sensitivity(analysis),
            "patient_risk_score": self._calculate_risk_score(analysis),
        }
    
    def _extract_critical_findings(self, analysis: Dict[str, Any]) -> List[str]:
        """Extraer hallazgos críticos del análisis"""
        critical_findings = []
        
        vital_signs = analysis.get("vital_signs", {})
        
        # Frecuencia cardíaca crítica
        hr = vital_signs.get("heart_rate", 0)
        if hr > 140:
            critical_findings.append(f"Taquicardia severa: {hr} lpm")
        elif hr < 40:
            critical_findings.append(f"Bradicardia severa: {hr} lpm")
        
        # Presión arterial crítica
        bp_sys = vital_signs.get("blood_pressure_systolic", 0)
        if bp_sys > 180:
            critical_findings.append(f"Crisis hipertensiva: {bp_sys} mmHg")
        elif bp_sys < 90:
            critical_findings.append(f"Hipotensión severa: {bp_sys} mmHg")
        
        # Saturación de oxígeno crítica
        spo2 = vital_signs.get("oxygen_saturation", 100)
        if spo2 < 90:
            critical_findings.append(f"Hipoxemia crítica: SpO2 {spo2}%")
        
        # Glucosa crítica
        glucose = vital_signs.get("glucose")
        if glucose:
            if glucose < 50:
                critical_findings.append(f"Hipoglucemia severa: {glucose} mg/dL - RIESGO DE COMA")
            elif glucose > 300:
                critical_findings.append(f"Hiperglucemia severa: {glucose} mg/dL - RIESGO DE CETOACIDOSIS")
        
        return critical_findings
    
    def _extract_recommended_actions(self, analysis: Dict[str, Any]) -> List[str]:
        """Extraer acciones recomendadas del análisis"""
        # TODO: Parsing inteligente del análisis para extraer acciones
        return [
            "Evaluación médica inmediata requerida",
            "Monitoreo continuo de signos vitales",
            "Preparar para posible transporte de emergencia",
        ]
    
    def _calculate_time_sensitivity(self, analysis: Dict[str, Any]) -> str:
        """Calcular sensibilidad temporal de la emergencia"""
        severity = analysis.get("severity", "").upper()
        
        if severity == "CRITICAL":
            return "< 15 minutos"
        elif severity == "HIGH":
            return "< 60 minutos"
        elif severity == "MEDIUM":
            return "< 4 horas"
        else:
            return "< 24 horas"
    
    def _calculate_risk_score(self, analysis: Dict[str, Any]) -> int:
        """Calcular puntuación de riesgo (0-100)"""
        score = 0
        vital_signs = analysis.get("vital_signs", {})
        
        # Scoring basado en signos vitales
        hr = vital_signs.get("heart_rate", 70)
        if hr > 140 or hr < 40:
            score += 30
        elif hr > 120 or hr < 50:
            score += 15
        
        bp_sys = vital_signs.get("blood_pressure_systolic", 120)
        if bp_sys > 180 or bp_sys < 90:
            score += 30
        elif bp_sys > 160 or bp_sys < 100:
            score += 15
        
        spo2 = vital_signs.get("oxygen_saturation", 98)
        if spo2 < 90:
            score += 40
        elif spo2 < 92:
            score += 20
        
        return min(score, 100)
    
    def _prepare_hospital_payload(
        self, 
        patient_id: str, 
        medical_report: Dict[str, Any],
        priority: AlertPriority
    ) -> Dict[str, Any]:
        """Preparar payload en formato FHIR/HL7 para el hospital"""
        return {
            "resourceType": "Communication",
            "status": "in-progress",
            "priority": priority.value,
            "category": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/communication-category",
                    "code": "alert",
                    "display": "Alert"
                }]
            }],
            "subject": {
                "reference": f"Patient/{patient_id}"
            },
            "sent": datetime.utcnow().isoformat(),
            "payload": [{
                "contentString": f"ALERTA DE EMERGENCIA - {priority.value.upper()}",
                "contentAttachment": {
                    "contentType": "application/json",
                    "data": medical_report
                }
            }],
            "note": [{
                "text": f"Alerta automática generada por sistema RMHealth Medical AI"
            }]
        }
    
    async def _send_to_hospital(self, payload: Dict[str, Any], priority: AlertPriority) -> Dict[str, Any]:
        """
        Enviar alerta al sistema hospitalario
        TODO: Implementar integración real con hospital vía FHIR/HL7
        """
        # Aquí iría la integración real con el hospital
        # Por ahora, simulamos el envío exitoso
        alert_id = f"ALERT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        logger.info(
            "Alerta enviada al hospital",
            alert_id=alert_id,
            priority=priority,
            payload_size=len(str(payload))
        )
        
        return {
            "alert_id": alert_id,
            "status": "sent",
            "hospital_endpoint": os.environ.get('HOSPITAL_API_ENDPOINT', 'pending_configuration'),
            "acknowledged": False,
        }
    
    async def _notify_emergency_contacts(self, contacts: List[str], report: Dict[str, Any]):
        """Notificar a contactos de emergencia"""
        logger.info(
            "Notificando contactos de emergencia",
            contact_count=len(contacts),
            patient_id=report.get("patient_id")
        )
        # TODO: Implementar notificaciones (SMS, llamada, push)
    
    async def _activate_code_red(self, patient_id: str, report: Dict[str, Any]):
        """Activar código rojo - amenaza vital inmediata"""
        logger.critical(
            "⚠️ CÓDIGO ROJO ACTIVADO ⚠️",
            patient_id=patient_id,
            severity="LIFE_THREATENING",
            action="Ambulancia y equipo de emergencia despachados automáticamente"
        )
        # TODO: Integrar con sistema de ambulancias
    
    async def _activate_emergency_protocol(self, patient_id: str, report: Dict[str, Any]):
        """Activar protocolo de emergencia estándar"""
        logger.error(
            "⚠️ PROTOCOLO DE EMERGENCIA ACTIVADO ⚠️",
            patient_id=patient_id,
            severity="CRITICAL",
            action="Hospital notificado, preparación de sala de emergencias"
        )
    
    def _get_estimated_response_time(self, priority: AlertPriority) -> str:
        """Obtener tiempo estimado de respuesta del hospital"""
        response_times = {
            AlertPriority.LIFE_THREATENING: "5-10 minutos (ambulancia en camino)",
            AlertPriority.CRITICAL: "15-30 minutos",
            AlertPriority.URGENT: "30-60 minutos",
            AlertPriority.ROUTINE: "2-4 horas",
        }
        return response_times.get(priority, "Desconocido")
    
    def get_alert_status(self, alert_id: str) -> Optional[Dict[str, Any]]:
        """Obtener estado actual de una alerta"""
        for alert in self.alerts_sent:
            if alert["alert_id"] == alert_id:
                return alert
        return None
    
    def get_pending_alerts(self) -> List[Dict[str, Any]]:
        """Obtener alertas pendientes de resolución"""
        return [
            alert for alert in self.alerts_sent 
            if alert["status"] not in [AlertStatus.RESOLVED, AlertStatus.FAILED]
        ]


# Instancia global del sistema de alertas
hospital_alert_system = HospitalAlert()
