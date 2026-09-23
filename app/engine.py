"""Laya Router engine: real CPU inference, no mock data.

Loads from local Hugging Face cache first so a flaky network cannot hang a request.
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any

# 权重放在项目内 models/hub，不占 C 盘用户缓存
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_HUB = _PROJECT_ROOT / "models" / "hub"
os.environ.setdefault("HF_HUB_CACHE", str(_PROJECT_HUB))
os.environ.setdefault("HF_HOME", str(_PROJECT_ROOT / "models"))

from laya import Router  # noqa: E402

HF_CACHE = _PROJECT_HUB / "models--convaiinnovations--laya"


class LayaEngine:
    def __init__(self) -> None:
        self._router: Router | None = None
        self._lock = threading.Lock()
        self._infer_lock = threading.Lock()
        self._load_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._router is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def ensure_loaded(self) -> Router:
        with self._lock:
            if self._router is not None:
                return self._router
            try:
                # Offline-first: weights already in cache must never re-download / hang.
                if not HF_CACHE.exists() or not any(HF_CACHE.rglob("*.safetensors")):
                    self._load_error = (
                        "未找到模型权重。请先执行：python -m app.fetch_models "
                        f"（目录 {HF_CACHE}）"
                    )
                    raise FileNotFoundError(self._load_error)
                os.environ["HF_HUB_OFFLINE"] = "1"
                os.environ["HF_DATASETS_OFFLINE"] = "1"
                # Keep EN + multilingual resident; never pull typed-decisions (incomplete + huge).
                self._router = Router(max_loaded=2, device="cpu")
                self._router.preload(["english", "multilingual"])
                self._load_error = None
            except Exception as exc:  # noqa: BLE001 — surface load failures to the UI
                self._load_error = str(exc)
                raise
            return self._router

    def predict(
        self,
        state: dict[str, Any] | str | list,
        questions: dict[str, Any],
        model: str | None = None,
    ) -> dict[str, Any]:
        # typed-decisions is not preloaded on this demo — force a resident checkpoint instead.
        if model == "typed-decisions":
            model = None
        router = self.ensure_loaded()
        t0 = time.perf_counter()
        with self._infer_lock:
            result = router.predict(state, questions, model=model)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        result = _jsonify(result)
        result["latency_ms"] = round(latency_ms, 1)
        return result

    def route_only(
        self,
        state: dict[str, Any] | str | list,
        questions: dict[str, Any] | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        if model == "typed-decisions":
            model = None
        router = self.ensure_loaded()
        decision = router.route(state, questions, model=model)
        return _jsonify(dict(decision))


def _jsonify(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): _jsonify(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonify(v) for v in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


engine = LayaEngine()
