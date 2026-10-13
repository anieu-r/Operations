/* AusWise — shared page chrome, loaded on every page:
   consistent main menu, breadcrumbs, skip link, storage-consent banner,
   legal footer with business details, and a "continue where you left off"
   prompt. Keeps every page navigable the same way. */

import { storageChoice, setStorageChoice, optionalKeys } from './consent.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MENU = [
  ['/#finder', 'Find my visa'],
  ['/#visas', 'Visas'],
  ['/#sop', 'SOP builder'],
  ['/agents.html', 'Agents'],
  ['/institutions.html', 'Institutions'],
  ['/#services', 'Pricing'],
];

const LEGAL = [
  ['/privacy.html', 'Privacy Policy'],
  ['/terms.html', 'Terms of Service'],
  ['/refunds.html', 'Refund Policy'],
  ['/cookies.html', 'Cookie Policy'],
  ['/data-requests.html', 'Your data & deletion'],
  ['/accessibility.html', 'Accessibility'],
];

function initMenu() {
  const nav = $('.nav-links');
  if (!nav) return;
  const path = location.pathname.replace(/\/$/, '') || '/';
  nav.id = nav.id || 'site-menu';
  nav.setAttribute('aria-label', 'Main');
  nav.innerHTML =
    MENU.map(([href, label]) => {
      const current = href === path ? ' aria-current="page"' : '';
      return `<a href="${href}"${current}>${label}</a>`;
    }).join('') +
    `<a href="/apply.html" class="nav-cta"${path === '/apply.html' ? ' aria-current="page"' : ''}>Start application</a>`;

  const toggle = $('.nav-toggle');
  if (toggle) {
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () =>
      setTimeout(() => toggle.setAttribute('aria-expanded', String(nav.classList.contains('open'))))
    );
  }
  // The logo already has a visible text label next to it.
  document.querySelectorAll('.brand img').forEach((img) => img.setAttribute('alt', ''));
}

function initSkipLink() {
  const main = $('main');
  if (!main) return;
  if (!main.id) main.id = 'main';
  main.setAttribute('tabindex', '-1');
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = `#${main.id}`;
  a.textContent = 'Skip to main content';
  document.body.prepend(a);
  const toast = $('#toast');
  if (toast) {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  }
}

function initBreadcrumbs() {
  const title = document.body.dataset.crumb;
  const header = $('header.nav');
  if (!title || !header) return;
  const nav = document.createElement('nav');
  nav.className = 'crumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');
  nav.innerHTML = `<ol><li><a href="/">Home</a></li><li><span aria-current="page">${esc(title)}</span></li></ol>`;
  header.after(nav);
}

function initResume() {
  if (location.pathname !== '/' && location.pathname !== '/index.html') return;
  const key = optionalKeys().find((k) => k.startsWith('auswise-apply-'));
  const hero = $('.hero');
  if (!key || !hero) return;
  const code = key.replace('auswise-apply-', '');
  const box = document.createElement('div');
  box.className = 'resume';
  box.innerHTML = `<div><span>You have an unfinished questionnaire saved on this device (subclass ${esc(code)}).</span>
    <a class="btn btn-primary" href="/apply.html?visa=${encodeURIComponent(code)}">Continue where you left off</a></div>`;
  hero.before(box);
}

function showConsentBanner() {
  if ($('#consentBanner')) return;
  const el = document.createElement('section');
  el.id = 'consentBanner';
  el.className = 'consent-banner';
  el.setAttribute('aria-labelledby', 'consentTitle');
  el.innerHTML = `
    <h2 id="consentTitle">Your choice about saving drafts</h2>
    <p>We don’t use cookies, analytics or advertising trackers. With your permission, we can save your draft
      SOP and questionnaire answers in this browser so you can come back to them. You can change this at any
      time. <a href="/cookies.html">Cookie Policy</a></p>
    <div class="consent-actions">
      <button class="btn btn-ghost" data-choice="all">Allow saving drafts</button>
      <button class="btn btn-ghost" data-choice="essential">Essential only</button>
    </div>`;
  document.body.append(el);
  el.querySelectorAll('[data-choice]').forEach((b) =>
    b.addEventListener('click', () => {
      setStorageChoice(b.dataset.choice);
      el.remove();
    })
  );
}

async function initFooter() {
  const footer = $('footer.footer');
  if (!footer) return;
  const block = document.createElement('div');
  block.className = 'disclaimer';
  block.innerHTML = `<p class="legal-nav">${LEGAL.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}
    <button class="link-btn" type="button" id="storageSettings">Storage settings</button></p>
    <p class="biz-line" id="bizLine"></p>`;
  footer.append(block);
  $('#storageSettings').addEventListener('click', showConsentBanner);

  try {
    const biz = await (await fetch('/api/business')).json();
    const parts = [
      biz.legalName ? `${esc(biz.legalName)}${biz.tradingName && biz.tradingName !== biz.legalName ? ` trading as ${esc(biz.tradingName)}` : ''}` : esc(biz.tradingName),
      biz.abn ? `ABN ${esc(biz.abn)}` : '',
      biz.address ? esc(biz.address) : '',
      biz.email ? `<a href="mailto:${esc(biz.email)}">${esc(biz.email)}</a>` : '',
      biz.phone ? esc(biz.phone) : '',
    ].filter(Boolean);
    $('#bizLine').innerHTML = `${parts.join(' · ')} · Independent business — not affiliated with the Australian Government.`;
    document.dispatchEvent(new CustomEvent('auswise:business', { detail: biz }));
  } catch {
    /* footer still shows the legal links */
  }
}

/** Filter chips and segmented buttons announce their on/off state to screen readers. */
function initPressedState() {
  const sel = '.seg button, .chips .chip, .auth-tabs button';
  const sync = () => document.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(b.classList.contains('active'))));
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  sync();
}

initMenu();
initSkipLink();
initPressedState();
initBreadcrumbs();
initResume();
initFooter();
if (!storageChoice()) showConsentBanner();
