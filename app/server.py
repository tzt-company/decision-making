"""FastAPI server: serves the playground UI and real Laya CPU inference."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Prefer HF mirror when the default hub is unreachable (common on CN networks).
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

# 权重在项目 models/hub，而不是 C 盘用户缓存
_ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HUB_CACHE", str(_ROOT / "models" / "hub"))
os.environ.setdefault("HF_HOME", str(_ROOT / "models"))

from app.engine import engine  # noqa: E402
from app.git_scan import list_repos  # noqa: E402
from app.precheck import run_precheck  # noqa: E402
from app.scenarios import get_scenario, list_scenarios  # noqa: E402

ROOT = _ROOT
STATIC = ROOT / "static"

app = FastAPI(title="Laya System 1 Decision Playground", version="0.1.0")


class PredictBody(BaseModel):
    scenario_id: str
    text: str = Field(min_length=1, max_length=8000)
    model: str | None = Field(default=None, description="Optional checkpoint override: english | multilingual")
    run_all_samples: bool = False


class RouteBody(BaseModel):
    scenario_id: str
    text: str = Field(min_length=1, max_length=8000)
    model: str | None = None


class PrecheckBody(BaseModel):
    mode: str = Field(default="auto", description="auto | staged | working | last-commit")
    repo_path: str | None = Field(default=None, description="要检查的 git 仓库路径；默认当前 Demo 仓库")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine_ready": engine.ready,
        "load_error": engine.load_error,
        "backend": "laya-cpu",
    }


@app.get("/api/scenarios")
def scenarios() -> dict[str, Any]:
    return {"scenarios": list_scenarios()}


@app.post("/api/predict")
def predict(body: PredictBody) -> dict[str, Any]:
    try:
        scenario = get_scenario(body.scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        if body.run_all_samples:
            items = []
            for sample in scenario["samples"]:
                state = {scenario["state_key"]: sample["text"]}
                res = engine.predict(state, scenario["questions"], model=body.model)
                res["sample_id"] = sample["id"]
                res["sample_label"] = sample["label"]
                res["text"] = sample["text"]
                items.append(res)
            return {"scenario_id": scenario["id"], "mode": "batch_samples", "results": items}

        state = {scenario["state_key"]: body.text}
        res = engine.predict(state, scenario["questions"], model=body.model)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"推理失败：{exc}") from exc

    res["scenario_id"] = scenario["id"]
    res["text"] = body.text
    res["mode"] = "single"
    return res


@app.post("/api/route")
def route(body: RouteBody) -> dict[str, Any]:
    try:
        scenario = get_scenario(body.scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    state = {scenario["state_key"]: body.text}
    try:
        decision = engine.route_only(state, scenario["questions"], model=body.model)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"选模型失败：{exc}") from exc
    return {"scenario_id": scenario["id"], "routing": decision}


@app.get("/api/repos")
def repos() -> dict[str, Any]:
    """列出可选的 git 项目。"""
    try:
        return {"repos": list_repos()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"扫描项目失败：{exc}") from exc


@app.post("/api/precheck")
def precheck(body: PrecheckBody | None = None) -> dict[str, Any]:
    """自动读指定项目的 git 改动做安全预检，无需手动粘贴代码。"""
    mode = (body.mode if body else "auto") or "auto"
    repo_path = body.repo_path if body else None
    try:
        return run_precheck(mode, repo_path=repo_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"预检失败：{exc}") from exc


@app.post("/api/warmup")
def warmup() -> dict[str, Any]:
    try:
        engine.ensure_loaded()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"加载模型失败：{exc}") from exc
    return {"ok": True, "engine_ready": True}


@app.get("/")
def index() -> FileResponse:
    resp = FileResponse(STATIC / "index.html")
    resp.headers["Cache-Control"] = "no-cache, must-revalidate"
    return resp


app.mount("/static", StaticFiles(directory=STATIC), name="static")


def main() -> None:
    import uvicorn

    uvicorn.run("app.server:app", host="127.0.0.1", port=8766, reload=False)


if __name__ == "__main__":
    main()
