# Laya System 1 决策台

多语言、非自回归 System 1 决策模型 **Laya** 的本地 Demo：真模型 CPU 推理，无演示假数据。

## 功能

| 场景 | 原语 | 说明 |
|------|------|------|
| 客服工单分诊 | choice + score + noul | 归属 / 紧急度 / 退款 / 流失 |
| 内容安全审核 | noul + score | 毒性 / 骚扰 / 威胁 / 垃圾 |
| Prompt 注入防护 | noul + score + choice | 越狱 / 注入 / 敏感信息 |
| 多语言路由对照 | choice + noul | 同问题跨语言看 Router |

一次前向同时回答全部类型化问题，并展示校准概率、置信度门控（AUTO / HUMAN）与语言路由理由。

## 运行

```bash
# Python 3.10+
pip install -r requirements.txt

# 国内网络可先设置镜像（server/smoke 内也有默认值）
# $env:HF_ENDPOINT='https://hf-mirror.com'
# $env:HF_HUB_DISABLE_XET='1'

# 启动（默认 http://127.0.0.1:8766）
python -m app.server
```

首次启动会从 Hugging Face 下载权重（英文 + 多语言 checkpoint，约 1.5 GB），CPU 预加载约 1–3 分钟、内存约 2–3 GB。单次推理在笔记本 CPU 上约 1.5–3 s（预热后）；官方 T4 预加载标称约 33–464 ms。

## 技术

- 推理：[Laya](https://github.com/NandhaKishorM/laya) `Router`（非自回归双向编码器，choice / score / noul）
- 后端：FastAPI（`app/server.py`）
- 前端：`static/`（无构建步骤）

## 结构

```
app/
  scenarios.py   # 4 场景样例 + 类型化问题（官方 presets）
  engine.py      # 真 Router 封装（CPU）
  server.py      # HTTP API + 静态资源
static/
  index.html
  styles.css
  app.js
```
