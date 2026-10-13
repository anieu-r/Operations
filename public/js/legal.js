/* AusWise — legal pages: fill in business details from /api/business and
   handle the self-service data-rights forms. Details that the business has
   not configured yet are shown as clearly marked gaps, never invented. */

import { clearOptional, CONSENT_KEY } from './consent.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, data };
}

async function fillBusiness() {
  let biz = {};
  try {
    biz = await (await fetch('/api/business')).json();
  } catch {
    /* leave gaps marked */
  }
  const values = {
    ...biz,
    abnLabel: biz.abn ? `(ABN ${biz.abn})` : '',
    email: biz.email ? `<a href="mailto:${esc(biz.email)}">${esc(biz.email)}</a>` : '',
    privacyOfficer: biz.privacyOfficer ? `<a href="mailto:${esc(biz.privacyOfficer)}">${esc(biz.privacyOfficer)}</a>` : '',
  };
  const html = new Set(['email', 'privacyOfficer']);
  document.querySelectorAll('[data-biz]').forEach((el) => {
    const key = el.dataset.biz;
    const v = values[key];
    if (key === 'abnLabel') {
      el.innerHTML = v ? esc(v) : '<span class="biz-missing">(ABN not yet provided)</span>';
    } else if (v != null && v !== '') {
      el.innerHTML = html.has(key) ? v : esc(v);
    } else {
      el.innerHTML = '<span class="biz-missing">not yet provided</span>';
    }
  });
}

function initForms() {
  const del = $('#deleteForm');
  del?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(del).entries());
    const { ok, data } = await api('/privacy/delete', body);
    $('#deleteResult').textContent = ok ? data.message : data.error || 'Something went wrong.';
    if (ok && data.deleted) del.reset();
  });

  const req = $('#requestForm');
  req?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(req).entries());
    const { ok, data } = await api('/privacy/request', body);
    $('#requestResult').textContent = ok ? `${data.message} Your reference: ${data.reference}.` : data.error || 'Something went wrong.';
    if (ok) req.reset();
  });

  $('#clearDevice')?.addEventListener('click', () => {
    clearOptional();
    try {
      localStorage.removeItem('agentToken');
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      /* storage unavailable */
    }
    $('#clearResult').textContent = 'Done — drafts, login and settings saved by this site have been removed from this browser.';
  });
}

fillBusiness();
initForms();
