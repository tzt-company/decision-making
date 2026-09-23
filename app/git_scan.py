"""Collect git code changes for pre-commit security precheck."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# 模型单次输入有上限；长 diff 会分段送入，而不是只看开头
CHUNK_CHARS = 6000
MAX_MODEL_CHUNKS = 8  # 最多 8 段，约 48KB，CPU 延迟可控
MAX_FILES = 40

SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("AWS Access Key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("GitHub Token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("OpenAI/Slack style key", re.compile(r"\b(sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b")),
    ("Private Key Block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("Hardcoded password", re.compile(r"(?i)(password|passwd|pwd|secret|api[_-]?key|token)\s*[=:]\s*['\"][^'\"]{8,}['\"]")),
    ("JWT", re.compile(r"ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("DB URL with password", re.compile(r"(?i)(postgres|mysql|mongodb|redis)://[^:\s]+:[^@\s]{4,}@")),
]

# 危险调用写法（需人工看上下文，单独不直接定罪）
DANGER_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("eval/exec", re.compile(r"\b(eval|exec)\s*\(")),
    ("os.system/commands", re.compile(r"\b(os\.system|os\.popen|subprocess\.(call|run|Popen))\s*\(")),
    ("shell=true", re.compile(r"shell\s*=\s*True", re.I)),
    ("SQL string format", re.compile(r"(?i)(execute|raw)\s*\(\s*[f]?['\"].*%s|\.format\(.*\).*execute|f['\"].*SELECT .*{")),
    ("pickle.loads", re.compile(r"\bpickle\.loads\s*\(")),
    ("innerHTML assign", re.compile(r"\.innerHTML\s*=")),
]

# 这些扩展名/路径优先扫
CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs", ".rb", ".php",
    ".cs", ".cpp", ".c", ".h", ".scala", ".kt", ".swift", ".sh", ".env", ".yml",
    ".yaml", ".json", ".toml", ".ini", ".cfg", ".conf", ".sql", ".xml", ".properties",
}


@dataclass
class ChangeSet:
    source: str  # staged | working | commit
    files: list[str] = field(default_factory=list)
    diff: str = ""          # 给模型用（可能截断）
    full_diff: str = ""     # 给正则密钥扫描用（不截断）
    truncated: bool = False
    empty: bool = False
    repo: str = ""


@dataclass
class SecretHit:
    kind: str
    file: str
    line_no: int
    snippet: str


def _run_git(args: list[str], cwd: Path | None = None) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=str(cwd or PROJECT_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )
    return res.stdout if res.returncode == 0 else ""


def _resolve_repo(repo_path: str | Path | None) -> Path:
    """定位要检查的 git 仓库；默认当前 Demo 仓库。"""
    if not repo_path:
        return PROJECT_ROOT
    p = Path(str(repo_path)).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"路径不存在：{p}")
    if (p / ".git").exists():
        return p
    # 允许传仓库下的子目录
    cur = p
    for _ in range(6):
        if (cur / ".git").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    raise FileNotFoundError(f"不是 git 仓库：{p}")


def list_repos(roots: list[str | Path] | None = None) -> list[dict[str, str]]:
    """列出 git 仓库，便于界面上选择。默认只看本应用上级目录，不写死本机盘符。"""
    if roots is None:
        # 可移植默认：当前仓库 + 其父目录（通常是你 clone 到的工作区）
        candidates = [PROJECT_ROOT, PROJECT_ROOT.parent]
    else:
        candidates = [Path(str(r)).expanduser() for r in roots]
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for root in candidates:
        if not root.exists():
            continue
        try:
            if (root / ".git").exists():
                key = str(root.resolve())
                if key not in seen:
                    seen.add(key)
                    out.append({"path": key, "name": root.name})
            # 只扫一层子目录，避免全盘遍历
            for child in sorted(root.iterdir())[:50]:
                if child.is_dir() and (child / ".git").exists():
                    key = str(child.resolve())
                    if key not in seen:
                        seen.add(key)
                        out.append({"path": key, "name": child.name})
        except OSError:
            continue
    return out


def collect_changes(mode: str = "auto", repo_path: str | Path | None = None) -> ChangeSet:
    """mode: auto | staged | working | last-commit"""
    root = _resolve_repo(repo_path)
    if mode == "auto":
        staged = _run_git(["diff", "--cached", "--name-only"], cwd=root)
        working = _run_git(["diff", "--name-only"], cwd=root)
        unstaged_untracked = _run_git(["ls-files", "--others", "--exclude-standard"], cwd=root)
        if staged.strip():
            mode = "staged"
        elif working.strip() or unstaged_untracked.strip():
            mode = "working"
        else:
            mode = "last-commit"

    if mode == "staged":
        diff = _run_git(["diff", "--cached", "--unified=3"], cwd=root)
        names = _run_git(["diff", "--cached", "--name-only"], cwd=root)
        source = "staged"
    elif mode == "working":
        diff = _run_git(["diff", "--unified=3"], cwd=root)
        names = _run_git(["diff", "--name-only"], cwd=root)
        untracked = _run_git(["ls-files", "--others", "--exclude-standard"], cwd=root).splitlines()
        untracked_chunks: list[str] = []
        for rel in untracked:
            p = root / rel
            if not p.is_file() or p.stat().st_size >= 200_000:
                continue
            if p.suffix.lower() not in CODE_EXTS and p.name not in {".env", "credentials", "secrets"}:
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            untracked_chunks.append(
                f"\n+++ b/{rel}\n" + "".join(f"+{line}\n" for line in text.splitlines()[:300])
            )
            names += rel + "\n"
        diff = "".join(untracked_chunks) + diff
        source = "working"
    else:
        diff = _run_git(["show", "HEAD", "--unified=3", "--format=commit %H%n%s%n"], cwd=root)
        names = _run_git(["show", "HEAD", "--name-only", "--format="], cwd=root)
        source = "last-commit"

    files = [ln.strip() for ln in names.splitlines() if ln.strip()]
    files = files[:MAX_FILES]
    full_diff = diff
    # 给「单段」消费者保留截断副本；预检主路径会分段扫 full_diff
    truncated = False
    model_diff = diff
    if len(diff) > CHUNK_CHARS:
        model_diff = diff[:CHUNK_CHARS]
        truncated = True

    cs = ChangeSet(
        source=source,
        files=files,
        diff=model_diff,
        full_diff=full_diff,
        truncated=truncated,
        empty=not full_diff.strip() and not files,
    )
    cs.repo = str(root)  # type: ignore[attr-defined]
    return cs


def split_diff_chunks(full_diff: str, chunk_chars: int = CHUNK_CHARS) -> list[str]:
    """按文件边界优先切段，保证模型尽量扫完全文。"""
    if not full_diff:
        return []
    if len(full_diff) <= chunk_chars:
        return [full_diff]
    parts: list[str] = []
    current: list[str] = []
    size = 0
    for block in full_diff.splitlines(keepends=True):
        if size + len(block) > chunk_chars and current:
            parts.append("".join(current))
            current = []
            size = 0
        current.append(block)
        size += len(block)
    if current:
        parts.append("".join(current))
    # 合并过碎的小段
    merged: list[str] = []
    buf = ""
    for p in parts:
        if buf and len(buf) + len(p) <= chunk_chars:
            buf += p
        else:
            if buf:
                merged.append(buf)
            buf = p
    if buf:
        merged.append(buf)
    return merged


def find_secrets(diff: str, files: list[str]) -> list[SecretHit]:
    """正则高置信密钥检测（比纯模型更稳，作为硬拦截依据）。"""
    hits: list[SecretHit] = []
    current_file = ""
    for i, line in enumerate(diff.splitlines(), 1):
        if line.startswith("+++ b/"):
            current_file = line[6:].strip()
        if line.startswith("-") and not line.startswith("---"):
            continue  # 删除行不判泄漏
        for kind, pat in SECRET_PATTERNS:
            m = pat.search(line)
            if m:
                snippet = line.strip()
                if len(snippet) > 160:
                    snippet = snippet[:160] + "…"
                # 打码，报告里不落真实密钥
                snippet = pat.sub(lambda x: x.group(0)[:4] + "••••", snippet)
                hits.append(SecretHit(kind=kind, file=current_file or (files[0] if files else "?"), line_no=i, snippet=snippet))
                break
    return hits


def find_danger(diff: str) -> list[SecretHit]:
    hits: list[SecretHit] = []
    current_file = ""
    for i, line in enumerate(diff.splitlines(), 1):
        if line.startswith("+++ b/"):
            current_file = line[6:].strip()
        if line.startswith("-") and not line.startswith("---"):
            continue
        for kind, pat in DANGER_PATTERNS:
            if pat.search(line):
                snippet = line.strip()[:160]
                hits.append(SecretHit(kind=kind, file=current_file or "?", line_no=i, snippet=snippet))
                break
    return hits


def build_scan_state(change: ChangeSet, secrets: list[SecretHit]) -> dict[str, Any]:
    """组装给 Laya 的 state：diff 摘要 + 正则命中。"""
    secret_note = "none"
    if secrets:
        secret_note = "; ".join(sorted({h.kind for h in secrets}))
    return {
        "change_source": change.source,
        "files": ", ".join(change.files[:20]) or "(none)",
        "regex_secret_hits": secret_note,
        "diff": change.diff[:8000],
    }


PRECHECK_QUESTIONS: dict[str, Any] = {
    "hardcoded_secret": {
        "type": "noul",
        "instructions": "Does this code/diff contain hardcoded credentials, API keys, passwords, tokens, or private keys?",
    },
    "injection_risk": {
        "type": "noul",
        "instructions": "Does this code show SQL injection, OS command injection, path traversal, or unsafe eval/exec patterns?",
    },
    "sensitive_leak": {
        "type": "noul",
        "instructions": "Does this code leak personal data, internal hostnames, private URLs, or infrastructure secrets?",
    },
    "risk_level": {
        "type": "score",
        "instructions": "How severe is the security risk in this code change?",
        "criteria": [
            "none: routine safe change",
            "low: minor hygiene issue",
            "high: likely secret, injection, or leak",
            "critical: definite credential leak or dangerous sink",
        ],
    },
    "should_block": {
        "type": "noul",
        "instructions": "Should a security precheck block this commit from being merged?",
    },
}

PRECHECK_DISPLAY = {
    "hardcoded_secret": {"title": "硬编码密钥/凭证", "instructions": "是否写死了密钥、口令、令牌或私钥？"},
    "injection_risk": {"title": "注入/危险执行", "instructions": "是否有 SQL 注入、命令注入、路径穿越或 eval/exec 危险写法？"},
    "sensitive_leak": {"title": "敏感信息泄漏", "instructions": "是否泄漏个人数据、内网地址、私有 URL 或基础设施信息？"},
    "risk_level": {
        "title": "风险等级",
        "instructions": "这次改动的安全风险有多严重？",
        "levels": {
            "0": "无：常规安全改动",
            "1": "低：轻微卫生问题",
            "2": "高：疑似密钥/注入/泄漏",
            "3": "严重：明确凭证泄漏或危险调用",
        },
    },
    "should_block": {"title": "是否应拦截", "instructions": "安全预检是否应拦下这次提交？"},
}
