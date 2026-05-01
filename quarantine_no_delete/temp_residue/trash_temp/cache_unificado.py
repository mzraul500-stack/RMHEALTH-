#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🗄️ CACHE UNIFICADO - Sistema LRU con Compresión Zstandard
==========================================================
Cache compartido de alto rendimiento para el ecosistema RMHealth:
- Graph Engine (nodos, aristas, inferencias)
- Datos clínicos (resultados de triaje, evaluaciones)

Características:
- LRU eviction policy (configurable, default 2GB)
- Compresión Zstandard opcional
- Persistencia a disco
- Consolidación automática por scheduler
- Métricas hit/miss en tiempo real
- Thread-safe

Autor: Raúl Morales Zepeda
Offline-First: Sin dependencias de red
"""

import atexit
import hashlib
import importlib
import json
import logging
import pickle
import queue
import signal
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("rmhealth.cache")

# Importación opcional de compresión
try:
    zstd = importlib.import_module("zstandard")
    COMPRESSION_AVAILABLE = True
except ImportError:
    COMPRESSION_AVAILABLE = False
    zstd = None

# Raíz del proyecto
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════


class WriteMode(Enum):
    """Modo de escritura a disco."""

    # Escritura inmediata (datos críticos: sellado HIPAA)
    SYNC = "sync"
    BUFFERED = "buffered"  # Write-behind buffer (streaming vitales)


@dataclass
class CacheConfig:
    """Configuración del sistema de cache unificado."""

    base_path: Path = field(default_factory=lambda: _PROJECT_ROOT / "cache")
    embeddings_path: Path = field(init=False)
    checkpoints_path: Path = field(init=False)
    graph_cache_path: Path = field(init=False)
    consolidation_path: Path = field(init=False)
    metrics_path: Path = field(init=False)

    max_cache_size_gb: float = 2.0
    max_items_per_type: int = 1000

    compression_level: int = 3
    compress_threshold_kb: int = 1

    episodic_interval_hours: int = 1
    semantic_interval_hours: int = 24
    cleanup_interval_hours: int = 6

    # Write-behind buffer
    # Flush cada N segundos.
    flush_interval_seconds: float = 2.0
    # Flush si el buffer alcanza N entradas.
    flush_batch_max: int = 500
    # Backward compatible.
    default_write_mode: WriteMode = WriteMode.SYNC

    def __post_init__(self):
        self.embeddings_path = self.base_path / "embeddings"
        self.checkpoints_path = self.base_path / "checkpoints"
        self.graph_cache_path = self.base_path / "graph_cache"
        self.consolidation_path = self.base_path / "consolidation"
        self.metrics_path = self.base_path / "metrics"


@dataclass
class CacheEntry:
    """Entrada individual del cache."""

    key: str
    value: Any
    size_bytes: int
    access_count: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    accessed_at: datetime = field(default_factory=datetime.now)
    source: str = ""  # "semantico", "graph", "clinico"
    compressed: bool = False
    hash_sha256: str = ""

    def update_access(self):
        self.access_count += 1
        self.accessed_at = datetime.now()


@dataclass
class CacheMetrics:
    """Métricas operacionales."""

    hits: int = 0
    misses: int = 0
    evictions: int = 0
    total_size_bytes: int = 0
    items_count: int = 0
    last_cleanup: datetime = field(default_factory=datetime.now)

    # Write-behind buffer metrics
    buffered_writes: int = 0       # Total de PUT en modo BUFFERED
    sync_writes: int = 0           # Total de PUT en modo SYNC
    flush_count: int = 0           # Veces que se ejecutó flush
    flush_total_items: int = 0     # Items totales flusheados
    panic_flushes: int = 0         # Flushes de emergencia (shutdown)
    buffer_peak_size: int = 0      # Máximo de items en buffer

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0

    @property
    def size_mb(self) -> float:
        return self.total_size_bytes / (1024 * 1024)

    @property
    def size_gb(self) -> float:
        return self.size_mb / 1024

    @property
    def avg_batch_size(self) -> float:
        if self.flush_count:
            return self.flush_total_items / self.flush_count
        return 0.0


# ═══════════════════════════════════════════════════════════════════════════
# CACHE UNIFICADO LRU
# ═══════════════════════════════════════════════════════════════════════════


class CacheUnificado:
    """
    Cache unificado LRU con compresión Zstandard y persistencia a disco.

    Uso:
        cache = CacheUnificado()
        cache.put("mi_key", datos, source="semantico")
        valor = cache.get("mi_key")
    """

    def __init__(self, config: Optional[CacheConfig] = None):
        self.config = config or CacheConfig()
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()

        if COMPRESSION_AVAILABLE:
            self._compressor = zstd.ZstdCompressor(
                level=self.config.compression_level)
            self._decompressor = zstd.ZstdDecompressor()
        else:
            self._compressor = None
            self._decompressor = None

        self.metrics = CacheMetrics()
        self._lock = threading.RLock()
        self._scheduler_running = False
        self._scheduler_thread = None

        # ── Write-Behind Buffer ──
        self._write_queue: queue.Queue[Tuple[str, CacheEntry]] = queue.Queue()
        self._flush_running = False
        self._flush_thread: Optional[threading.Thread] = None
        self._shutdown_event = threading.Event()

        self._crear_directorios()
        self._cargar_cache_persistente()
        self._iniciar_scheduler()
        self._iniciar_flush_thread()
        self._registrar_panic_flush()

        logger.info(
            "Cache Unificado inicializado — "
            "base: %s, limite: %.1f GB, items: %d, "
            "write_mode: %s, flush_interval: %.1fs, "
            "flush_batch: %d",
            self.config.base_path,
            self.config.max_cache_size_gb,
            len(self._cache),
            self.config.default_write_mode.value,
            self.config.flush_interval_seconds,
            self.config.flush_batch_max,
        )

    # ───────────────── Helpers internos ─────────────────

    def _crear_directorios(self):
        for path in [
            self.config.embeddings_path,
            self.config.checkpoints_path,
            self.config.graph_cache_path,
            self.config.consolidation_path,
            self.config.metrics_path,
        ]:
            path.mkdir(parents=True, exist_ok=True)

    def _calcular_hash(self, data: Any) -> str:
        if isinstance(data, (str, bytes)):
            content = data.encode() if isinstance(data, str) else data
        else:
            content = pickle.dumps(data, protocol=pickle.HIGHEST_PROTOCOL)
        return hashlib.sha256(content).hexdigest()[:16]

    def _comprimir(self, data: bytes) -> Tuple[bytes, bool]:
        if self._compressor and len(
                data) > self.config.compress_threshold_kb * 1024:
            try:
                compressed = self._compressor.compress(data)
                if len(compressed) < len(data) * 0.9:
                    return compressed, True
            except Exception as e:
                logger.warning("Error comprimiendo: %s", e)
        return data, False

    def _descomprimir(self, data: bytes, compressed: bool) -> bytes:
        if compressed:
            if not self._decompressor:
                raise RuntimeError(
                    "Datos comprimidos pero zstandard no disponible")
            return self._decompressor.decompress(data)
        return data

    def _serializar(self, value: Any) -> Tuple[bytes, int, bool]:
        data = pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)
        data, compressed = self._comprimir(data)
        return data, len(data), compressed

    def _deserializar(self, data: bytes, compressed: bool) -> Any:
        data = self._descomprimir(data, compressed)
        return pickle.loads(data)

    def _source_dir(self, source: str) -> Path:
        mapping = {
            "semantico": self.config.checkpoints_path,
            "graph": self.config.graph_cache_path,
            "clinico": self.config.embeddings_path,
            "neurochip": self.config.embeddings_path,
        }
        return mapping.get(source, self.config.base_path)

    def _archivo_path(self, key: str, source: str) -> Path:
        return self._source_dir(source) / f"{key}.cache"

    def _remover_archivo(self, key: str, source: str):
        try:
            path = self._archivo_path(key, source)
            if path.exists():
                path.unlink()
        except Exception as e:
            logger.warning("Error removiendo archivo %s: %s", key, e)

    # ───────────────── Persistencia ─────────────────

    def _cargar_cache_persistente(self):
        loaded = 0
        for source, subdir in [
            ("semantico", self.config.checkpoints_path),
            ("graph", self.config.graph_cache_path),
            ("clinico", self.config.embeddings_path),
        ]:
            if not subdir.exists():
                continue
            for cache_file in subdir.glob("*.cache"):
                try:
                    key = cache_file.stem
                    with open(cache_file, "rb") as f:
                        metadata = pickle.load(f)
                        _ = f.read()  # data cargada bajo demanda
                    entry = CacheEntry(
                        key=key,
                        value=None,
                        size_bytes=metadata["size_bytes"],
                        access_count=metadata.get("access_count", 0),
                        created_at=datetime.fromisoformat(
                            metadata["created_at"]
                        ),
                        accessed_at=datetime.fromisoformat(
                            metadata["accessed_at"]
                        ),
                        source=source,
                        compressed=metadata.get("compressed", False),
                        hash_sha256=metadata.get("hash_sha256", ""),
                    )
                    self._cache[key] = entry
                    self.metrics.total_size_bytes += entry.size_bytes
                    self.metrics.items_count += 1
                    loaded += 1
                except Exception as e:
                    logger.warning("Error cargando %s: %s", cache_file, e)
        if loaded:
            logger.info(
                "Cache cargado: %d items (%.1f MB)",
                loaded,
                self.metrics.size_mb)

    def _guardar_persistente(self, key: str, entry: CacheEntry):
        try:
            path = self._archivo_path(key, entry.source)
            data, _, _ = self._serializar(entry.value)
            metadata = {
                "size_bytes": entry.size_bytes,
                "access_count": entry.access_count,
                "created_at": entry.created_at.isoformat(),
                "accessed_at": entry.accessed_at.isoformat(),
                "compressed": entry.compressed,
                "hash_sha256": entry.hash_sha256,
            }
            with open(path, "wb") as f:
                pickle.dump(metadata, f)
                f.write(data)
        except Exception as e:
            logger.error("Error guardando %s: %s", key, e)

    # ───────────────── LRU Eviction ─────────────────

    def _eviction_lru(self):
        with self._lock:
            evicted = 0
            while (
                self.metrics.size_gb > self.config.max_cache_size_gb
                and self._cache
            ):
                key, entry = self._cache.popitem(last=False)
                self.metrics.total_size_bytes -= entry.size_bytes
                self.metrics.items_count -= 1
                evicted += 1
                self._remover_archivo(key, entry.source)

            # Eviction por tipo
            tipos_count: Dict[str, int] = {}
            for entry in self._cache.values():
                tipos_count[entry.source] = tipos_count.get(
                    entry.source, 0) + 1

            for source, count in tipos_count.items():
                if count > self.config.max_items_per_type:
                    items = sorted(
                        [
                            (k, v)
                            for k, v in self._cache.items()
                            if v.source == source
                        ],
                        key=(lambda x: x[1].accessed_at),
                    )
                    for i in range(count - self.config.max_items_per_type):
                        k, e = items[i]
                        del self._cache[k]
                        self.metrics.total_size_bytes -= e.size_bytes
                        self.metrics.items_count -= 1
                        evicted += 1
                        self._remover_archivo(k, e.source)

            if evicted:
                self.metrics.evictions += evicted
                logger.info("LRU eviction: %d items removidos", evicted)

    # ───────────────── API Pública ─────────────────

    def get(self, key: str, source: str = "") -> Optional[Any]:
        """Obtiene valor del cache. Retorna None si no existe."""
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                self._cache.move_to_end(key)
                entry.update_access()

                if entry.value is None:
                    try:
                        path = self._archivo_path(key, entry.source)
                        with open(path, "rb") as f:
                            pickle.load(f)
                            data = f.read()
                        entry.value = self._deserializar(
                            data, entry.compressed)
                    except Exception as e:
                        logger.error("Error cargando valor %s: %s", key, e)
                        return None

                self.metrics.hits += 1
                return entry.value

            self.metrics.misses += 1
            return None

    def put(
        self,
        key: str,
        value: Any,
        source: str = "general",
        mode: Optional[WriteMode] = None,
    ):
        """
        Almacena valor en cache.

        Args:
            key: Clave única.
            value: Valor a almacenar.
            source: Categoría.
                Valores: "vitals", "semantico",
                "graph" o "clinico".
            mode: SYNC = escritura inmediata a disco.
                BUFFERED = actualiza RAM al instante,
                         acumula escritura a disco
                             en lotes (flush cada N seg o al llenar batch).
                  None = usa config.default_write_mode.
        """
        write_mode = mode or self.config.default_write_mode

        with self._lock:
            data, size_bytes, compressed = self._serializar(value)
            hash_val = self._calcular_hash(value)

            entry = CacheEntry(
                key=key,
                value=value,
                size_bytes=size_bytes,
                source=source,
                compressed=compressed,
                hash_sha256=hash_val,
            )

            if key in self._cache:
                old = self._cache[key]
                self.metrics.total_size_bytes -= old.size_bytes
                self.metrics.items_count -= 1

            self._cache[key] = entry
            self.metrics.total_size_bytes += size_bytes
            self.metrics.items_count += 1
            self._cache.move_to_end(key)

            if write_mode == WriteMode.SYNC:
                self._guardar_persistente(key, entry)
                self.metrics.sync_writes += 1
            else:
                self._write_queue.put_nowait((key, entry))
                self.metrics.buffered_writes += 1
                qsize = self._write_queue.qsize()
                if qsize > self.metrics.buffer_peak_size:
                    self.metrics.buffer_peak_size = qsize

            self._eviction_lru()

    def invalidate(self, key: str):
        """Elimina una entrada del cache."""
        with self._lock:
            if key in self._cache:
                entry = self._cache.pop(key)
                self.metrics.total_size_bytes -= entry.size_bytes
                self.metrics.items_count -= 1
                self._remover_archivo(key, entry.source)

    def clear(self, source: Optional[str] = None):
        """Limpia cache completo o por fuente."""
        with self._lock:
            if source:
                keys = [k for k, v in self._cache.items() if v.source ==
                        source]
                for key in keys:
                    self.invalidate(key)
            else:
                for key, entry in self._cache.items():
                    self._remover_archivo(key, entry.source)
                self._cache.clear()
                self.metrics = CacheMetrics()

    def get_stats(self) -> Dict[str, Any]:
        """Retorna estadísticas del cache."""
        with self._lock:
            por_fuente: Dict[str, Dict] = {}
            for entry in self._cache.values():
                src = entry.source
                if src not in por_fuente:
                    por_fuente[src] = {"count": 0, "size_mb": 0.0}
                por_fuente[src]["count"] += 1
                por_fuente[src]["size_mb"] += entry.size_bytes / (1024 * 1024)

            compressed_count = sum(
                1 for e in self._cache.values() if e.compressed)
            total = len(self._cache)

            return {
                "total_items": self.metrics.items_count,
                "total_size_mb": round(self.metrics.size_mb, 2),
                "total_size_gb": round(self.metrics.size_gb, 4),
                "hit_rate": round(self.metrics.hit_rate, 4),
                "hits": self.metrics.hits,
                "misses": self.metrics.misses,
                "evictions": self.metrics.evictions,
                "por_fuente": por_fuente,
                "compression_ratio": (
                    (compressed_count / total) if total else 0.0
                ),
                "limite_gb": self.config.max_cache_size_gb,
                "utilizacion_pct": round(
                    (self.metrics.size_gb / self.config.max_cache_size_gb)
                    * 100,
                    1,
                ),
                # Write-behind buffer stats
                "buffer": {
                    "pending": self._write_queue.qsize(),
                    "buffered_writes": self.metrics.buffered_writes,
                    "sync_writes": self.metrics.sync_writes,
                    "flush_count": self.metrics.flush_count,
                    "flush_total_items": self.metrics.flush_total_items,
                    "avg_batch_size": round(self.metrics.avg_batch_size, 1),
                    "peak_size": self.metrics.buffer_peak_size,
                    "panic_flushes": self.metrics.panic_flushes,
                },
            }

    # ───────────────── Write-Behind Flush Engine ─────────────────

    def _iniciar_flush_thread(self):
        """Inicia el hilo de flush que escribe lotes a disco."""
        self._flush_running = True
        self._flush_thread = threading.Thread(
            target=self._flush_loop, daemon=True, name="CacheFlushThread"
        )
        self._flush_thread.start()

    def _flush_loop(self):
        """Loop principal del flush thread. Escribe a disco en lotes."""
        while self._flush_running:
            try:
                # Esperar hasta flush_interval o hasta que se señale shutdown
                self._shutdown_event.wait(
                    timeout=self.config.flush_interval_seconds)

                if not self._flush_running and self._write_queue.empty():
                    return

                self._flush_buffer()

            except Exception as e:
                logger.error("Error en flush thread: %s", e)

    def _flush_buffer(self):
        """Drena la queue y escribe todo el lote a disco de una sola vez."""
        batch: List[Tuple[str, CacheEntry]] = []
        try:
            while len(batch) < self.config.flush_batch_max:
                batch.append(self._write_queue.get_nowait())
        except queue.Empty:
            pass

        if not batch:
            return

        # Deduplicar: si una key aparece múltiples veces, solo escribir la
        # última
        seen: Dict[str, CacheEntry] = {}
        for key, entry in batch:
            seen[key] = entry

        escribidos = 0
        for key, entry in seen.items():
            try:
                self._guardar_persistente(key, entry)
                escribidos += 1
            except Exception as e:
                logger.error("Flush error al persistir %s: %s", key, e)

        self.metrics.flush_count += 1
        self.metrics.flush_total_items += escribidos

        if escribidos > 0:
            logger.debug(
                "Flush completado: %d/%d items (dedup de %d)",
                escribidos,
                len(seen),
                len(batch),
            )

    def flush_now(self):
        """Fuerza un flush inmediato del buffer."""
        self._flush_buffer()

    def _panic_flush(self, *_args):
        """Último intento de persistir datos en buffer antes de morir."""
        pending = self._write_queue.qsize()
        if pending == 0:
            return

        logger.warning(
            "🚨 PANIC FLUSH: %d items pendientes en buffer, escribiendo...",
            pending)
        try:
            self._flush_buffer()
            self.metrics.panic_flushes += 1
            logger.info(
                "✅ Panic flush completado: %d items salvados",
                pending,
            )
        except Exception as e:
            logger.critical(
                "❌ Panic flush FALLIDO: %s — %d items perdidos", e, pending)

    def _registrar_panic_flush(self):
        """Registra handlers para flush de emergencia."""
        atexit.register(self._panic_flush)
        # SIGTERM (kill, docker stop)
        if hasattr(signal, "SIGTERM"):
            try:
                signal.signal(signal.SIGTERM, self._panic_flush_signal)
            except (OSError, ValueError):
                pass  # No se puede registrar en threads secundarios

    def _panic_flush_signal(self, signum, frame):
        """Handler de señal que ejecuta panic flush y re-envía la señal."""
        self._panic_flush()
        signal.signal(signum, signal.SIG_DFL)

    # ───────────────── Scheduler ─────────────────

    def _iniciar_scheduler(self):
        self._scheduler_running = True
        self._scheduler_thread = threading.Thread(
            target=self._scheduler_loop, daemon=True, name="CacheScheduler"
        )
        self._scheduler_thread.start()

    def stop_scheduler(self):
        """Detiene el scheduler de consolidación y el flush thread."""
        # Flush final: persistir todo lo pendiente antes de parar
        self._flush_buffer()

        self._scheduler_running = False
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            self._scheduler_thread.join(timeout=5)

        self._flush_running = False
        self._shutdown_event.set()
        if self._flush_thread and self._flush_thread.is_alive():
            self._flush_thread.join(timeout=5)

        logger.info("Scheduler + Flush thread detenidos")

    def _scheduler_loop(self):
        last_episodic = datetime.now()
        last_semantic = datetime.now()
        last_cleanup = datetime.now()

        while self._scheduler_running:
            try:
                for _ in range(60):  # 60 × 5s = 5 min
                    if not self._scheduler_running:
                        return
                    time.sleep(5)

                now = datetime.now()

                if now - last_episodic > timedelta(
                    hours=self.config.episodic_interval_hours
                ):
                    self._consolidacion_episodica()
                    last_episodic = now

                if now - last_semantic > timedelta(
                    hours=self.config.semantic_interval_hours
                ):
                    self._consolidacion_semantica()
                    last_semantic = now

                if now - last_cleanup > timedelta(
                    hours=self.config.cleanup_interval_hours
                ):
                    self._limpieza_cache()
                    last_cleanup = now

            except Exception as e:
                logger.error("Error en scheduler: %s", e)
                time.sleep(60)

    def _consolidacion_episodica(self):
        logger.info("Consolidación episódica...")
        with self._lock:
            cutoff = datetime.now() - timedelta(hours=1)
            recientes = [(k, v) for k, v in self._cache.items()
                         if v.created_at > cutoff]
            total_bytes = sum(v.size_bytes for _, v in recientes)

        consolidation_file = (
            self.config.consolidation_path
            / f"episodic_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        data = {
            "timestamp": datetime.now().isoformat(),
            "type": "episodic",
            "total_items": len(self._cache),
            "recent_count": len(recientes),
            "recent_bytes": total_bytes,
            "cache_stats": self.get_stats(),
        }
        with open(consolidation_file, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(
            "Consolidación episódica: %d items recientes",
            len(recientes))

    def _consolidacion_semantica(self):
        logger.info("Consolidación semántica...")
        with self._lock:
            enfatizados = [
                (k, v)
                for k, v in self._cache.items()
                if v.access_count > 5
            ]

        consolidation_file = (
            self.config.consolidation_path
            / f"semantic_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        data = {
            "timestamp": datetime.now().isoformat(),
            "type": "semantic",
            "total_items": len(self._cache),
            "emphasized_count": len(enfatizados),
            "cache_stats": self.get_stats(),
        }
        with open(consolidation_file, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(
            "Consolidación semántica: %d items enfatizados",
            len(enfatizados))

    def _limpieza_cache(self):
        logger.info("Limpieza cache...")
        with self._lock:
            initial = len(self._cache)

            # Huérfanos
            valid_paths = {
                self._archivo_path(
                    k,
                    v.source) for k,
                v in self._cache.items()}
            orphaned = 0
            for d in [
                    self.config.checkpoints_path,
                    self.config.graph_cache_path,
                    self.config.embeddings_path]:
                if d.exists():
                    for f in d.glob("*.cache"):
                        if f not in valid_paths:
                            try:
                                f.unlink()
                                orphaned += 1
                            except Exception:
                                pass

            # Expirados (>7 días sin acceso)
            cutoff = datetime.now() - timedelta(days=7)
            expired_keys = [
                k for k, v in self._cache.items() if v.accessed_at < cutoff]
            for key in expired_keys:
                self.invalidate(key)

            self._eviction_lru()

        logger.info(
            "Limpieza: %d expirados, %d huérfanos (de %d items)",
            len(expired_keys),
            orphaned,
            initial,
        )


# ═══════════════════════════════════════════════════════════════════════════
# Singleton global
# ═══════════════════════════════════════════════════════════════════════════

_instancia: Optional[CacheUnificado] = None


def get_cache(config: Optional[CacheConfig] = None) -> CacheUnificado:
    """Retorna singleton del cache unificado."""
    global _instancia
    if _instancia is None:
        _instancia = CacheUnificado(config)
    return _instancia


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("   DEMO: CACHE UNIFICADO LRU")
    print("=" * 60)

    config = CacheConfig(max_cache_size_gb=0.1)
    cache = CacheUnificado(config)

    test_data = [
        ("semantico", "query_sentiment", {"texto": "análisis sentimiento"}),
        (
            "graph",
            "query_inferencia",
            {"nodos": ["A", "B"], "relaciones": ["A->B"]},
        ),
        ("clinico", "embedding_doc_1", {"vector": [0.1, 0.2, 0.3] * 100}),
    ]

    print("\n📋 Insertando datos...")
    for source, key, value in test_data:
        cache.put(key, value, source)
        print(f"  ✅ {source:10s} | {key}")

    print("\n🎯 Probando hits/misses...")
    for _, key, _ in test_data:
        r = cache.get(key)
        print(f"  {'HIT' if r else 'MISS':4s} | {key}")

    cache.get("no_existe")
    print("  MISS | no_existe")

    stats = cache.get_stats()
    print(
        f"\n📊 Hit rate: {stats['hit_rate']:.0%} | "
        f"Items: {stats['total_items']} | "
        f"{stats['total_size_mb']:.2f} MB"
    )

    cache.stop_scheduler()
    print("\n✅ Demo completado\n")
