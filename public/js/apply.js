/* AusWise — per-visa application questionnaire wizard.
   Autosaves to localStorage so applicants can leave and resume. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts) {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}
function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = `toast ${kind}`), 3800);
}

const state = { visaCode: '', questionnaire: null, step: 0, answers: {} };
const saveKey = () => `auswise-apply-${state.visaCode}`;

document.addEventListener('DOMContentLoaded', async () => {
  $('#year').textContent = new Date().getFullYear();
  $('.nav-toggle')?.addEventListener('click', () => $('.nav-links').classList.toggle('open'));

  const { data } = await api('/visas');
  const visas = data.visas || [];
  const sel = $('#visaSelect');
  sel.innerHTML =
    '<option value="">Choose a visa…</option>' +
    visas.map((v) => `<option value="${esc(v.code)}">${esc(v.name)} (subclass ${esc(v.code)})</option>`).join('');
  sel.addEventListener('change', () => ($('#startBtn').disabled = !sel.value));
  $('#startBtn').addEventListener('click', () => start(sel.value));

  // deep-link: /apply.html?visa=500
  const pre = new URLSearchParams(location.search).get('visa');
  if (pre && visas.some((v) => v.code === pre)) {
    sel.value = pre;
    $('#startBtn').disabled = false;
    start(pre);
  }
});

async function start(visaCode) {
  const { ok, data } = await api(`/questionnaires/${encodeURIComponent(visaCode)}`);
  if (!ok) return toast('Could not load the questionnaire.', 'err');
  state.visaCode = visaCode;
  state.questionnaire = data.questionnaire;
  state.step = 0;
  try {
    state.answers = JSON.parse(localStorage.getItem(saveKey()) || '{}');
  } catch {
    state.answers = {};
  }
  $('#pickVisa').hidden = true;
  $('#wizard').hidden = false;
  if (Object.keys(state.answers).length) toast('Welcome back — your earlier answers were restored.', 'ok');
  renderStep();
}

function visibleFields(section) {
  return section.fields.filter((f) => !f.showIf || showIfMet(f.showIf));
}
function showIfMet(cond) {
  if (cond.anyYes) return cond.anyYes.some((id) => state.answers[id] === 'Yes');
  return Object.entries(cond).every(([k, v]) => state.answers[k] === v);
}

function fieldHtml(f) {
  const v = state.answers[f.id] ?? '';
  const req = f.required ? ' *' : '';
  const help = f.help ? `<span class="fineprint">${esc(f.help)}</span>` : '';
  if (f.type === 'select') {
    return `<label>${esc(f.label)}${req}<select data-f="${esc(f.id)}"><option value="">Choose…</option>${f.options
      .map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`)
      .join('')}</select>${help}</label>`;
  }
  if (f.type === 'textarea')
    return `<label>${esc(f.label)}${req}<textarea data-f="${esc(f.id)}" rows="3">${esc(v)}</textarea>${help}</label>`;
  if (f.type === 'boolean')
    return `<label style="display:flex;gap:.6rem;align-items:flex-start"><input type="checkbox" data-f="${esc(f.id)}" style="width:auto;margin-top:.3rem" ${v === true || v === 'true' ? 'checked' : ''}/> <span>${esc(f.label)}${req}</span></label>`;
  const type = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
  return `<label>${esc(f.label)}${req}<input type="${type}" data-f="${esc(f.id)}" value="${esc(v)}" />${help}</label>`;
}

function renderStep() {
  const q = state.questionnaire;
  const total = q.sections.length;
  $('#wizBar').style.width = `${(state.step / total) * 100}%`;
  const section = q.sections[state.step];
  $('#wizBody').innerHTML = `
    <p class="muted">${esc(q.visaName)} (subclass ${esc(q.visaCode)}) · about ${q.estimatedMinutes} minutes total</p>
    ${state.step === 0 ? `<div class="honest-box"><b>Before you start:</b> ${esc(q.intro)}</div>` : ''}
    <div class="wiz-section-title">${esc(section.icon)} ${esc(section.title)}</div>
    <form id="wizForm">${visibleFields(section).map(fieldHtml).join('')}</form>
    <div class="wiz-nav">
      ${state.step > 0 ? '<button class="btn btn-ghost" id="wizBack">← Back</button>' : '<span></span>'}
      <span class="wiz-count">Section ${state.step + 1} of ${total}</span>
      <button class="btn btn-primary" id="wizNext">${state.step === total - 1 ? '✅ Submit questionnaire' : 'Next →'}</button>
    </div>`;

  // live capture + conditional re-render
  $$('#wizForm [data-f]').forEach((el) => {
    el.addEventListener('input', () => capture(el));
    el.addEventListener('change', () => {
      capture(el);
      const section = state.questionnaire.sections[state.step];
      if (section.fields.some((f) => f.showIf)) renderStep();
    });
  });
  $('#wizBack')?.addEventListener('click', () => {
    state.step--;
    renderStep();
    scrollTop();
  });
  $('#wizNext').addEventListener('click', next);
}

function capture(el) {
  const id = el.dataset.f;
  state.answers[id] = el.type === 'checkbox' ? el.checked : el.value;
  localStorage.setItem(saveKey(), JSON.stringify(state.answers));
}

function next() {
  const q = state.questionnaire;
  const section = q.sections[state.step];
  // validate required visible fields in this section
  let firstBad = null;
  for (const f of visibleFields(section)) {
    if (!f.required) continue;
    const v = state.answers[f.id];
    const empty = v == null || v === '' || (f.type === 'boolean' && v !== true);
    const el = $(`#wizForm [data-f="${f.id}"]`);
    el?.classList.toggle('field-error', empty);
    if (empty && !firstBad) firstBad = el;
  }
  if (firstBad) {
    firstBad.focus();
    return toast('Please complete the highlighted required fields.', 'err');
  }
  if (state.step < q.sections.length - 1) {
    state.step++;
    renderStep();
    scrollTop();
  } else {
    submit();
  }
}

async function submit() {
  $('#wizBar').style.width = '100%';
  $('#wizBody').innerHTML = '<div class="wiz-section-title">Submitting…</div>';
  const { ok, data } = await api('/questionnaires', {
    method: 'POST',
    body: JSON.stringify({ visaCode: state.visaCode, answers: state.answers }),
  });
  if (!ok) {
    toast(data.error || 'Could not submit.', 'err');
    if (data.missing?.length) {
      // jump to first section with a missing answer
      const idx = state.questionnaire.sections.findIndex((s) => s.title === data.missing[0].section);
      state.step = Math.max(0, idx);
    }
    renderStep();
    return;
  }
  localStorage.removeItem(saveKey());
  $('#wizBody').innerHTML = `
    <div class="wiz-done">
      <span class="big-emoji">🎉</span>
      <h2>Questionnaire submitted</h2>
      <p>Your reference: <b>${esc(data.reference)}</b> — save it.</p>
      <div class="honest-box">
        <b>What happens next (and what it costs):</b>
        <ul>
          <li><b>Free:</b> we review your answers and reply by email with honest next steps — including anything that could hurt your application. No sales pitch.</li>
          <li><b>Free:</b> your tailored document checklist and official links for lodging in ImmiAccount.</li>
          <li><b>Optional, paid:</b> an expert SOP review, or a one-on-one session if you want to go deep. Only pay if you want them.</li>
          <li><b>Never:</b> government visa charges through us — those always go directly to Home Affairs.</li>
        </ul>
      </div>
      <div class="result-actions" style="justify-content:center">
        <a class="btn btn-primary" href="/#sop">Build your SOP (free) →</a>
        <a class="btn btn-ghost" href="/agents.html">Find a MARN agent</a>
        <a class="btn btn-ghost" href="/#services">Optional paid extras</a>
      </div>
    </div>`;
  scrollTop();
}

function scrollTop() {
  $('#wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
