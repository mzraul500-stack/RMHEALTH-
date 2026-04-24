"""
Sistema de Supervisión Médica Obligatoria
Gestiona la cola de casos que requieren revisión por médicos profesionales
"""
import structlog
from typing import Dict, Any, List, Optional
from datetime import datetime
from enum import Enum
from uuid import uuid4

logger = structlog.get_logger(__name__)


class SupervisionStatus(str, Enum):
    """Estados de supervisión"""
    PENDING = "pending"  # Pendiente de revisión
    IN_REVIEW = "in_review"  # En revisión
    APPROVED = "approved"  # Aprobado
    REJECTED = "rejected"  # Rechazado
    ESCALATED = "escalated"  # Escalado a supervisor


class SupervisionQueue:
    """
    Cola de supervisión médica
    
    Todos los casos críticos pasan por aquí para revisión obligatoria
    """
    
    def __init__(self):
        # TODO: Implementar con base de datos real
        # Por ahora usamos memoria local
        self._queue: Dict[str, Dict[str, Any]] = {}
        
    async def add_case(
        self,
        patient_id: str,
        analysis: Dict[str, Any],
        severity: str,
        timestamp: Optional[datetime] = None,
    ) -> str:
        """
        Agregar caso a la cola de supervisión
        
        Args:
            patient_id: ID del paciente
            analysis: Análisis médico generado por IA
            severity: Severidad del caso
            timestamp: Timestamp del caso
            
        Returns:
            ID del caso en la cola
        """
        case_id = str(uuid4())
        
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        case = {
            "case_id": case_id,
            "patient_id": patient_id,
            "analysis": analysis,
            "severity": severity,
            "status": SupervisionStatus.PENDING,
            "created_at": timestamp,
            "reviewed_at": None,
            "reviewer_id": None,
            "reviewer_notes": None,
            "action_taken": None,
        }
        
        self._queue[case_id] = case
        
        logger.info(
            "Caso agregado a cola de supervisión",
            case_id=case_id,
            patient_id=patient_id,
            severity=severity,
        )
        
        return case_id
    
    async def get_pending_cases(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Obtener casos pendientes de revisión"""
        pending = [
            case for case in self._queue.values()
            if case["status"] == SupervisionStatus.PENDING
        ]
        
        # Ordenar por severidad y timestamp
        pending.sort(
            key=lambda x: (
                0 if x["severity"] == "critical" else 1 if x["severity"] == "high" else 2,
                x["created_at"]
            )
        )
        
        return pending[:limit]
    
    async def get_case(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Obtener un caso específico"""
        return self._queue.get(case_id)
    
    async def update_case_status(
        self,
        case_id: str,
        status: SupervisionStatus,
        reviewer_id: str,
        notes: Optional[str] = None,
        action: Optional[str] = None,
    ) -> bool:
        """
        Actualizar estado de un caso
        
        Args:
            case_id: ID del caso
            status: Nuevo estado
            reviewer_id: ID del médico revisor
            notes: Notas del revisor
            action: Acción tomada
            
        Returns:
            True si se actualizó correctamente
        """
        case = self._queue.get(case_id)
        if not case:
            logger.warning("Caso no encontrado", case_id=case_id)
            return False
        
        case["status"] = status
        case["reviewed_at"] = datetime.utcnow()
        case["reviewer_id"] = reviewer_id
        case["reviewer_notes"] = notes
        case["action_taken"] = action
        
        logger.info(
            "Caso actualizado",
            case_id=case_id,
            status=status,
            reviewer_id=reviewer_id,
        )
        
        return True
    
    async def escalate_case(
        self,
        case_id: str,
        reason: str,
        escalated_by: str,
    ) -> bool:
        """
        Escalar un caso a nivel superior
        
        Args:
            case_id: ID del caso
            reason: Razón de escalamiento
            escalated_by: ID de quien escala
            
        Returns:
            True si se escaló correctamente
        """
        case = self._queue.get(case_id)
        if not case:
            return False
        
        case["status"] = SupervisionStatus.ESCALATED
        case["escalation_reason"] = reason
        case["escalated_by"] = escalated_by
        case["escalated_at"] = datetime.utcnow()
        
        logger.warning(
            "Caso escalado",
            case_id=case_id,
            reason=reason,
            escalated_by=escalated_by,
        )
        
        # TODO: Enviar notificación al supervisor
        
        return True
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Obtener estadísticas de la cola de supervisión"""
        total = len(self._queue)
        pending = sum(1 for c in self._queue.values() if c["status"] == SupervisionStatus.PENDING)
        in_review = sum(1 for c in self._queue.values() if c["status"] == SupervisionStatus.IN_REVIEW)
        approved = sum(1 for c in self._queue.values() if c["status"] == SupervisionStatus.APPROVED)
        rejected = sum(1 for c in self._queue.values() if c["status"] == SupervisionStatus.REJECTED)
        escalated = sum(1 for c in self._queue.values() if c["status"] == SupervisionStatus.ESCALATED)
        
        return {
            "total_cases": total,
            "pending": pending,
            "in_review": in_review,
            "approved": approved,
            "rejected": rejected,
            "escalated": escalated,
        }


class MedicalSupervisor:
    """
    Supervisor médico para validar análisis de IA
    """
    
    def __init__(self):
        self.queue = SupervisionQueue()
        
    async def require_supervision(
        self,
        patient_id: str,
        analysis: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Marcar un análisis como que requiere supervisión médica
        
        Args:
            patient_id: ID del paciente
            analysis: Análisis médico de IA
            
        Returns:
            Info del caso en cola de supervisión
        """
        severity = analysis.get("severity", "medium")
        
        case_id = await self.queue.add_case(
            patient_id=patient_id,
            analysis=analysis,
            severity=severity,
        )
        
        return {
            "case_id": case_id,
            "status": "requires_supervision",
            "message": "Este caso ha sido enviado a la cola de revisión médica profesional.",
            "estimated_review_time": "15-30 minutos",  # Estimado
        }
    
    async def review_case(
        self,
        case_id: str,
        reviewer_id: str,
        approved: bool,
        notes: Optional[str] = None,
        corrected_analysis: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Revisar y aprobar/rechazar un caso
        
        Args:
            case_id: ID del caso
            reviewer_id: ID del médico revisor
            approved: Si se aprueba o rechaza
            notes: Notas del revisor
            corrected_analysis: Análisis corregido por el médico
            
        Returns:
            Resultado de la revisión
        """
        status = SupervisionStatus.APPROVED if approved else SupervisionStatus.REJECTED
        action = "approved" if approved else "rejected_with_corrections"
        
        success = await self.queue.update_case_status(
            case_id=case_id,
            status=status,
            reviewer_id=reviewer_id,
            notes=notes,
            action=action,
        )
        
        if not success:
            raise ValueError(f"No se pudo actualizar el caso {case_id}")
        
        result = {
            "case_id": case_id,
            "status": status,
            "reviewed_by": reviewer_id,
            "approved": approved,
            "notes": notes,
        }
        
        if corrected_analysis:
            result["corrected_analysis"] = corrected_analysis
        
        return result


# Instancia global del supervisor
medical_supervisor = MedicalSupervisor()
