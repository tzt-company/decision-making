# Laya System 1 决策台

多语言、非自回归 System 1 决策模型 **Laya** 的本地 Demo：真模型 CPU 推理，无演示假数据。

## 功能

| 场景 | 原语 | 说明 |
|------|------|------|
| 客服工单分诊 | choice + score + noul | 归属 / 紧急度 / 退款 / 流失 |
| 内容安全审核 | noul + score | 毒性 / 骚扰 / 威胁 / 垃圾 |
| Prompt 注入防护 | noul + score + choice | 越狱 / 注入 / 敏感信息 |
| 多语言路由对照 | choice + noul | 同问题跨语言看 Router |
| 提交安全预检 | 自动读 git | 密钥正则硬拦 + Laya 风险分 |

一次前向同时回答全部类型化问题，并展示校准概率、置信度门控（AUTO / HUMAN）与语言路由理由。

## 快速开始（开源克隆后）

**前置条件：先下载 Laya 模型（约 1.5GB，不进 git）**

```bash
# 1. Python 3.10+
pip install -r requirements.txt

# 2. 下载权重到 models/hub/（只需一次）
python -m app.fetch_models

# 3. 启动
python -m app.server
# 打开 http://127.0.0.1:8766
```

国内网络脚本默认走 `https://hf-mirror.com`；若失败可：

```bash
set HF_ENDPOINT=https://huggingface.co
python -m app.fetch_models
```

命令行预检 / pre-commit 钩子：

```bash
python -m app.precheck_cli --mode auto --repo /path/to/your/repo
# 可选：cp scripts/pre-commit .git/hooks/pre-commit
```

CPU 预热约 1–2 分钟；单次推理约 1.5–3 s。权重在**项目内** `models/hub/`，已在 `.gitignore` 中，不会提交到 GitHub。

## 技术

- 推理：[Laya](https://github.com/NandhaKishorM/laya) `Router`（非自回归双向编码器，choice / score / noul）
- 后端：FastAPI（`app/server.py`）
- 前端：`static/`（无构建步骤）

## 结构

```
app/
  fetch_models.py  # 一键下载权重（开源用户必跑）
  scenarios.py   # 场景样例 + 类型化问题（官方 presets）
  engine.py      # 真 Router 封装（CPU）
  server.py      # HTTP API + 静态资源
models/
  hub/           # Laya 权重（本地，不进 git）
static/
  index.html
  styles.css
  app.js
```
