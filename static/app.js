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

function gateLabel(conf, gate) {
  return conf >= gate
    ? `<span class="auto">自动处理</span> · 置信度 ${conf.toFixed(3)} ≥ ${gate.toFixed(2)}，可放行`
    : `<span class="human">转人工</span> · 置信度 ${conf.toFixed(3)} &lt; ${gate.toFixed(2)}，不够稳`;
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
    <div class="gate">${gateLabel(ans.confidence ?? 0, gate)}</div>
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
    <div class="gate">${gateLabel(ans.confidence ?? 0, gate)}</div>
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
    <div class="gate">${gateLabel(ans.confidence ?? 0, gate)}</div>
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

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || res.statusText || "请求失败");
  }
  return data;
}

async function warmup() {
  setStatus("busy", "正在加载模型（CPU，约 1–3 分钟）…");
  try {
    await api("/api/warmup", {});
    setStatus("ok", "真模型已就绪（CPU）");
  } catch (e) {
    setStatus("err", `加载失败：${e.message}`);
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
  setStatus("busy", "一次前向推理中…");
  flash();
  try {
    const body = {
      scenario_id: state.current.id,
      text,
      model: $("modelSelect").value || null,
    };
    const res = await api("/api/predict", body);
    renderSingleResult(res);
    setStatus("ok", `完成 · ${res.latency_ms} 毫秒 · ${MODEL_LABEL[res.routing?.model] || res.routing?.model || ""}`);
  } catch (e) {
    $("resultBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    setStatus("err", "推理失败");
  } finally {
    $("btnRun").disabled = false;
  }
}

async function runBatch() {
  if (!state.current) return;
  $("btnBatch").disabled = true;
  setStatus("busy", "批量跑样例中…");
  flash();
  try {
    const res = await api("/api/predict", {
      scenario_id: state.current.id,
      text: "batch",
      model: $("modelSelect").value || null,
      run_all_samples: true,
    });
    renderBatchResults(res);
    setStatus("ok", `完成 ${res.results?.length || 0} 条样例`);
  } catch (e) {
    $("resultBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    setStatus("err", "批量失败");
  } finally {
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
