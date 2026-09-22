/* Laya System 1 decision playground — front-end */

const $ = (id) => document.getElementById(id);

const state = {
  scenarios: [],
  current: null,
  sampleId: null,
  gate: 0.85,
  lastResults: null,
};

const MODEL_LABEL = {
  english: "english · ModernBERT",
  multilingual: "multilingual · mmBERT",
  "typed-decisions": "typed-decisions",
};

function flash() {
  const el = $("flash");
  el.hidden = false;
  el.innerHTML = "<span>ONE FORWARD PASS</span>";
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

function confClass(conf, gate) {
  return conf >= gate ? "auto" : "human";
}

function gateLabel(conf, gate) {
  return conf >= gate
    ? `<span class="auto">AUTO</span> · 置信度 ${conf.toFixed(3)} ≥ ${gate.toFixed(2)} → 自动放行`
    : `<span class="human">HUMAN</span> · 置信度 ${conf.toFixed(3)} &lt; ${gate.toFixed(2)} → 转人工`;
}

function barFillClass(p, isTop) {
  if (isTop && p >= 0.7) return "bar-fill top";
  if (p >= 0.35) return "bar-fill mid";
  return "bar-fill low";
}

function renderChoice(ans, gate) {
  const entries = Object.entries(ans.probabilities || {}).sort((a, b) => b[1] - a[1]);
  const top = ans.choice;
  const bars = entries
    .map(([k, v], i) => {
      const width = Math.max(2, Math.round(v * 100));
      return `
        <div class="bar-row">
          <div class="bar-label"><span>${k}</span><span>${pct(v)}</span></div>
          <div class="bar-track"><div class="${barFillClass(v, k === top)}" data-w="${width}" style="width:0"></div></div>
        </div>`;
    })
    .join("");
  return `
    <header>
      <h3>${ans._id || "choice"}</h3>
      <span class="conf">conf <strong>${(ans.confidence ?? 0).toFixed(3)}</strong></span>
    </header>
    <div class="pred">${top}</div>
    <div class="bars">${bars}</div>
    <div class="gate">${gateLabel(ans.confidence ?? 0, gate)}</div>
  `;
}

function renderScore(ans, gate) {
  const legend = ans.legend || {};
  const entries = Object.entries(ans.probabilities || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  const bars = entries
    .map(([k, v]) => {
      const width = Math.max(2, Math.round(v * 100));
      const label = legend[k] ? `${k} ${legend[k]}` : k;
      return `
        <div class="bar-row">
          <div class="bar-label"><span>${label}</span><span>${pct(v)}</span></div>
          <div class="bar-track"><div class="bar-fill mid" data-w="${width}" style="width:0"></div></div>
        </div>`;
    })
    .join("");
  return `
    <header>
      <h3>${ans._id || "score"}</h3>
      <span class="conf">conf <strong>${(ans.confidence ?? 0).toFixed(3)}</strong></span>
    </header>
    <div class="pred"><span class="num">${(ans.score ?? 0).toFixed(2)}</span> <span style="font-size:13px;color:var(--muted)">expected level</span></div>
    <div class="bars">${bars}</div>
    <div class="gate">${gateLabel(ans.confidence ?? 0, gate)}</div>
  `;
}

function renderNoul(ans, gate) {
  const p = ans.noul ?? 0;
  const needle = Math.max(0, Math.min(100, p * 100));
  const risk = p >= 0.5;
  return `
    <header>
      <h3>${ans._id || "noul"}</h3>
      <span class="conf">conf <strong>${(ans.confidence ?? 0).toFixed(3)}</strong></span>
    </header>
    <div class="pred" style="color:${risk ? "var(--risk)" : "var(--accent)"}">
      P(true) = <span class="num">${p.toFixed(3)}</span>
    </div>
    <div class="noul-meter">
      <div class="noul-needle" style="left:calc(${needle}% - 1.5px)"></div>
    </div>
    <div class="noul-ends"><span>false 0.0</span><span>true 1.0</span></div>
    <div class="gate">${gateLabel(ans.confidence ?? 0, gate)}</div>
  `;
}

function renderAnswer(key, ans, gate) {
  const el = document.createElement("article");
  el.className = "answer-card";
  const a = { ...ans, _id: key };
  if (ans.type === "choice") el.innerHTML = renderChoice(a, gate);
  else if (ans.type === "score") el.innerHTML = renderScore(a, gate);
  else el.innerHTML = renderNoul(a, gate);
  return el;
}

function animateBars(root) {
  requestAnimationFrame(() => {
    root.querySelectorAll(".bar-fill[data-w]").forEach((el, i) => {
      setTimeout(() => {
        el.style.width = `${el.dataset.w}%`;
      }, 40 * i);
    });
    root.querySelectorAll(".noul-needle").forEach((el) => {
      el.style.transition = "left 0.55s cubic-bezier(0.2, 0.8, 0.2, 1)";
    });
  });
}

function routingBadges(routing, latencyMs) {
  const model = routing?.model || "unknown";
  const cls = `model-${model}`;
  return `
    <div class="result-hero">
      <span class="badge ${cls}">router → ${MODEL_LABEL[model] || model}</span>
      <span class="badge latency">${latencyMs != null ? `CPU ${latencyMs} ms` : "—"}</span>
      <span class="badge pass">output_tokens = 0 · 无文本生成</span>
    </div>
    <div class="route-reason">${routing?.reason || "—"}</div>
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
  $("resultMeta").textContent = `${res.usage?.input_tokens ?? "?"} tokens · 1 forward`;
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
    const model = item.routing?.model || "unknown";
    card.innerHTML = `
      <div class="lang-label">${item.sample_label || item.sample_id || "sample"} · ${item.latency_ms} ms · → ${model}</div>
      <div class="text-preview">${escapeHtml(item.text || "")}</div>
      ${routingBadges(item.routing, item.latency_ms)}
    `;
    const grid = document.createElement("div");
    grid.className = "answer-grid";
    // Show a compact subset for batch: first 3 answers
    const entries = Object.entries(item.answers || {}).slice(0, 3);
    for (const [k, ans] of entries) {
      grid.appendChild(renderAnswer(k, ans, gate));
    }
    card.appendChild(grid);
    wrap.appendChild(card);
  }
  body.appendChild(wrap);
  $("resultMeta").textContent = `${(res.results || []).length} samples · real Laya`;
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
  $("qCount").textContent = `${Object.keys(qs).length} questions`;
  for (const [id, q] of Object.entries(qs)) {
    const card = document.createElement("div");
    card.className = "q-card";
    let crit = "";
    if (q.type === "choice" && q.criteria) {
      const keys = Array.isArray(q.criteria) ? q.criteria : Object.keys(q.criteria);
      crit = `<div class="q-crit">${keys.map((k) => `<span>${escapeHtml(String(k))}</span>`).join("")}</div>`;
    } else if (q.type === "score" && Array.isArray(q.criteria)) {
      crit = `<div class="q-crit">${q.criteria.map((k, i) => `<span>${i} ${escapeHtml(String(k))}</span>`).join("")}</div>`;
    }
    card.innerHTML = `
      <header>
        <div class="q-id">${escapeHtml(id)}</div>
        <span class="q-type ${q.type}">${q.type}</span>
      </header>
      <div class="q-ins">${escapeHtml(q.instructions || "")}</div>
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
        ${(s.primitive_tags || []).map((t) => `<span class="tag ${t}">${t}</span>`).join("")}
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
  $("stateKey").textContent = `${scn.state_key} : str`;
  const first = scn.samples?.[0];
  $("stateText").value = first?.text || "";
  renderScenarios();
  renderSamples(scn);
  renderQuestions(scn);
  $("resultBody").innerHTML =
    '<div class="empty">选择样例或输入文本，点击「单次前向 · 判定」。所有概率来自本机 Laya 真模型，无演示假数据。</div>';
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
    throw new Error(data.detail || res.statusText || "request failed");
  }
  return data;
}

async function warmup() {
  setStatus("busy", "预加载模型中（CPU，约 1–3 分钟）…");
  try {
    await api("/api/warmup", {});
    setStatus("ok", "真模型就绪 · CPU");
  } catch (e) {
    setStatus("err", `加载失败：${e.message}`);
  }
}

async function runPredict() {
  if (!state.current) return;
  const text = $("stateText").value.trim();
  if (!text) {
    alert("请输入状态文本");
    return;
  }
  $("btnRun").disabled = true;
  setStatus("busy", "单次前向推理中…");
  flash();
  try {
    const body = {
      scenario_id: state.current.id,
      text,
      model: $("modelSelect").value || null,
    };
    const res = await api("/api/predict", body);
    renderSingleResult(res);
    setStatus("ok", `完成 · ${res.latency_ms} ms · ${res.routing?.model || ""}`);
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
  setStatus("busy", "批量样例推理中…");
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
    alert("请输入状态文本");
    return;
  }
  setStatus("busy", "检测语言/脚本…");
  try {
    const res = await api("/api/route", {
      scenario_id: state.current.id,
      text,
      model: $("modelSelect").value || null,
    });
    $("resultBody").innerHTML = `
      ${routingBadges(res.routing, null)}
      <div class="empty">仅路由 · 未执行前向。det = <code>${escapeHtml(JSON.stringify(res.routing?.detection || {}))}</code></div>
    `;
    $("resultMeta").textContent = "route only";
    setStatus("ok", `路由 → ${res.routing?.model}`);
  } catch (e) {
    $("resultBody").innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
    setStatus("err", "路由失败");
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
