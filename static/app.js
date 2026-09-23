/* Laya System 1 决策台 — 前端（界面文案中文） */

const $ = (id) => document.getElementById(id);

const state = {
  scenarios: [],
  current: null,
  sampleId: null,
  gate: 0.85,
  lastResults: null,
};

const MODEL_LABEL = {
  english: "英文模型 · ModernBERT",
  multilingual: "多语言模型 · mmBERT",
  "typed-decisions": "专用决策模型",
  unknown: "未知",
};

const TYPE_ZH = {
  choice: "选择",
  score: "打分",
  noul: "是非",
};

function flash() {
  const el = $("flash");
  el.hidden = false;
  el.innerHTML = "<span>一次前向 · 全部出结果</span>";
  setTimeout(() => {
    el.hidden = true;
  }, 900);
}

function setStatus(kind, text) {
  const dot = $("statusDot");
  dot.className = `dot ${kind}`;
  $("statusText").textContent = text;
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function isRiskNoul(qid) {
  return [
    "jailbreak",
    "prompt_injection",
    "sensitive_data",
    "toxic",
    "harassment",
    "threat",
    "spam",
    "churn_risk",
  ].includes(qid);
}

function isRiskScore(qid) {
  return ["harm_severity", "severity"].includes(qid);
}

/**
 * 风险概率 → 拦截/放行；置信度 → 机器定/人工定。
 * 一句话给出动作，避免「拦截」和「自动执行」互相打架。
 */
function gateLabel(qid, ans, gate) {
  const conf = ans.confidence ?? 0;
  const auto = conf >= gate;
  const confNote = auto
    ? `置信 ${conf.toFixed(3)}，免人工`
    : `置信 ${conf.toFixed(3)} 不足，需人工确认`;

  if (ans.type === "noul" && isRiskNoul(qid)) {
    const p = ans.noul ?? 0;
    const risky = p >= 0.5;
    if (risky && auto) {
      return `<span class="human">动作：拦截</span> · 风险高 P=${p.toFixed(3)} · ${confNote}`;
    }
    if (risky && !auto) {
      return `<span class="human">动作：待人工拦截</span> · 风险高 P=${p.toFixed(3)} · ${confNote}`;
    }
    if (!risky && auto) {
      return `<span class="auto">动作：放行</span> · 风险低 P=${p.toFixed(3)} · ${confNote}`;
    }
    return `<span class="human">动作：待人工放行</span> · 风险低 P=${p.toFixed(3)} · ${confNote}`;
  }

  if (ans.type === "score" && isRiskScore(qid)) {
    const s = ans.score ?? 0;
    const risky = s >= 1.5;
    if (risky && auto) {
      return `<span class="human">动作：拦截</span> · 危害等级 ${s.toFixed(2)} · ${confNote}`;
    }
    if (risky && !auto) {
      return `<span class="human">动作：待人工拦截</span> · 危害等级 ${s.toFixed(2)} · ${confNote}`;
    }
    if (!risky && auto) {
      return `<span class="auto">动作：放行</span> · 危害等级 ${s.toFixed(2)} · ${confNote}`;
    }
    return `<span class="human">动作：待人工放行</span> · 危害等级 ${s.toFixed(2)} · ${confNote}`;
  }

  if (ans.type === "choice") {
    const label = optLabel(qid, ans.choice || "");
    return auto
      ? `<span class="auto">动作：按「${label}」处理</span> · ${confNote}`
      : `<span class="human">动作：人工定标（拟「${label}」）</span> · ${confNote}`;
  }

  return auto
    ? `<span class="auto">动作：按结论处理</span> · ${confNote}`
    : `<span class="human">动作：人工复核</span> · ${confNote}`;
}

function barFillClass(p, isTop) {
  if (isTop && p >= 0.7) return "bar-fill top";
  if (p >= 0.35) return "bar-fill mid";
  return "bar-fill low";
}

function qMeta(qid) {
  const q = (state.current?.questions || {})[qid] || {};
  return {
    title: q.title_zh || qid,
    ins: q.instructions_zh || q.instructions || "",
    optionsZh: q.options_zh || {},
    levelsZh: q.levels_zh || {},
  };
}

function optLabel(qid, key) {
  const zh = qMeta(qid).optionsZh[key];
  return zh ? `${zh} · ${key}` : key;
}

function levelLabel(qid, key, fallback) {
  const zh = qMeta(qid).levelsZh[key];
  return zh ? `${zh}` : fallback || key;
}

function ansTitle(qid) {
  return qMeta(qid).title;
}

function renderChoice(qid, ans, gate) {
  const entries = Object.entries(ans.probabilities || {}).sort((a, b) => b[1] - a[1]);
  const top = ans.choice;
  const bars = entries
    .map(([k, v]) => {
      const width = Math.max(2, Math.round(v * 100));
      return `
        <div class="bar-row">
          <div class="bar-label"><span>${optLabel(qid, k)}</span><span>${pct(v)}</span></div>
          <div class="bar-track"><div class="${barFillClass(v, k === top)}" data-w="${width}" style="width:0"></div></div>
        </div>`;
    })
    .join("");
  return `
    <header>
      <h3>${ansTitle(qid)} <span class="q-type choice">${TYPE_ZH.choice}</span></h3>
      <span class="conf">置信 <strong>${(ans.confidence ?? 0).toFixed(3)}</strong></span>
    </header>
    <div class="pred">${optLabel(qid, top)}</div>
    <div class="bars">${bars}</div>
    <div class="gate">${gateLabel(qid, ans, gate)}</div>
  `;
}

function renderScore(qid, ans, gate) {
  const legend = ans.legend || {};
  const entries = Object.entries(ans.probabilities || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  const bars = entries
    .map(([k, v]) => {
      const width = Math.max(2, Math.round(v * 100));
      const label = levelLabel(qid, k, legend[k] ? `${k} ${legend[k]}` : k);
      return `
        <div class="bar-row">
          <div class="bar-label"><span>${label}</span><span>${pct(v)}</span></div>
          <div class="bar-track"><div class="bar-fill mid" data-w="${width}" style="width:0"></div></div>
        </div>`;
    })
    .join("");
  return `
    <header>
      <h3>${ansTitle(qid)} <span class="q-type score">${TYPE_ZH.score}</span></h3>
      <span class="conf">置信 <strong>${(ans.confidence ?? 0).toFixed(3)}</strong></span>
    </header>
    <div class="pred"><span class="num">${(ans.score ?? 0).toFixed(2)}</span> <span style="font-size:13px;color:var(--muted)">期望等级</span></div>
    <div class="bars">${bars}</div>
    <div class="gate">${gateLabel(qid, ans, gate)}</div>
  `;
}

function renderNoul(qid, ans, gate) {
  const p = ans.noul ?? 0;
  const needle = Math.max(0, Math.min(100, p * 100));
  const risk = p >= 0.5;
  return `
    <header>
      <h3>${ansTitle(qid)} <span class="q-type noul">${TYPE_ZH.noul}</span></h3>
      <span class="conf">置信 <strong>${(ans.confidence ?? 0).toFixed(3)}</strong></span>
    </header>
    <div class="pred" style="color:${risk ? "var(--risk)" : "var(--accent)"}">
      是的概率 P = <span class="num">${p.toFixed(3)}</span>
    </div>
    <div class="noul-meter">
      <div class="noul-needle" style="left:calc(${needle}% - 1.5px)"></div>
    </div>
    <div class="noul-ends"><span>否 0.0</span><span>是 1.0</span></div>
    <div class="gate">${gateLabel(qid, ans, gate)}</div>
  `;
}

function renderAnswer(key, ans, gate) {
  const el = document.createElement("article");
  el.className = "answer-card";
  if (ans.type === "choice") el.innerHTML = renderChoice(key, ans, gate);
  else if (ans.type === "score") el.innerHTML = renderScore(key, ans, gate);
  else el.innerHTML = renderNoul(key, ans, gate);
  return el;
}

function animateBars(root) {
  requestAnimationFrame(() => {
    root.querySelectorAll(".bar-fill[data-w]").forEach((el, i) => {
      setTimeout(() => {
        el.style.width = `${el.dataset.w}%`;
      }, 40 * i);
    });
  });
}

function zhReason(reason) {
  if (!reason) return "—";
  if (reason === "English Latin text") return "英文拉丁字母 → 用英文模型";
  if (reason.startsWith("non-Latin script")) {
    return "非拉丁文（英文模型读不了）→ 用多语言模型";
  }
  if (reason.startsWith("Latin script but language looks like")) {
    return "拉丁字母但不是英语 → 用多语言模型";
  }
  if (reason.startsWith("Latin script, language not identified")) {
    return "拉丁字母但语种不明 → 稳妥用多语言模型";
  }
  return reason;
}

function routingBadges(routing, latencyMs) {
  const model = routing?.model || "unknown";
  const cls = `model-${model}`;
  return `
    <div class="result-hero">
      <span class="badge ${cls}">选用模型：${MODEL_LABEL[model] || model}</span>
      <span class="badge latency">${latencyMs != null ? `耗时 ${latencyMs} 毫秒（CPU）` : "—"}</span>
      <span class="badge pass">不生成长文 · 只出结构化结论</span>
    </div>
    <div class="route-reason">选模型原因：${zhReason(routing?.reason)}</div>
  `;
}

function renderSingleResult(res) {
  const body = $("resultBody");
  const gate = state.gate;
  const answers = res.answers || {};
  const grid = document.createElement("div");
  grid.className = "answer-grid";
  for (const [k, ans] of Object.entries(answers)) {
    grid.appendChild(renderAnswer(k, ans, gate));
  }
  body.innerHTML = routingBadges(res.routing, res.latency_ms);
  body.appendChild(grid);
  $("resultMeta").textContent = `输入约 ${res.usage?.input_tokens ?? "?"} 词元 · 一次前向`;
  animateBars(body);
  state.lastResults = res;
}

function renderBatchResults(res) {
  const body = $("resultBody");
  const gate = state.gate;
  body.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "compare-grid";

  for (const item of res.results || []) {
    const card = document.createElement("div");
    card.className = "compare-card";
    card.innerHTML = `
      <div class="lang-label">${item.sample_label || item.sample_id || "样例"} · ${item.latency_ms} 毫秒</div>
      <div class="text-preview">${escapeHtml(item.text || "")}</div>
      ${routingBadges(item.routing, item.latency_ms)}
    `;
    const grid = document.createElement("div");
    grid.className = "answer-grid";
    const entries = Object.entries(item.answers || {}).slice(0, 3);
    for (const [k, ans] of entries) {
      grid.appendChild(renderAnswer(k, ans, gate));
    }
    card.appendChild(grid);
    wrap.appendChild(card);
  }
  body.appendChild(wrap);
  $("resultMeta").textContent = `${(res.results || []).length} 条样例 · 真模型`;
  animateBars(body);
  state.lastResults = res;
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPrecheck(rep) {
  const body = $("precheckBody");
  if (rep.empty) {
    body.innerHTML = `<div class="empty">${escapeHtml(rep.verdict_zh || "没有改动")}</div>`;
    $("precheckMeta").textContent = "无改动";
    return;
  }
  const v = rep.verdict;
  const badge =
    v === "block"
      ? `<span class="badge hold" style="background:var(--risk-soft);border-color:#fecaca;color:var(--risk)">拦截</span>`
      : v === "review"
        ? `<span class="badge hold">需人工复核</span>`
        : `<span class="badge pass">放行</span>`;
  const hits = (rep.secret_hits || [])
    .map(
      (h) =>
        `<div class="bar-row"><div class="bar-label"><span>[${escapeHtml(h.kind)}] ${escapeHtml(h.file)}:${h.line_no}</span></div><div class="bar-track" style="height:auto;background:transparent"><code style="font-size:11px;color:var(--muted)">${escapeHtml(h.snippet)}</code></div></div>`
    )
    .join("");
  body.innerHTML = `
    <div class="result-hero">
      ${badge}
      <span class="badge latency">风险分 <strong style="margin-left:6px">${rep.score}</strong> / 100</span>
      <span class="badge">项目：${escapeHtml(rep.repo || "")}</span>
      <span class="badge">来源：${escapeHtml(rep.source || "")} · ${rep.file_count || 0} 个文件</span>
      ${rep.latency_ms != null ? `<span class="badge latency">Laya ${rep.latency_ms} ms</span>` : ""}
    </div>
    <div class="route-reason">${escapeHtml(rep.verdict_zh || "")}</div>
    <div class="answer-grid">
      <article class="answer-card">
        <header><h3>模型评分</h3></header>
        <div class="bars">
          <div class="bar-row"><div class="bar-label"><span>硬编码密钥 P</span><span>${(rep.secret_p ?? 0).toFixed(3)}</span></div><div class="bar-track"><div class="bar-fill ${rep.secret_p >= 0.5 ? "risk" : "top"}" data-w="${Math.round((rep.secret_p || 0) * 100)}" style="width:0"></div></div></div>
          <div class="bar-row"><div class="bar-label"><span>注入/危险执行 P</span><span>${(rep.injection_p ?? 0).toFixed(3)}</span></div><div class="bar-track"><div class="bar-fill ${rep.injection_p >= 0.5 ? "risk" : "mid"}" data-w="${Math.round((rep.injection_p || 0) * 100)}" style="width:0"></div></div></div>
          <div class="bar-row"><div class="bar-label"><span>敏感泄漏 P</span><span>${(rep.leak_p ?? 0).toFixed(3)}</span></div><div class="bar-track"><div class="bar-fill ${rep.leak_p >= 0.5 ? "risk" : "low"}" data-w="${Math.round((rep.leak_p || 0) * 100)}" style="width:0"></div></div></div>
          <div class="bar-row"><div class="bar-label"><span>风险等级分</span><span>${(rep.risk_level ?? 0).toFixed(2)}</span></div><div class="bar-track"><div class="bar-fill warn" data-w="${Math.min(100, Math.round((rep.risk_level || 0) / 3 * 100))}" style="width:0"></div></div></div>
        </div>
      </article>
      <article class="answer-card">
        <header><h3>结论依据</h3></header>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--muted);">
          ${(rep.reasons || []).map((r) => `<li style="margin:4px 0">${escapeHtml(r)}</li>`).join("")}
        </ul>
        ${hits ? `<div style="margin-top:10px;font-family:var(--mono);font-size:11px;">正则命中密钥：</div>${hits}` : ""}
        ${(rep.danger_hits || []).length ? `<div style="margin-top:10px;font-family:var(--mono);font-size:11px;">危险写法：</div>${(rep.danger_hits || []).map((h) => `<div class="bar-row"><div class="bar-label"><span>[${escapeHtml(h.kind)}] ${escapeHtml(h.file)}:${h.line_no}</span></div></div>`).join("")}` : ""}
      </article>
    </div>
    <div class="route-reason" style="margin-top:10px">扫描文件：${escapeHtml((rep.files || []).slice(0, 12).join("、") || "—")} · 正则全文 · 模型 ${rep.chunks_scanned || 1}/${rep.chunks_total || 1} 段（取最高风险）</div>
  `;
  $("precheckMeta").textContent = rep.verdict_zh || "";
  animateBars(body);
}

function currentRepoPath() {
  return ($("repoPath").value || "").trim();
}

async function runPrecheck() {
  const repo = currentRepoPath();
  if (!repo) {
    alert("请先填写要检查的 git 仓库路径");
    return;
  }
  $("btnPrecheck").disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => {
    $("precheckMeta").textContent = `扫描中… ${Math.round((Date.now() - t0) / 1000)}s`;
  }, 1000);
  try {
    const res = await api(
      "/api/precheck",
      { mode: $("precheckMode").value || "auto", repo_path: repo },
      180000
    );
    renderPrecheck(res);
  } catch (e) {
    $("precheckBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    $("precheckMeta").textContent = "预检失败";
  } finally {
    clearInterval(tick);
    $("btnPrecheck").disabled = false;
  }
}

function renderQuestions(scn) {
  const list = $("questionList");
  list.innerHTML = "";
  const qs = scn.questions || {};
  $("qCount").textContent = `${Object.keys(qs).length} 个问题`;
  for (const [id, q] of Object.entries(qs)) {
    const card = document.createElement("div");
    card.className = "q-card";
    let crit = "";
    if (q.type === "choice" && q.criteria) {
      const keys = Array.isArray(q.criteria) ? q.criteria : Object.keys(q.criteria);
      crit = `<div class="q-crit">${keys
        .map((k) => {
          const zh = (q.options_zh || {})[k];
          return `<span>${zh ? zh + " · " : ""}${escapeHtml(String(k))}</span>`;
        })
        .join("")}</div>`;
    } else if (q.type === "score" && Array.isArray(q.criteria)) {
      crit = `<div class="q-crit">${q.criteria
        .map((k, i) => {
          const zh = (q.levels_zh || {})[String(i)];
          return `<span>${zh || `${i} ${escapeHtml(String(k))}`}</span>`;
        })
        .join("")}</div>`;
    }
    const typeZh = TYPE_ZH[q.type] || q.type;
    card.innerHTML = `
      <header>
        <div class="q-id">${escapeHtml(q.title_zh || id)}</div>
        <span class="q-type ${q.type}">${typeZh}</span>
      </header>
      <div class="q-ins">${escapeHtml(q.instructions_zh || q.instructions || "")}</div>
      ${crit}
    `;
    list.appendChild(card);
  }
}

function renderSamples(scn) {
  const list = $("sampleList");
  list.innerHTML = "";
  for (const s of scn.samples || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (state.sampleId === s.id ? " active" : "");
    b.textContent = s.label;
    b.addEventListener("click", () => {
      state.sampleId = s.id;
      $("stateText").value = s.text;
      renderSamples(scn);
    });
    list.appendChild(b);
  }
}

function renderScenarios() {
  const list = $("scenarioList");
  list.innerHTML = "";
  for (const s of state.scenarios) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scenario-btn" + (state.current?.id === s.id ? " active" : "");
    b.innerHTML = `
      <div class="t">${s.title}</div>
      <div class="s">${s.subtitle}</div>
      <div class="tag-row">
        ${(s.primitive_tags || []).map((t) => `<span class="tag">${t}</span>`).join("")}
      </div>
    `;
    b.addEventListener("click", () => selectScenario(s.id));
    list.appendChild(b);
  }
}

function selectScenario(id) {
  const scn = state.scenarios.find((s) => s.id === id);
  if (!scn) return;
  state.current = scn;
  state.sampleId = scn.samples?.[0]?.id || null;
  $("scnTitle").textContent = scn.title;
  $("scnDesc").textContent = scn.description;

  const isPrecheck = scn.mode === "git_precheck" || scn.id === "git-precheck";
  $("inputPanel").hidden = isPrecheck;
  $("precheckPanel").hidden = !isPrecheck;
  $("questionPanel").hidden = false;
  $("resultPanel").hidden = isPrecheck; // 预检结果画在 precheckBody
  if (isPrecheck) {
    $("stateKey").textContent = scn.state_label || "";
    renderScenarios();
    renderQuestions(scn);
    $("precheckBody").innerHTML =
      '<div class="empty">在上方填写要检查的 <b>git 仓库路径</b>（不会枚举本机其它项目），再点「提交前自检」。</div>';
    $("precheckMeta").textContent = "填路径即可";
    return;
  }

  $("resultPanel").hidden = false;
  $("stateKey").textContent = scn.state_label || "";
  const first = scn.samples?.[0];
  $("stateText").value = first?.text || "";
  renderScenarios();
  renderSamples(scn);
  renderQuestions(scn);
  $("resultBody").innerHTML =
    '<div class="empty">点上方样例或自己输入文本，再点「开始判定」。<br />概率全部来自本机 Laya 真模型，不是演示假数据。</div>';
  $("resultMeta").textContent = "等待判定";
}

async function api(path, body, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || res.statusText || "请求失败");
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`等待超时（${Math.round(timeoutMs / 1000)} 秒）。首次预热模型约 1–2 分钟属正常；若反复失败请看服务端日志。`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function warmup() {
  setStatus("busy", "预热模型（CPU，约 1–2 分钟，请稍候）…");
  try {
    await api("/api/warmup", {}, 240000);
    setStatus("ok", "真模型已就绪（CPU）");
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("fetch_models") || msg.includes("未找到模型")) {
      setStatus("err", "请先下载模型：python -m app.fetch_models");
    } else {
      setStatus("err", `加载失败：${msg}`);
    }
  }
}

async function runPredict() {
  if (!state.current) return;
  const text = $("stateText").value.trim();
  if (!text) {
    alert("请先输入要判断的文本");
    return;
  }
  $("btnRun").disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => {
    setStatus("busy", `推理中… 已等待 ${Math.round((Date.now() - t0) / 1000)} 秒`);
  }, 1000);
  setStatus("busy", "一次前向推理中…");
  flash();
  try {
    const body = {
      scenario_id: state.current.id,
      text,
      model: $("modelSelect").value || null,
    };
    const res = await api("/api/predict", body, 90000);
    renderSingleResult(res);
    setStatus("ok", `完成 · ${res.latency_ms} 毫秒 · ${MODEL_LABEL[res.routing?.model] || res.routing?.model || ""}`);
  } catch (e) {
    $("resultBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    setStatus("err", "推理失败");
  } finally {
    clearInterval(tick);
    $("btnRun").disabled = false;
  }
}

async function runBatch() {
  if (!state.current) return;
  $("btnBatch").disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => {
    setStatus("busy", `批量推理中… 已等待 ${Math.round((Date.now() - t0) / 1000)} 秒`);
  }, 1000);
  flash();
  try {
    const res = await api("/api/predict", {
      scenario_id: state.current.id,
      text: "batch",
      model: $("modelSelect").value || null,
      run_all_samples: true,
    }, 180000);
    renderBatchResults(res);
    setStatus("ok", `完成 ${res.results?.length || 0} 条样例`);
  } catch (e) {
    $("resultBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    setStatus("err", "批量失败");
  } finally {
    clearInterval(tick);
    $("btnBatch").disabled = false;
  }
}

async function runRouteOnly() {
  if (!state.current) return;
  const text = $("stateText").value.trim();
  if (!text) {
    alert("请先输入要判断的文本");
    return;
  }
  setStatus("busy", "识别语言与文字…");
  try {
    const res = await api("/api/route", {
      scenario_id: state.current.id,
      text,
      model: $("modelSelect").value || null,
    });
    $("resultBody").innerHTML = `
      ${routingBadges(res.routing, null)}
      <div class="empty">这只演示「如何选模型」，还没有做判定。<br />识别详情：<code>${escapeHtml(JSON.stringify(res.routing?.detection || {}))}</code></div>
    `;
    $("resultMeta").textContent = "仅选模型";
    setStatus("ok", `将使用：${MODEL_LABEL[res.routing?.model] || res.routing?.model}`);
  } catch (e) {
    $("resultBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    setStatus("err", "选模型失败");
  }
}

function bind() {
  $("btnRun").addEventListener("click", runPredict);
  $("btnBatch").addEventListener("click", runBatch);
  $("btnRoute").addEventListener("click", runRouteOnly);
  $("btnPrecheck").addEventListener("click", runPrecheck);
  $("gateRange").addEventListener("input", (e) => {
    state.gate = Number(e.target.value);
    $("gateVal").textContent = state.gate.toFixed(2);
    $("railGate").textContent = state.gate.toFixed(2);
    if (state.lastResults) {
      if (state.lastResults.results) renderBatchResults(state.lastResults);
      else renderSingleResult(state.lastResults);
    }
  });
}

async function boot() {
  bind();
  try {
    const data = await api("/api/scenarios");
    state.scenarios = data.scenarios || [];
    renderScenarios();
    if (state.scenarios[0]) selectScenario(state.scenarios[0].id);
  } catch (e) {
    setStatus("err", `无法加载场景：${e.message}`);
    return;
  }
  warmup();
}

boot();
