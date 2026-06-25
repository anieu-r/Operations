/* AusWise Migration — front-end controller (vanilla JS, no build step). */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(path, opts) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

function toast(message, kind = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = `toast ${kind}`), 3800);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtFee = (n) => (typeof n === 'number' ? `A$${n.toLocaleString('en-AU')}` : '—');

/* ============================================================ state */
const state = { visas: [], filtered: [], loc: '', cat: '', q: '' };

/* ============================================================ init */
document.addEventListener('DOMContentLoaded', () => {
  $('#year').textContent = new Date().getFullYear();
  initNav();
  loadStats();
  loadVisas();
  initFinder();
  initSOP();
  initVEVO();
  loadNews();
  loadPayments();
  initForms();
  initModal();
});

/* ============================================================ nav */
function initNav() {
  const toggle = $('.nav-toggle');
  const links = $('.nav-links');
  toggle?.addEventListener('click', () => links.classList.toggle('open'));
  $$('.nav-links a').forEach((a) => a.addEventListener('click', () => links.classList.remove('open')));
}

async function loadStats() {
  const { data } = await api('/stats');
  if (data?.visaCount) $('#statVisas').textContent = data.visaCount;
}

/* ============================================================ visa catalog */
async function loadVisas() {
  const [{ data: vData }, { data: cData }] = await Promise.all([api('/visas'), api('/categories')]);
  state.visas = vData.visas || [];
  renderCatChips(cData.categories || []);
  applyFilters();
  populateVisaSelect();

  $('#visaSearch').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    applyFilters();
  });
  $$('#locFilter button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#locFilter button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.loc = b.dataset.loc;
      applyFilters();
    })
  );
}

function renderCatChips(categories) {
  const wrap = $('#catFilter');
  wrap.innerHTML =
    `<button class="chip active" data-cat="">All categories</button>` +
    categories.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $$('#catFilter .chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      $$('#catFilter .chip').forEach((x) => x.classList.remove('active'));
      chip.classList.add('active');
      state.cat = chip.dataset.cat;
      applyFilters();
    })
  );
}

