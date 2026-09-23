"""CLI: python -m app.precheck [--mode auto|staged|working|last-commit]"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HUB_CACHE", str(_ROOT / "models" / "hub"))
os.environ.setdefault("HF_HOME", str(_ROOT / "models"))
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


def main() -> int:
    parser = argparse.ArgumentParser(description="Laya 代码提交安全预检（自动读 git 改动）")
    parser.add_argument("--mode", default="auto", choices=["auto", "staged", "working", "last-commit"])
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    args = parser.parse_args()

    from app.precheck import run_precheck

    try:
        report = run_precheck(args.mode)
    except Exception as exc:  # noqa: BLE001
        print(f"预检失败：{exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"检查范围：{report.get('source')} · 文件 {report.get('file_count', 0)} 个")
        print(f"风险分：{report.get('score')} / 100（越高越危险）")
        print(f"结论：{report.get('verdict_zh')}")
        hits = report.get("secret_hits") or []
        if hits:
            print("疑似密钥：")
            for h in hits:
                print(f"  [{h['kind']}] {h['file']}:{h['line_no']}  {h['snippet']}")
        for r in report.get("reasons") or []:
            print(f"  - {r}")
        if report.get("latency_ms"):
            print(f"Laya 耗时：{report['latency_ms']} ms")

    verdict = report.get("verdict")
    return 1 if verdict == "block" else 0


if __name__ == "__main__":
    sys.exit(main())
