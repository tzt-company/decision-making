"""下载 Laya 权重到项目内 models/hub/（开源后用户只需跑这一步）。

用法：
    python -m app.fetch_models
    python -m app.fetch_models --with-typed-decisions
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUB = ROOT / "models" / "hub"


def main() -> int:
    parser = argparse.ArgumentParser(description="下载 Laya 模型到 models/hub（约 1.5GB）")
    parser.add_argument(
        "--with-typed-decisions",
        action="store_true",
        help="同时下载专用决策模型（更大，默认只下英文+多语言）",
    )
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("HF_ENDPOINT", "https://hf-mirror.com"),
        help="Hugging Face 端点；国内默认镜像，可设为 https://huggingface.co",
    )
    args = parser.parse_args()

    os.environ["HF_ENDPOINT"] = args.endpoint
    os.environ["HF_HUB_DISABLE_XET"] = os.environ.get("HF_HUB_DISABLE_XET", "1")
    os.environ["HF_HUB_CACHE"] = str(HUB)
    os.environ["HF_HOME"] = str(ROOT / "models")

    HUB.mkdir(parents=True, exist_ok=True)
    print(f"下载目录：{HUB}")
    print(f"下载端点：{args.endpoint}")
    print("请稍候，约 1.5GB（英文 + 多语言）…\n")

    patterns = [
        "*.json",
        "*.txt",
        "tokenizer*",
        "encoder/**",
        "tokenizer/**",
        "multilingual/**",
        "model.safetensors",
        "rl_agent*",
    ]
    if args.with_typed_decisions:
        patterns.append("typed-decisions/**")

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("缺少 huggingface_hub，请先：pip install -r requirements.txt", file=sys.stderr)
        return 2

    try:
        path = snapshot_download(
            "convaiinnovations/laya",
            allow_patterns=patterns,
            max_workers=4,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"下载失败：{exc}", file=sys.stderr)
        print("可尝试：set HF_ENDPOINT=https://huggingface.co 后重试", file=sys.stderr)
        return 1

    # 粗校验：应至少包含两个大权重
    weights = list(Path(path).rglob("*.safetensors"))
    total = sum(p.stat().st_size for p in weights if p.exists())
    print(f"\n完成：{path}")
    print(f"权重文件 {len(weights)} 个，共 {total / 1024 / 1024:.1f} MB")
    if total < 500 * 1024 * 1024:
        print("警告：权重体积偏小，可能没下全。可重新运行本脚本。", file=sys.stderr)
        return 1

    print("\n下一步：python -m app.server  然后打开 http://127.0.0.1:8766")
    return 0


if __name__ == "__main__":
    sys.exit(main())
