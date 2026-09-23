# Laya System 1 决策台

基于 **[Laya](https://github.com/NandhaKishorM/laya)**（多语言、非自回归 System 1 决策模型）的本地演示台：

- **真模型 CPU 推理**，无演示假数据
- 一次前向同时回答多个类型化问题（选择 / 打分 / 是非）
- 展示校准概率、动作建议（拦截 / 放行 / 人工）与多语言路由
- **Git 提交预检**：自动读指定仓库的 diff，查密钥泄漏与高危写法并评分

适合用来理解「System 1 快速结构化决策」能覆盖哪些工作流，以及如何接到自己的提交流程里。

---

## 功能场景

| 场景 | 输出 | 说明 |
|------|------|------|
| 客服工单分诊 | choice + score + noul | 归属部门、紧急度、退款诉求、流失风险 |
| 内容安全审核 | noul + score | 毒性、骚扰、威胁、垃圾广告、违规严重度 |
| 提示词注入防护 | noul + score + choice | 越狱、指令注入、敏感信息、危害等级、主题 |
| 多语言路由对照 | choice + noul | 中/英/印地/阿拉伯文，观察 Router 选模型 |
| Git 提交预检 | 自动读 git | 密钥正则硬拦 + Laya 风险分 + 动作建议 |

---

## 环境要求

| 项 | 要求 |
|----|------|
| Python | **3.10+** |
| 内存 | 建议 **4GB+**（加载约 2–3GB） |
| 磁盘 | 模型约 **1.5GB**（`models/hub/`） |
| 设备 | **CPU 即可**（无需 GPU） |
| 网络 | 仅首次下载模型需要 |

---

## 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 下载 Laya 权重到 models/hub/（只需一次，约 1.5GB）
python -m app.fetch_models

# 3. 启动服务
python -m app.server
# 浏览器打开 http://127.0.0.1:8766
```

**国内网络**：`fetch_models` 默认走 `https://hf-mirror.com`。若失败：

```bash
# Windows
set HF_ENDPOINT=https://huggingface.co
python -m app.fetch_models

# macOS / Linux
export HF_ENDPOINT=https://huggingface.co
python -m app.fetch_models
```

模型**不会**提交到 GitHub（已在 `.gitignore`），请勿把 `models/` 推上远程。

---

## 使用说明

### 1. 文本决策场景（前四个）

1. 左侧选场景  
2. 点样例，或自己粘贴文本  
3. 点 **「开始判定」**  
4. 看结构化结果：概率条、动作建议、选用模型  

可选：调「自动决策阈值」、强制指定英文/多语言模型。

### 2. Git 提交预检

1. 左侧进入 **「Git 提交预检」**  
2. 填写 **git 仓库路径**（本机任意项目绝对路径）  
3. 选检查范围（暂存区 / 工作区 / 自动 / 最近一次提交）  
4. 点 **「提交前自检」**  

结果含义：

| 指标 | 含义 |
|------|------|
| 正则命中密钥 | AWS Key、GitHub Token、私钥、明文口令、JWT、带密码数据库 URL → **硬拦截** |
| 危险写法 | `eval/exec`、`shell=True`、SQL 拼接等 → 提示人工看上下文 |
| 模型评分 | 硬编码密钥 / 注入 / 泄漏概率 + 风险等级 |
| 覆盖率 | 正则扫**全文**；模型**分段**扫并取最高风险 |

命令行等价：

```bash
python -m app.precheck_cli --mode auto --repo /path/to/your/repo
python -m app.precheck_cli --mode staged --repo /path/to/your/repo --json
```

可选挂到 git 钩子：

```bash
cp scripts/pre-commit .git/hooks/pre-commit
# Windows 上可用 Git Bash，或把脚本逻辑接到 husky / pre-commit 框架
```

### 3. 门控怎么读（容易混的两点）

| 维度 | 管什么 | 例子 |
|------|--------|------|
| **风险概率 P** | **拦还是放** | 越狱 P=0.95 → 建议拦截 |
| **置信度** | **机器自动办还是转人工** | 置信 ≥ 阈值 → 免人工 |

组合后的动作文案：

- `动作：拦截` — 风险高且有把握  
- `动作：待人工拦截` — 风险高但把握不足  
- `动作：放行` — 风险低且有把握  
- `动作：待人工放行` — 风险低但把握不足  

---

## 技术说明

| 层 | 实现 |
|----|------|
| 决策模型 | [Laya](https://github.com/NandhaKishorM/laya) `Router`（ModernBERT / mmBERT 双向编码器） |
| 输出原语 | `choice`（选择）/ `score`（打分）/ `noul`（是非概率） |
| 语言路由 | 按 Unicode 脚本与语种自动选英文 / 多语言 checkpoint |
| 后端 | FastAPI（`app/server.py`） |
| 前端 | `static/` 原生 HTML/CSS/JS，无构建 |
| 权重位置 | 项目内 `models/hub/`（`HF_HUB_CACHE`） |

---

## 目录结构

```
app/
  fetch_models.py   # 一键下载权重（克隆后必跑）
  scenarios.py      # 场景样例与类型化问题
  git_scan.py       # 读 git diff、密钥/危险写法正则
  precheck.py       # 提交预检评分与动作结论
  precheck_cli.py   # 命令行入口
  engine.py         # Laya Router 封装（CPU、离线优先）
  server.py         # HTTP API + 静态页
models/
  hub/              # 模型权重（本地，不进 git）
static/
  index.html
  styles.css
  app.js
scripts/
  pre-commit        # 可选 git 钩子示例
```

---

## 能力边界（请先读）

这不是商业级 SAST，也不是生成式大模型：

1. **密钥类**：正则规则明确，可靠度高；不认识的自定义加密串可能漏。  
2. **注入 / 泄漏**：Laya 是文本级 System 1 快筛，**不能替代** Semgrep、CodeQL 等语法树分析。  
3. **底座未做代码安全微调**时，安全相关文案可能抬高分数；预检对「无正则命中」的情况更保守，避免乱拦。  
4. **长 diff**：正则全文；模型最多分段扫约 8 段（约 48KB），其余段不进模型（结果里会标注覆盖率）。  
5. **CPU 延迟**：预热 1–2 分钟，单次约 1.5–3 秒；与 GPU 上的 33ms 不是同一量级。  
6. Laya 官方说明：基础模型需按业务微调后，概率与准确率才更适合生产门控。

---

## 常见问题

**下载模型很慢 / 失败？**  
换 `HF_ENDPOINT`（见上），或检查代理。权重约 1.5GB，请预留磁盘。

**提示「未找到模型权重」？**  
先执行 `python -m app.fetch_models`，确认 `models/hub/` 下有 `*.safetensors`。

**页面一直「预热模型」？**  
CPU 加载约 1–2 分钟属正常；前端预热超时已设 4 分钟。仍失败请看终端 `server.err.log`。

**端口 8766 被占用？**  
改 `app/server.py` 里 `uvicorn.run(..., port=8766)`，或结束占用进程。

**预检扫不到我的项目？**  
请填 **git 仓库根路径**（含 `.git` 的目录）；子目录路径会向上查找 `.git`。

**可以把模型放进仓库吗？**  
不建议。GitHub 有大小限制，且权重应与代码分离；请用 `fetch_models`。

---

## 配置与隐私

- 模型与扫描均在**本机**完成，默认**不上传**任何代码到外部（下载模型时仅访问 Hugging Face / 镜像）。  
- 预检报告里的密钥片段会做打码。  
- 勿把真实密钥提交进 git；本工具是辅助闸门，不是密钥保险箱。

---

## 许可与致谢

- 本 Demo 代码可按仓库根目录 `LICENSE`（若未添加则保留 All rights reserved，可自行补充）使用。  
- 模型与算法来自 **[Convai Innovations / Laya](https://github.com/NandhaKishorM/laya)**（Apache-2.0），请遵守其许可证与使用条款。  
- 感谢 Laya、FastAPI、Hugging Face 生态。
