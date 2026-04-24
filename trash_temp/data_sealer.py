#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔒 DATA SEALER - Sellado SHA-256 para Audit Trail HIPAA
========================================================
Genera sellos criptográficos de integridad para archivos y datos críticos.
Usado para:
- Sellado de eventos de emergencia (audit trail)
- Verificación de integridad de reportes FHIR
- Protección de propiedad intelectual

Autor: Raúl Morales Zepeda
Origen: RM AI QUANTIC - Migrado y adaptado para RMHealth Ecosystem
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Union
import logging

logger = logging.getLogger("rmhealth.data_sealer")

# Directorio de sellos por defecto (relativo al proyecto)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SEALS_DIR = _PROJECT_ROOT / "logs" / "seals"


def generar_sello_sha256(
    contenido: Union[str, bytes, Dict[str, Any]],
    identificador: str,
    autor: str = "RMHealth Ecosystem",
    proyecto: str = "RMHealth Emergency Protocol",
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Genera un sello SHA-256 para cualquier contenido.

    Args:
        contenido: Texto, bytes o dict a sellar.
        identificador: Nombre lógico del recurso sellado
            (ej: "emergency_event_abc123").
        autor: Autor del sello.
        proyecto: Proyecto al que pertenece.
        output_dir: Directorio donde guardar los archivos de sello.
            None = solo retorna dict.

    Returns:
        Dict con hash, timestamp y metadata del sello.
    """
    # Serializar contenido a bytes
    if isinstance(contenido, dict):
        raw = json.dumps(
            contenido,
            sort_keys=True,
            default=str).encode("utf-8")
    elif isinstance(contenido, str):
        raw = contenido.encode("utf-8")
    else:
        raw = contenido

    hash_sha256 = hashlib.sha256(raw).hexdigest()
    timestamp = datetime.now(timezone.utc).isoformat()

    sello = {
        "identificador": identificador,
        "autor": autor,
        "proyecto": proyecto,
        "hash_sha256": hash_sha256,
        "timestamp_utc": timestamp,
        "tamano_bytes": len(raw),
        "certificacion_valida": True,
    }

    if output_dir is not None:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        safe_name = identificador.replace("/", "_").replace("\\", "_")

        # JSON de sello
        sello_path = output_dir / f"{safe_name}_SELLO.json"
        with open(sello_path, "w", encoding="utf-8") as f:
            json.dump(sello, f, indent=4, ensure_ascii=False)

        # Texto de verificación
        verif_path = output_dir / f"{safe_name}_VERIFICACION.txt"
        with open(verif_path, "w", encoding="utf-8") as f:
            f.write("=" * 52 + "\n")
            f.write("   CERTIFICADO DE VERIFICACIÓN DE INTEGRIDAD\n")
            f.write("=" * 52 + "\n")
            f.write(f"Recurso: {identificador}\n")
            f.write(f"Autor: {autor}\n")
            f.write(f"Fecha ISO 8601: {timestamp}\n")
            f.write(f"Tamaño: {len(raw)} bytes\n")
            f.write(f"Hash SHA-256:\n{hash_sha256}\n")
            f.write("=" * 52 + "\n")

        logger.info("Sello generado: %s → %s", identificador, hash_sha256[:16])

    return sello


def verificar_integridad(
    contenido: Union[str, bytes, Dict[str, Any]],
    hash_esperado: str,
) -> bool:
    """
    Verifica que el contenido coincida con un hash SHA-256 previo.

    Args:
        contenido: Contenido a verificar.
        hash_esperado: Hash SHA-256 esperado (hex).

    Returns:
        True si el hash coincide.
    """
    if isinstance(contenido, dict):
        raw = json.dumps(
            contenido,
            sort_keys=True,
            default=str).encode("utf-8")
    elif isinstance(contenido, str):
        raw = contenido.encode("utf-8")
    else:
        raw = contenido

    hash_actual = hashlib.sha256(raw).hexdigest()
    return hash_actual == hash_esperado


def sellar_archivo(
    archivo: Union[str, Path],
    output_dir: Optional[Path] = None,
    autor: str = "RMHealth Ecosystem",
    proyecto: str = "RMHealth Emergency Protocol",
) -> Dict[str, Any]:
    """
    Lee un archivo y genera su sello SHA-256.

    Args:
        archivo: Ruta al archivo a sellar.
        output_dir: Directorio para guardar sello. Default: logs/seals/
        autor: Autor del sello.
        proyecto: Proyecto.

    Returns:
        Dict con información del sello.
    """
    archivo = Path(archivo)
    if not archivo.exists():
        raise FileNotFoundError(f"Archivo no encontrado: {archivo}")

    with open(archivo, "rb") as f:
        contenido = f.read()

    if output_dir is None:
        output_dir = DEFAULT_SEALS_DIR

    return generar_sello_sha256(
        contenido=contenido,
        identificador=archivo.name,
        autor=autor,
        proyecto=proyecto,
        output_dir=output_dir,
    )


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        resultado = sellar_archivo(sys.argv[1])
        print(json.dumps(resultado, indent=2))
    else:
        # Demo
        demo_data = {
            "emergency_id": "demo-123",
            "patient": "test",
            "timestamp": datetime.now(
                timezone.utc).isoformat()}
        resultado = generar_sello_sha256(
            demo_data,
            "demo_emergency_event",
            output_dir=DEFAULT_SEALS_DIR)
        print(json.dumps(resultado, indent=2))
        print(
            f"\nVerificación: {
                verificar_integridad(
                    demo_data,
                    resultado['hash_sha256'])}")
