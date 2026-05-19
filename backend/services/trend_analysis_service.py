#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TrendAnalysisService — Longitudinal trend analysis for vital signs.

ARCHITECTURE RULES:
  - This service is ADDITIVE and NON-DIAGNOSTIC.
  - It provides contextual wellness insights across time windows.
  - It NEVER modifies clinical severity, CJM scores, or MedicalEngine.
  - It NEVER triggers emergency alerts or notifications.
  - Feature-gated by TREND_ANALYSIS_ENABLED env var (default: false).

TIME WINDOWS:
  - 24h  (1 day)
  - 7d   (1 week)
  - 30d  (1 month)
  - 90d  (1 quarter)

METRICS PER WINDOW:
  - mean, min, max, count
  - direction (rising, falling, stable)

NO DATABASE MIGRATIONS: uses existing vital_signs table.

© 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("RMHealth.TrendAnalysis")

# Feature flag — must be explicitly enabled
TREND_ANALYSIS_ENABLED = os.environ.get("TREND_ANALYSIS_ENABLED", "false").lower() == "true"

# Time windows in hours
WINDOWS = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
    "90d": 24 * 90,
}

# Vital signs column mapping
VITAL_COLUMNS = {
    "heart_rate": "ritmo_cardiaco",
    "spo2": "spo2",
    "systolic": "presion_sistolica",
    "diastolic": "presion_diastolica",
    "glucose": "glucosa",
    "temperature": "temp_corporal",
}

# Direction threshold: % change between first-half and second-half means
DIRECTION_THRESHOLD_PCT = 3.0


def is_enabled() -> bool:
    """Check if trend analysis feature is enabled."""
    return TREND_ANALYSIS_ENABLED


def compute_direction(values: List[float]) -> str:
    """
    Determine trend direction by comparing the first-half mean to second-half mean.
    Returns: 'rising', 'falling', or 'stable'.
    """
    if len(values) < 4:
        return "stable"
    
    mid = len(values) // 2
    first_half = values[:mid]
    second_half = values[mid:]
    
    mean_first = sum(first_half) / len(first_half)
    mean_second = sum(second_half) / len(second_half)
    
    if mean_first == 0:
        return "stable"
    
    pct_change = ((mean_second - mean_first) / abs(mean_first)) * 100
    
    if pct_change > DIRECTION_THRESHOLD_PCT:
        return "rising"
    elif pct_change < -DIRECTION_THRESHOLD_PCT:
        return "falling"
    return "stable"


def get_trends_for_user(conn, usuario_id: str) -> Optional[Dict[str, Any]]:
    """
    Compute longitudinal trends for a user across all time windows.
    
    Args:
        conn: psycopg2 database connection
        usuario_id: User identifier
        
    Returns:
        Dictionary with trend data per vital sign per window, or None if disabled.
    """
    if not TREND_ANALYSIS_ENABLED:
        return None
    
    try:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc)
        result = {}
        
        for vital_name, db_column in VITAL_COLUMNS.items():
            result[vital_name] = {}
            
            for window_name, hours in WINDOWS.items():
                window_start = now - timedelta(hours=hours)
                
                # Query: get all non-null readings for this vital in this window
                cursor.execute(
                    f"""
                    SELECT {db_column}, timestamp
                    FROM vital_signs
                    WHERE usuario_id = %s
                      AND timestamp >= %s
                      AND {db_column} IS NOT NULL
                    ORDER BY timestamp ASC
                    """,
                    (usuario_id, window_start)
                )
                
                rows = cursor.fetchall()
                
                if not rows or len(rows) == 0:
                    result[vital_name][window_name] = {
                        "count": 0,
                        "mean": None,
                        "min": None,
                        "max": None,
                        "direction": "insufficient_data",
                    }
                    continue
                
                values = [float(row[0]) for row in rows if row[0] is not None]
                
                if not values:
                    result[vital_name][window_name] = {
                        "count": 0,
                        "mean": None,
                        "min": None,
                        "max": None,
                        "direction": "insufficient_data",
                    }
                    continue
                
                mean_val = sum(values) / len(values)
                direction = compute_direction(values)
                
                result[vital_name][window_name] = {
                    "count": len(values),
                    "mean": round(mean_val, 1),
                    "min": round(min(values), 1),
                    "max": round(max(values), 1),
                    "direction": direction,
                    "first_reading": rows[0][1].isoformat() if rows[0][1] else None,
                    "last_reading": rows[-1][1].isoformat() if rows[-1][1] else None,
                }
        
        logger.info(f"[TrendAnalysis] Computed trends for user {usuario_id[:8]}...")
        
        return {
            "usuario_id": usuario_id,
            "computed_at": now.isoformat(),
            "windows": list(WINDOWS.keys()),
            "vitals": result,
            "is_non_diagnostic": True,
            "disclaimer": "Datos de contexto preventivo. No constituyen diagnóstico médico.",
        }
    
    except Exception as e:
        logger.error(f"[TrendAnalysis] Error computing trends: {e}")
        return None
