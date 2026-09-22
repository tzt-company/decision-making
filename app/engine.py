"""Laya Router engine: real CPU inference, no mock data."""

from __future__ import annotations

import threading
import time
from typing import Any

from laya import Router


class LayaEngine:
    def __init__(self) -> None:
        self._router: Router | None = None
        self._lock = threading.Lock()
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
                # Keep EN + multilingual resident; skip typed-decisions to save RAM on CPU.
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
        router = self.ensure_loaded()
        t0 = time.perf_counter()
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
