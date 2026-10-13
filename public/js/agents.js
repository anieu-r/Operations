/* AusWise — agents directory, reviews, and the MARN agent portal. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const token = localStorage.getItem('agentToken');
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...opts,
  });
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

const stars = (rating) => {
  const r = Math.round(rating || 0);
  return `<span class="stars">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`;
};

const state = { agents: [], specialties: [], q: '', specialty: '' };

document.addEventListener('DOMContentLoaded', () => {
  $('#year').textContent = new Date().getFullYear();
  $('.nav-toggle')?.addEventListener('click', () => $('.nav-links').classList.toggle('open'));
  initModal();
  loadDirectory();
  initAuth();
  refreshSession();
});

/* ------------------------------------------------ directory */
async function loadDirectory() {
  const { data } = await api('/agents');
  state.agents = data.agents || [];
  state.specialties = data.specialties || [];
  $('#agentNotice').textContent = data.notice || '';
  $('#omaraBtn').href = data.omaraSearchUrl || 'https://www.mara.gov.au/';
  renderChips();
  renderAgents();
  fillSpecialtySelects();
  $('#agentSearch').addEventListener('input', (e) => {
    state.q = e.target.value.trim().toLowerCase();
    renderAgents();
  });
}

function renderChips() {
  $('#specialtyChips').innerHTML =
    `<button class="chip active" data-s="">All specialties</button>` +
    state.specialties.map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $$('#specialtyChips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('#specialtyChips .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.specialty = c.dataset.s;
      renderAgents();
    })
  );
}