function applyFilters() {
  state.filtered = state.visas.filter((v) => {
    if (state.loc && !v.location.includes(state.loc)) return false;
    if (state.cat && v.category !== state.cat) return false;
    if (state.q) {
      const hay = [v.code, v.name, v.summary, v.whoFor, v.category, ...(v.tags || [])].join(' ').toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  });
  renderVisaGrid();
}

function renderVisaGrid() {
  const grid = $('#visaGrid');
  const empty = $('#visaEmpty');
  empty.hidden = state.filtered.length > 0;
  grid.innerHTML = state.filtered
    .map((v) => {
      const locTags = v.location
        .map((l) => `<span class="tag loc">${l === 'onshore' ? 'Onshore' : 'Offshore'}</span>`)
        .join('');
      return `<article class="visa-card" data-code="${esc(v.code)}" tabindex="0" role="button">
        <div class="vc-top">
          <span class="vc-code">Subclass ${esc(v.code)}</span>
          ${v.popular ? '<span class="vc-pop">★ Popular</span>' : ''}
        </div>
        <div class="vc-name">${esc(v.name)}</div>
        <div class="vc-summary">${esc(v.summary)}</div>
        <div class="vc-meta">${locTags}<span class="tag type">${esc(v.type)}</span></div>
        <div class="vc-foot">
          <span class="vc-fee">${fmtFee(v.indicativeFee)} <small>indic.</small></span>
          <span class="vc-link">View guide →</span>
        </div>
      </article>`;
    })
    .join('');
  $$('.visa-card', grid).forEach((card) => {
    const open = () => openVisaModal(card.dataset.code);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function populateVisaSelect() {
  const sel = $('#applyVisa');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">Not sure yet</option>' +
    state.visas.map((v) => `<option value="${esc(v.code)}">${esc(v.name)} (${esc(v.code)})</option>`).join('');
}

/* ============================================================ modal */
function initModal() {
  const modal = $('#visaModal');
  $$('[data-close]', modal).forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}
function closeModal() {
  $('#visaModal').hidden = true;
  document.body.style.overflow = '';
}
async function openVisaModal(code) {
  const { data } = await api(`/visas/${encodeURIComponent(code)}`);
  const v = data.visa;
  if (!v) return toast('Could not load that visa.', 'err');
  const list = (arr) => (arr || []).map((i) => `<li>${esc(i)}</li>`).join('');
  $('#modalBody').innerHTML = `
    <span class="vc-code">Subclass ${esc(v.code)}</span>
    <h3>${esc(v.name)}</h3>
    <p class="m-sub">${esc(v.whoFor)}</p>
    <div class="m-badges">
      ${v.location.map((l) => `<span class="tag loc">${l === 'onshore' ? 'Onshore' : 'Offshore'}</span>`).join('')}
      <span class="tag type">${esc(v.type)}</span>
      <span class="tag">${esc(v.category)}</span>
      ${v.pointsTested ? '<span class="tag">Points-tested</span>' : ''}
    </div>
    <div class="m-grid">
      <div class="m-stat"><span>Indicative charge</span><b>${fmtFee(v.indicativeFee)}</b></div>
      <div class="m-stat"><span>Duration</span><b>${esc(v.duration)}</b></div>
      <div class="m-stat"><span>Processing</span><b>${esc(v.processingTime)}</b></div>
    </div>
    <div class="m-section"><h4>✅ Key requirements</h4><ul class="m-list">${list(v.requirements)}</ul></div>
    <div class="m-section"><h4>🪜 How to apply</h4><ol class="m-steps">${list(v.steps)}</ol></div>
    <div class="m-section"><h4>📎 Documents you’ll likely need</h4><ul class="m-list">${list(v.documents)}</ul></div>
    <div class="m-section"><p><b>Work rights:</b> ${esc(v.workRights)}</p></div>
    <p class="m-note">⚠️ Fees and rules change (often on 1 July). Always confirm the current charge and criteria on the official Home Affairs page before lodging.</p>
    <div class="m-cta">
      <a class="btn btn-primary" href="${esc(v.officialUrl)}" target="_blank" rel="noopener">View on Home Affairs ↗</a>
      <a class="btn btn-ghost" href="#apply" data-close>Enquire about this visa</a>
    </div>`;
  $$('[data-close]', $('#modalBody')).forEach((el) => el.addEventListener('click', closeModal));
  $('#visaModal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('.modal-card').scrollTop = 0;
}

/* ============================================================ visa finder */
const finder = { questions: [], step: 0, answers: {} };
async function initFinder() {
  const { data } = await api('/eligibility/questions');
  finder.questions = data.questions || [];
  renderFinderStep();
}
function renderFinderStep() {
  const body = $('#finderBody');
  const total = finder.questions.length;
  const bar = $('#finderBar');
  if (finder.step >= total) return; // results handled separately
  bar.style.width = `${(finder.step / total) * 100}%`;
  const q = finder.questions[finder.step];
  body.innerHTML = `
    <div class="q-label">${esc(q.label)}</div>
    <div class="q-options">
      ${q.options.map((o) => `<button class="q-opt" data-val="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
    </div>
    <div class="finder-nav">
      ${finder.step > 0 ? '<button class="finder-back">← Back</button>' : '<span></span>'}
      <span class="muted">Step ${finder.step + 1} of ${total}</span>
    </div>`;
  $$('.q-opt', body).forEach((btn) =>
    btn.addEventListener('click', () => {
      finder.answers[q.id] = btn.dataset.val;
      finder.step++;
      if (finder.step >= total) submitFinder();
      else renderFinderStep();
    })
  );
  $('.finder-back', body)?.addEventListener('click', () => {
    finder.step = Math.max(0, finder.step - 1);
    renderFinderStep();
  });
}
async function submitFinder() {
  $('#finderBar').style.width = '100%';
  $('#finderBody').innerHTML = '<div class="q-label">Finding your best matches…</div>';
  const { ok, data } = await api('/eligibility', { method: 'POST', body: JSON.stringify({ answers: finder.answers }) });
  if (!ok) {
    $('#finderBody').innerHTML = '<p class="center muted">Sorry, something went wrong. Please try again.</p>';
    return;
  }
  const recs = data.recommendations || [];
  $('#finderBody').innerHTML = `
    <div class="q-label">🎉 Your top matches</div>
    <div class="rec-list">
      ${
        recs.length
          ? recs
              .map(
                (r, i) => `<div class="rec">
        <div class="rec-rank">${i + 1}</div>
        <div>
          <h4>${esc(r.name)} <span class="muted">(${esc(r.code)})</span></h4>
          <div class="muted">${esc(r.summary)}</div>
          ${r.why?.length ? `<div class="why">Why: ${esc(r.why.join(' · '))}</div>` : ''}
          <div class="rec-actions">
            <button class="btn btn-ghost rec-open" data-code="${esc(r.code)}">See full guide</button>
            <a class="btn btn-primary" href="#apply">Enquire</a>
          </div>
        </div>
      </div>`
              )
              .join('')
          : '<p class="center muted">No strong match — browse all visas below or contact us.</p>'
      }
    </div>
    <p class="fineprint" style="margin-top:1rem">${esc(data.disclaimer || '')}</p>
    <div class="finder-nav"><button class="finder-back" id="finderRestart">↻ Start over</button><span></span></div>`;
  $$('.rec-open').forEach((b) => b.addEventListener('click', () => openVisaModal(b.dataset.code)));
  $('#finderRestart').addEventListener('click', () => {
    finder.step = 0;
    finder.answers = {};
    renderFinderStep();
  });
}

/* ============================================================ SOP builder */
function initSOP() {
  const form = $('#sopForm');
  const purpose = $('#sopPurpose');
  const sync = () => {
    const val = purpose.value;
    $$('.sop-f', form).forEach((f) => {
      const show = (f.dataset.show || '').split(' ').includes(val);
      f.classList.toggle('show', show);
    });
  };
  purpose.addEventListener('change', sync);
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    btn.textContent = 'Generating…';
    const { ok, data } = await api('/sop', { method: 'POST', body: JSON.stringify(payload) });
    btn.disabled = false;
    btn.textContent = '✨ Generate my SOP draft';
    if (!ok) return toast(data.error || 'Could not generate SOP.', 'err');
    renderSOP(data, payload.fullName);
    toast('SOP draft ready!', 'ok');
    $('#sopOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}
function renderSOP(data, name) {
  const out = $('#sopOutput');
  out.innerHTML = `
    <div class="sop-result">
      <h3>Your SOP draft ${data.reference ? `<span class="muted">· ${esc(data.reference)}</span>` : ''}</h3>
      <p class="fineprint">Target length: ${esc(data.wordCountTarget)}. Edit it to sound like you — and keep every claim true.</p>
      <div class="sop-draft" id="sopDraft">${esc(data.draft)}</div>
      <div class="result-actions">
        <button class="btn btn-ghost" id="copySop">📋 Copy</button>
        <button class="btn btn-primary" id="downloadSop">⬇️ Download .txt</button>
      </div>
      <div class="m-section"><h4>💡 Tips for a strong SOP</h4><ul class="sop-tips">${(data.tips || [])
        .map((t) => `<li>${esc(t)}</li>`)
        .join('')}</ul></div>
      <div class="m-section"><h4>📋 Checklist</h4><ul class="m-list">${(data.checklist || [])
        .map((c) => `<li>${esc(c)}</li>`)
        .join('')}</ul></div>
    </div>`;
  $('#copySop').addEventListener('click', () => {
    navigator.clipboard?.writeText(data.draft).then(
      () => toast('Copied to clipboard', 'ok'),
      () => toast('Copy failed — select manually', 'err')
    );
  });
  $('#downloadSop').addEventListener('click', () => {
    const blob = new Blob([data.draft], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SOP-${(name || 'draft').replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

/* ============================================================ VEVO */
async function initVEVO() {
  const { data } = await api('/vevo/info');
  const modeEl = $('#vevoMode');
  const sel = $('#vevoCategory');
  if (sel) {
    sel.innerHTML = (data.categories || [])
      .map((c) => `<option value="${esc(c)}"${c === 'WORK_ENTITLEMENTS' ? ' selected' : ''}>${esc(label(c))}</option>`)
      .join('');
  }
  if (modeEl) {
    const live = data.mode === 'live';
    modeEl.className = `vevo-mode ${live ? 'live' : ''}`;
    modeEl.innerHTML = `${live ? '🟢 Live VEVO connected' : '🟡 Demo mode'} — ${esc(data.notice || '')}`;
  }
  const form = $('#vevoForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    fd.travelDocumentIssuingCountry = (fd.travelDocumentIssuingCountry || '').toUpperCase();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const { ok, data: res } = await api('/vevo/check', { method: 'POST', body: JSON.stringify({ data: fd }) });
    btn.disabled = false;
    btn.textContent = '🔍 Run entitlement check';
    if (!ok) {
      const msg = res.errors?.[0]?.detail || res.error || 'Check failed.';
      toast(msg, 'err');
      renderVevoErrors(res.errors);
      return;
    }
    renderVevo(res);
  });

  function label(c) {
    return c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
  }
}
function renderVevoErrors(errors) {
  if (!errors?.length) return;
  $('#vevoOutput').innerHTML = `<div class="m-section"><h4>Please fix:</h4><ul class="m-list">${errors
    .map((e) => `<li>${esc(e.detail)}</li>`)
    .join('')}</ul></div>`;
}
function renderVevo(res) {
  const d = res.data || {};
  const out = $('#vevoOutput');
  const item = (label, val) => (val ? `<div class="ent-item"><span>${esc(label)}</span><b>${esc(val)}</b></div>` : '');
  const conds = (title, list) =>
    list && list.length
      ? `<div class="m-section"><h4>${esc(title)}</h4>${list
          .map((c) => `<div class="cond"><b>Condition ${esc(c.conditionCode)}</b><p>${esc(c.conditionDescription)}</p></div>`)
          .join('')}</div>`
      : '';
  out.innerHTML = `
    ${res.mode === 'demo' ? `<div class="demo-banner">⚠️ ${esc(res.notice || 'Simulated result — not live government data.')}</div>` : ''}
    <div class="ent-card">
      <div class="ent-head">
        <span class="ent-name">${esc(d.givenName ? d.givenName + ' ' : '')}${esc(d.familyName || '')}</span>
        ${d.visaStatus ? `<span class="ent-status">${esc(d.visaStatus.replace(/_/g, ' '))}</span>` : ''}
      </div>
      <div class="ent-grid">
        ${item('Visa', d.visaType ? `${d.visaType} (${d.visaSubclass || d.visaClass || ''})` : d.visaClass)}
        ${item('Applicant role', d.applicantRole)}
        ${item('Currently onshore', d.visaHolderIsOnshore == null ? '' : d.visaHolderIsOnshore ? 'Yes' : 'No')}
        ${item('Work entitlement', d.workEntitlement && d.workEntitlement.replace(/_/g, ' '))}
        ${item('Grant date', d.grantDate)}
        ${item('Visa expiry', d.visaExpiryDate)}
        ${item('Must enter before', d.enterBeforeDate)}
        ${item('Medicare', d.medicareEligibilityStatus && d.medicareEligibilityStatus.replace(/_/g, ' '))}
        ${item('Residence', d.residenceStatus)}
        ${item('Education sector', d.educationSector && d.educationSector.replace(/_/g, ' '))}
      </div>
      ${conds('💼 Work conditions', d.workConditions)}
      ${conds('🎓 Study conditions', d.studyConditions)}
      <p class="fineprint">Category checked: ${esc((res.requestedCategory || '').replace(/_/g, ' '))} · ${esc(res.checkedAt || '')}</p>
    </div>`;
}

/* ============================================================ news */
async function loadNews() {
  const { data } = await api('/news');
  $('#newsGrid').innerHTML = (data.news || [])
    .map(
      (n) => `<article class="news-card">
      <div class="news-top">
        <span class="news-cat">${esc(n.category)}</span>
        <span class="news-date">${esc(formatDate(n.date))}</span>
      </div>
      <span class="impact ${esc(n.impact)}">${esc(n.impact)} impact</span>
      <h4>${esc(n.title)}</h4>
      <p>${esc(n.summary)}</p>
      <div class="news-affects">${(n.affects || []).map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
      <a class="vc-link" href="${esc(n.source.url)}" target="_blank" rel="noopener">${esc(n.source.label)} ↗</a>
    </article>`
    )
    .join('');
  const ls = $('#liveSources');
  ls.innerHTML =
    '<b>Always check the source for the latest:</b>' +
    (data.liveSources || [])
      .map((s) => `<a class="btn btn-ghost" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`)
      .join('');
}
function formatDate(s) {
  try {
    return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

/* ============================================================ payments */
async function loadPayments() {
  const { data } = await api('/payments');
  $('#payGrid').innerHTML = (data.officialBodies || [])
    .map(
      (b) => `<div class="pay-card ${b.primary ? 'primary' : ''}">
      <h4>${esc(b.name)}</h4>
      <p class="pay-role">${esc(b.role)}</p>
      ${b.methods?.length ? `<div class="pay-methods">${b.methods.map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</div>` : ''}
      <p class="pay-note">${esc(b.note)}</p>
      <a class="btn ${b.primary ? 'btn-primary' : 'btn-ghost'}" href="${esc(b.url)}" target="_blank" rel="noopener">Go to official page ↗</a>
    </div>`
    )
    .join('');
  $('#safetyTips').innerHTML = (data.safetyTips || []).map((t) => `<li>${esc(t)}</li>`).join('');
  $('#omaraLink').href = data.omaraRegisterUrl || '#';
}

/* ============================================================ forms */
function initForms() {
  bindForm('#applyForm', '/applications', '🚀 Send my enquiry', (data) =>
    `Thanks! Reference ${data.reference}. ${data.message}`
  );
  bindForm('#contactForm', '/contact', 'Send message', (data) => `Sent! Ref ${data.reference}. We’ll reply by email.`);
}
function bindForm(sel, endpoint, resetLabel, successMsg) {
  const form = $(sel);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const btn = $('button[type=submit]', form);
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const { ok, data } = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    btn.disabled = false;
    btn.textContent = orig || resetLabel;
    if (!ok) return toast(data.error || 'Something went wrong.', 'err');
    toast(successMsg(data), 'ok');
    form.reset();
  });
}
