"""Commit security precheck: regex secrets + Laya risk scoring on real git changes."""

from __future__ import annotations

from typing import Any

from app.engine import engine
from app.git_scan import (
    PRECHECK_DISPLAY,
    PRECHECK_QUESTIONS,
    build_scan_state,
    collect_changes,
    find_danger,
    find_secrets,
)

# 正则命中密钥 → 硬拦截。模型单独高分不足以拦（底座未做代码安全微调，易误报）。
BLOCK_SECRET_P = 0.75
BLOCK_INJECT_P = 0.75
BLOCK_LEAK_P = 0.75
BLOCK_SCORE_THRESHOLD = 2.2  # risk_level 0–3
BLOCK_POB = 0.8


def run_precheck(mode: str = "auto") -> dict[str, Any]:
    change = collect_changes(mode)
    if change.empty:
        return {
            "ok": True,
            "source": change.source,
            "empty": True,
            "verdict": "allow",
            "verdict_zh": "没有需要检查的代码改动",
            "score": 0.0,
            "files": [],
            "secret_hits": [],
            "danger_hits": [],
            "reasons": ["工作区与暂存区均无 diff，可放行"],
            "answers": {},
            "latency_ms": 0,
        }

    secrets = find_secrets(change.full_diff or change.diff, change.files)
    dangers = find_danger(change.full_diff or change.diff)
    state = build_scan_state(change, secrets)
    res = engine.predict(state, PRECHECK_QUESTIONS)
    answers = res.get("answers", {})

    secret_p = float(answers.get("hardcoded_secret", {}).get("noul", 0.0))
    inject_p = float(answers.get("injection_risk", {}).get("noul", 0.0))
    leak_p = float(answers.get("sensitive_leak", {}).get("noul", 0.0))
    risk_score = float(answers.get("risk_level", {}).get("score", 0.0))
    block_p = float(answers.get("should_block", {}).get("noul", 0.0))

    reasons: list[str] = []
    block = False
    review = False

    if secrets:
        block = True
        kinds = sorted({h.kind for h in secrets})
        reasons.append(f"正则命中疑似密钥：{'、'.join(kinds)}（{len(secrets)} 处）→ 硬拦截")

    if dangers and not block:
        review = True
        kinds = sorted({h.kind for h in dangers})
        reasons.append(f"发现危险写法（需人工看上下文）：{'、'.join(kinds)}（{len(dangers)} 处）")

    # 模型信号：高置信才参与拦截；否则最多提示复核
    if secret_p >= BLOCK_SECRET_P:
        block = True
        reasons.append(f"模型：硬编码密钥概率很高 P={secret_p:.3f}")
    elif secret_p >= 0.5:
        review = True
        reasons.append(f"模型：疑似硬编码密钥 P={secret_p:.3f}")

    if inject_p >= BLOCK_INJECT_P:
        block = True
        reasons.append(f"模型：注入/危险执行概率很高 P={inject_p:.3f}")
    elif inject_p >= 0.5:
        review = True
        reasons.append(f"模型：疑似注入/危险执行 P={inject_p:.3f}")

    if leak_p >= BLOCK_LEAK_P:
        block = True
        reasons.append(f"模型：敏感泄漏概率很高 P={leak_p:.3f}")
    elif leak_p >= 0.5:
        review = True
        reasons.append(f"模型：疑似敏感泄漏 P={leak_p:.3f}")

    if risk_score >= BLOCK_SCORE_THRESHOLD and not block:
        review = True
        reasons.append(f"模型：风险等级分偏高 score={risk_score:.2f}")
    # 单独 should_block 偏高不触发拦截/复核（安全主题代码易误报）；
    # 只有同时还有密钥/注入/泄漏信号时才采纳。
    if block_p >= BLOCK_POB and (secret_p >= 0.4 or inject_p >= 0.4 or leak_p >= 0.4 or secrets or dangers) and not block:
        review = True
        reasons.append(f"模型：建议拦截概率较高 P={block_p:.3f}")

    # 综合分 0–100（越高越危险）
    if secrets:
        score = 90.0 + min(10.0, len(secrets) * 2)
    else:
        model_part = (
            0.40 * secret_p + 0.25 * inject_p + 0.15 * leak_p + 0.20 * min(risk_score / 3.0, 1.0)
        )
        score = 100.0 * min(1.0, model_part)
        if dangers:
            score = max(score, 40.0 + 5.0 * len(dangers))

    if block:
        verdict, verdict_zh = "block", "拦截：请先修复再提交"
    elif review or score >= 40:
        verdict, verdict_zh = "review", "需人工复核"
        if not reasons:
            reasons.append("综合风险分偏高，建议人工看一眼")
    else:
        verdict, verdict_zh = "allow", "放行"
        reasons.append("未发现明显密钥；模型风险分不高")
        if not secrets and not dangers:
            reasons.append("无正则硬命中")

    return {
        "ok": True,
        "source": change.source,
        "empty": False,
        "truncated": change.truncated,
        "files": change.files,
        "file_count": len(change.files),
        "secret_hits": [
            {"kind": h.kind, "file": h.file, "line_no": h.line_no, "snippet": h.snippet}
            for h in secrets
        ],
        "danger_hits": [
            {"kind": h.kind, "file": h.file, "line_no": h.line_no, "snippet": h.snippet}
            for h in dangers
        ],
        "verdict": verdict,
        "verdict_zh": verdict_zh,
        "score": round(score, 1),
        "risk_level": risk_score,
        "secret_p": secret_p,
        "injection_p": inject_p,
        "leak_p": leak_p,
        "block_p": block_p,
        "reasons": reasons,
        "answers": answers,
        "routing": res.get("routing"),
        "latency_ms": res.get("latency_ms"),
        "display": PRECHECK_DISPLAY,
    }