function filtered() {
  return state.agents.filter((a) => {
    if (state.specialty && !a.specialties.includes(state.specialty)) return false;
    if (state.q) {
      const hay = [a.name, a.bio, a.location, a.marn, ...a.specialties, ...a.languages].join(' ').toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  });
}

function renderAgents() {
  const rows = filtered();
  $('#agentEmpty').hidden = rows.length > 0;
  $('#agentGrid').innerHTML = rows
    .map(
      (a) => `<article class="agent-card">
      <div class="agent-top">
        <div>
          <div class="agent-name">${esc(a.name)}</div>
          <div class="agent-marn">MARN ${esc(a.marn)} · <a href="${esc(a.omaraVerifyUrl)}" target="_blank" rel="noopener">verify ↗</a></div>
        </div>
      </div>
      <div>${stars(a.rating)} <b>${a.rating ?? '—'}</b> <span class="muted">(${a.reviewCount} review${a.reviewCount === 1 ? '' : 's'})</span></div>
      <p class="agent-bio">${esc(a.bio)}</p>
      <div class="agent-meta">${a.specialties.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}
        ${a.location ? `<span class="tag loc">${esc(a.location)}</span>` : ''}
        ${a.languages.map((l) => `<span class="tag type">${esc(l)}</span>`).join('')}</div>
      <div class="agent-actions">
        <button class="btn btn-ghost a-open" data-id="${esc(a.agentId)}">Reviews &amp; profile</button>
        <button class="btn btn-primary a-review" data-id="${esc(a.agentId)}">Rate this agent</button>
      </div>
    </article>`
    )
    .join('');
  $$('.a-open').forEach((b) => b.addEventListener('click', () => openAgent(b.dataset.id, false)));
  $$('.a-review').forEach((b) => b.addEventListener('click', () => openAgent(b.dataset.id, true)));
}

/* ------------------------------------------------ agent modal + reviews */
function initModal() {
  $$('#agentModal [data-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());
}
let lastFocus = null;
function closeModal() {
  if ($('#agentModal').hidden) return;
  $('#agentModal').hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

async function openAgent(id, focusReview) {
  const { ok, data } = await api(`/agents/${encodeURIComponent(id)}`);
  if (!ok) return toast('Could not load that agent.', 'err');
  const a = data.agent;
  $('#agentModalBody').innerHTML = `
    <h2 id="agentModalTitle">${esc(a.name)}</h2>
    <p class="m-sub">MARN ${esc(a.marn)} · <a href="${esc(a.omaraVerifyUrl)}" target="_blank" rel="noopener">verify on OMARA ↗</a> ${a.location ? `· ${esc(a.location)}` : ''}</p>
    <div>${stars(a.rating)} <b>${a.rating ?? '—'}</b> <span class="muted">(${a.reviewCount})</span></div>
    <p>${esc(a.bio)}</p>
    <div class="m-badges">${a.specialties.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>

    <div class="m-section">
      <h3>Leave a review</h3>
      <form id="reviewForm">
        <fieldset class="rate-group">
          <legend>Your rating *</legend>
          <div class="rate-input" id="rateInput">${[1, 2, 3, 4, 5]
            .map((n) => `<input type="radio" name="rating" id="r${n}" value="${n}" /><label for="r${n}" data-v="${n}" title="${n} star${n > 1 ? 's' : ''}">★<span class="sr-only">${n} star${n > 1 ? 's' : ''}</span></label>`)
            .join('')}</div>
        </fieldset>
        <div class="grid-2">
          <label>Your name (or leave blank)<input name="name" placeholder="Anonymous" /></label>
        </div>
        <label>Your experience<textarea name="comment" rows="2" placeholder="Honest, specific feedback helps others most"></textarea></label>
        <label class="check"><input type="checkbox" name="genuineClient" /> <span>I was a client of this agent and this review reflects my genuine experience. I have no connection to the agent and was not paid or rewarded for it. *</span></label>
        <button class="btn btn-primary" type="submit">Submit review</button>
        <p class="fineprint">Reviews are public, unverified and shown exactly as submitted — we don’t remove negative reviews, only unlawful content. Don’t include other people’s personal details. Your name is optional.</p>
      </form>
    </div>

    <div class="m-section"><h3>Reviews (${a.reviews.length}, newest first)</h3>
      ${a.reviews.length ? a.reviews.map((r) => `
        <div class="review">
          <div class="r-head"><span>${stars(r.rating)} <b>${esc(r.name)}</b></span>
          <span class="muted">${new Date(r.createdAt).toLocaleDateString('en-AU')}</span></div>
          <p>${esc(r.comment)}</p>
        </div>`).join('') : '<p class="muted">No reviews yet — be the first.</p>'}
    </div>`;

  // star picker: a real radio group, so arrow keys and screen readers work
  $('#rateInput').addEventListener('change', (e) => {
    const v = Number(e.target.value || 0);
    $$('#rateInput label').forEach((l) => l.classList.toggle('on', Number(l.dataset.v) <= v));
  });

  $('#reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    fd.genuineClient = e.target.elements.genuineClient.checked;
    if (!Number(fd.rating)) return toast('Choose a star rating first.', 'err');
    if (!fd.genuineClient) return toast('Please confirm the genuine-client declaration.', 'err');
    const { ok: rOk, data: rData } = await api(`/agents/${encodeURIComponent(id)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(fd),
    });
    if (!rOk) return toast(rData.error || 'Could not submit review.', 'err');
    toast('Review posted — thank you!', 'ok');
    await loadDirectory();
    openAgent(id, false);
  });

  if ($('#agentModal').hidden) lastFocus = document.activeElement;
  $('#agentModal').hidden = false;
  document.body.style.overflow = 'hidden';
  if (focusReview) {
    $('#reviewForm').scrollIntoView({ block: 'center' });
    $('#r5')?.focus();
  } else $('#agentModal .modal-close').focus();
}

/* ------------------------------------------------ auth + dashboard */
let authMode = 'login';

function fillSpecialtySelects() {
  const opts = state.specialties.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  $('#specialtySelect').innerHTML = opts;
  $('#dashSpecialties').innerHTML = opts;
}

function initAuth() {
  $$('.auth-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.auth-tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      authMode = b.dataset.mode;
      $$('#authForm [data-only=register]').forEach((el) => (el.style.display = authMode === 'register' ? '' : 'none'));
      $('#authSubmit').textContent = authMode === 'register' ? 'Create my free listing' : 'Log in';
    })
  );
  $$('#authForm [data-only=register]').forEach((el) => (el.style.display = 'none'));

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const payload = { ...fd };
    $$('#authForm input[type=checkbox]').forEach((c) => (payload[c.name] = c.checked));
    if (authMode === 'register') {
      payload.specialties = $$('#specialtySelect option:checked').map((o) => o.value);
      payload.languages = (fd.languages || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    const { ok, data } = await api(`/agents/${authMode}`, { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) return toast(data.error || 'Something went wrong.', 'err');
    localStorage.setItem('agentToken', data.token);
    toast(authMode === 'register' ? 'Listing created — welcome!' : 'Welcome back!', 'ok');
    await loadDirectory();
    refreshSession();
  });

  $('#deleteAccountBtn').addEventListener('click', async () => {
    if (!confirm('Permanently delete your account, public profile and all reviews? This cannot be undone.')) return;
    const { ok, data } = await api('/agents/me', { method: 'DELETE' });
    if (!ok) return toast(data.error || 'Could not delete the account.', 'err');
    try { localStorage.removeItem('agentToken'); } catch { /* ignore */ }
    toast(data.message, 'ok');
    await loadDirectory();
    refreshSession();
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/agents/logout', { method: 'POST' });
    localStorage.removeItem('agentToken');
    refreshSession();
    toast('Logged out.', 'ok');
  });

  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const payload = {
      bio: fd.bio,
      location: fd.location,
      languages: (fd.languages || '').split(',').map((s) => s.trim()).filter(Boolean),
      specialties: $$('#dashSpecialties option:checked').map((o) => o.value),
    };
    const { ok, data } = await api('/agents/me', { method: 'PATCH', body: JSON.stringify(payload) });
    if (!ok) return toast(data.error || 'Could not save.', 'err');
    toast('Profile saved.', 'ok');
    loadDirectory();
  });

  $('#payoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const { ok, status, data } = await api('/agents/me/payout', { method: 'PUT', body: JSON.stringify(fd) });
    if (!ok) {
      return toast(status === 503 ? 'Payout storage isn’t enabled on this server yet — please contact us.' : data.error || 'Could not save payout details.', 'err');
    }
    renderPayoutStatus(data.payout);
    e.target.reset();
    toast('Payout details saved — you’re set to receive A$99 per client.', 'ok');
  });
}

function renderPayoutStatus(payout) {
  const el = $('#payoutStatus');
  if (!el) return;
  el.innerHTML = payout?.set
    ? `✔ Payouts active — <b>${esc(payout.accountName)}</b>, BSB ${esc(payout.bsb)}, account ${esc(payout.accountNumberMasked)}. Submit the form again to replace these details.`
    : 'No bank details on file yet — add them below to receive payouts.';
}

async function refreshSession() {
  const token = localStorage.getItem('agentToken');
  if (!token) return showAuth();
  const { ok, data } = await api('/agents/me');
  if (!ok) {
    localStorage.removeItem('agentToken');
    return showAuth();
  }
  showDash(data.agent);
}

function showAuth() {
  $('#authArea').hidden = false;
  $('#dashArea').hidden = true;
}

async function showDash(agent) {
  $('#authArea').hidden = true;
  $('#dashArea').hidden = false;
  $('#dashName').textContent = `${agent.name} · MARN ${agent.marn}`;
  if (agent.payoutProgram) {
    $('#payoutAmount').textContent = agent.payoutProgram.display;
    $('#payoutBlurb').textContent = agent.payoutProgram.description;
  }
  renderPayoutStatus(agent.payout);
  const f = $('#profileForm');
  f.location.value = agent.location || '';
  f.bio.value = agent.bio || '';
  f.languages.value = (agent.languages || []).join(', ');
  $$('#dashSpecialties option').forEach((o) => (o.selected = agent.specialties.includes(o.value)));
  const { data } = await api(`/agents/${agent.agentId}`);
  const reviews = data.agent?.reviews || [];
  $('#dashReviews').innerHTML = reviews.length
    ? reviews.map((r) => `<div class="review"><div class="r-head"><span>${stars(r.rating)} <b>${esc(r.name)}</b></span><span class="muted">${new Date(r.createdAt).toLocaleDateString('en-AU')}</span></div><p>${esc(r.comment)}</p></div>`).join('')
    : '<p class="muted">No reviews yet. Share your profile link with clients.</p>';
}

/* scroll reveal — sections fade in as they enter the viewport */
(() => {
  document.body.classList.add('reveal-ready');
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
    { threshold: 0.08 }
  );
  document.querySelectorAll('.section').forEach((s) => io.observe(s));
})();
