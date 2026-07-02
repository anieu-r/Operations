/* AusWise — institutions directory + partner window. */

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

const state = { all: [], q: '', type: '', state: '' };

document.addEventListener('DOMContentLoaded', async () => {
  $('#year').textContent = new Date().getFullYear();
  $('.nav-toggle')?.addEventListener('click', () => $('.nav-links').classList.toggle('open'));

  const { data } = await api('/institutions');
  state.all = data.institutions || [];
  $('#instNotice').textContent = data.notice || '';
  $('#cricosBtn').href = data.cricosUrl;
  $('#studyAusBtn').href = data.studyAustraliaUrl;

  $('#stateChips').innerHTML =
    `<button class="chip active" data-s="">All states</button>` +
    (data.states || []).map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $$('#stateChips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('#stateChips .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.state = c.dataset.s;
      render();
    })
  );
  $$('#typeFilter button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#typeFilter button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.type = b.dataset.t;
      render();
    })
  );
  $('#instSearch').addEventListener('input', (e) => {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });
  render();

  $('#partnerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const btn = $('#partnerForm button[type=submit]');
    btn.disabled = true;
    const { ok, data: res } = await api('/institutions/enquiry', { method: 'POST', body: JSON.stringify(fd) });
    btn.disabled = false;
    if (!ok) return toast(res.error || 'Could not submit.', 'err');
    toast(`Registered — ref ${res.reference}. ${res.message}`, 'ok');
    e.target.reset();
  });
});

function render() {
  const rows = state.all.filter((i) => {
    if (state.type && i.type !== state.type) return false;
    if (state.state && i.state !== state.state) return false;
    if (state.q && ![i.name, i.city, i.state, ...(i.tags || [])].join(' ').toLowerCase().includes(state.q)) return false;
    return true;
  });
  $('#instEmpty').hidden = rows.length > 0;
  $('#instGrid').innerHTML = rows
    .map(
      (i) => `<article class="inst-card">
      <span class="inst-type">${esc(i.type)}</span>
      <span class="inst-name">${esc(i.name)}</span>
      <span class="inst-loc">${esc(i.city)}, ${esc(i.state)}</span>
      <div class="vc-meta">${(i.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <a class="btn btn-ghost" href="${esc(i.url)}" target="_blank" rel="noopener">Official website ↗</a>
    </article>`
    )
    .join('');
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
