"""Smoke test: real Laya CPU inference across all demo scenarios."""

from __future__ import annotations

import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from app.engine import engine
from app.scenarios import list_scenarios


def main() -> int:
    print("== warmup (download + load EN + multilingual) ==")
    engine.ensure_loaded()
    print("engine ready")

    ok = True
    for scn in list_scenarios():
        print(f"\n== scenario: {scn['id']} ==")
        for sample in scn["samples"][:2]:
            state = {scn["state_key"]: sample["text"]}
            res = engine.predict(state, scn["questions"])
            routing = res.get("routing", {})
            print(
                f"  [{sample['id']}] model={routing.get('model')} "
                f"latency={res.get('latency_ms')}ms "
                f"reason={routing.get('reason', '')[:60]}"
            )
            for qid, ans in res.get("answers", {}).items():
                if ans["type"] == "choice":
                    print(f"    {qid}: choice={ans['choice']} conf={ans['confidence']}")
                elif ans["type"] == "score":
                    print(f"    {qid}: score={ans['score']} conf={ans['confidence']}")
                else:
                    print(f"    {qid}: noul={ans['noul']} conf={ans['confidence']}")
            if not res.get("answers"):
                ok = False
                print("    ERROR: empty answers")

        # Multilingual scenario: run all samples to verify routing
        if scn.get("mode") == "multilingual_compare":
            print("  -- routing matrix --")
            for sample in scn["samples"]:
                state = {scn["state_key"]: sample["text"]}
                decision = engine.route_only(state, scn["questions"])
                print(f"    {sample['id']:10} -> {decision.get('model'):12} {decision.get('reason', '')[:70]}")

    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
