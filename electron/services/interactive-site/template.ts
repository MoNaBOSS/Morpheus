import { createHash } from 'node:crypto';
import { parseInteractiveSiteSpec } from '@shared/morpheus/interactive-site-types';

export const INTERACTIVE_TEMPLATE_VERSION = 'studio-v1.0.0';
export const INTERACTIVE_SITE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-same-origin allow-forms";
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const sha = (content: string) => createHash('sha256').update(content).digest('hex');

// Fixed, reviewed client behavior. User/model content is only escaped HTML text.
// No eval, imports, server, package hooks, storage, fetch or network form action.
const SCRIPT = `'use strict';
const filters = document.querySelectorAll('[data-category-filter]');
for (const button of filters) button.addEventListener('click', () => {
  const selected = button.dataset.categoryFilter;
  for (const item of document.querySelectorAll('[data-service-category]')) item.hidden = selected !== '*' && item.dataset.serviceCategory !== selected;
  for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
});
const form = document.querySelector('#brief-form');
for (const input of form.querySelectorAll('input,textarea')) input.addEventListener('input', () => input.setCustomValidity(''));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  for (const input of form.querySelectorAll('input,textarea')) input.setCustomValidity(input.value.trim() ? '' : 'Please enter a few words.');
  if (!form.reportValidity()) return;
  const name = form.elements.namedItem('name').value.trim();
  const brief = form.elements.namedItem('brief').value.trim();
  const result = document.querySelector('#brief-result');
  result.textContent = name + ', your brief is ready locally: ' + brief + ' Nothing has been sent. Connect a delivery service before collecting enquiries.';
  result.hidden = false;
  result.focus();
});
`;

const STYLE = `:root{color-scheme:light;--paper:#fff;--ink:#182923;--muted:#53635b;--line:#dbe2dd;--accent:#194b38;font-family:Arial,Helvetica,sans-serif;background:var(--paper);color:var(--ink)}*{box-sizing:border-box}body{margin:0}a{color:inherit}button,input,textarea{font:inherit}button,a,input,textarea,summary{-webkit-tap-highlight-color:transparent}a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #268864;outline-offset:5px}header,main,footer{max-width:1180px;margin:auto;padding:0 6vw}header{display:flex;align-items:center;justify-content:space-between;min-height:88px;border-bottom:1px solid var(--line);gap:24px}header strong{font-size:20px;letter-spacing:-.5px}nav{display:flex;gap:24px;font-size:14px}nav a{text-decoration:none}.hero{padding:100px 0 88px;max-width:900px}h1{font-size:clamp(42px,6.5vw,80px);line-height:1.04;letter-spacing:-.055em;max-width:900px;margin:0 0 30px;font-weight:600}.hero p{font-size:20px;line-height:1.65;color:var(--muted);max-width:650px;margin:0 0 32px}.primary{display:inline-block;background:var(--accent);color:#fff;padding:15px 24px;border:0;border-radius:5px;text-decoration:none;font-size:15px;cursor:pointer}section{padding:64px 0;border-top:1px solid var(--line)}h2{font-size:34px;letter-spacing:-.035em;font-weight:500;margin:0 0 32px}.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:26px}.filters button{border:1px solid var(--line);background:#fff;color:var(--ink);padding:9px 15px;border-radius:4px;cursor:pointer}.filters button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}.services{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px 48px}.services article{border-top:1px solid var(--line);padding:26px 0}h3{font-size:23px;letter-spacing:-.02em;font-weight:500;margin:0 0 16px}article p,details p{font-size:16px;line-height:1.7;color:var(--muted);margin:0}article[hidden]{display:none}.brief{display:grid;grid-template-columns:1fr 1fr;gap:60px}.brief p{font-size:16px;line-height:1.7;color:var(--muted)}form{display:grid;gap:18px}label{display:grid;gap:8px;font-size:14px}input,textarea{border:1px solid #aab9af;background:#fff;padding:14px;border-radius:4px;min-width:0;width:100%;color:var(--ink)}textarea{resize:vertical;min-height:140px}form button{justify-self:start}#brief-result{border-left:3px solid var(--accent);padding:16px;background:#f4f8f5;font-size:15px;line-height:1.6}details{border-top:1px solid var(--line);padding:22px 0}summary{cursor:pointer;font-size:18px;line-height:1.5}details p{margin-top:18px;max-width:780px}footer{border-top:1px solid var(--line);padding-top:28px;padding-bottom:28px;font-size:13px;color:var(--muted)}@media(max-width:640px){header,main,footer{padding-left:24px;padding-right:24px}header{min-height:76px;flex-wrap:wrap;padding-top:20px;padding-bottom:20px;gap:16px}nav{gap:18px}.hero{padding:64px 0}.hero p{font-size:18px}section{padding:44px 0}h2{font-size:29px}.services,.brief{grid-template-columns:1fr;gap:24px}h1{overflow-wrap:anywhere}header strong{overflow-wrap:anywhere}}@media(prefers-reduced-motion:no-preference){.primary{transition:background-color .15s}.primary:hover{background:#23664c}}`;

/** Small bounded deterministic compiler, never loads project configs/dependencies. */
export function buildInteractiveSite(value: unknown) {
  const spec = parseInteractiveSiteSpec(value);
  const categories = [...new Set(spec.services.map((service) => service.category))];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(INTERACTIVE_SITE_CSP.replace(/; sandbox[^;]+/, ''))}"><title>${escapeHtml(spec.title)}</title><link rel="stylesheet" href="styles.css"><script src="app.js" defer></script></head><body>
<header><strong>${escapeHtml(spec.title)}</strong><nav aria-label="Site navigation"><a href="#services">Services</a><a href="#questions">Questions</a><a href="#contact">Start a brief</a></nav></header><main>
<div class="hero"><h1>${escapeHtml(spec.headline)}</h1><p>${escapeHtml(spec.description)}</p><a class="primary" href="#contact">Start a brief</a></div>
<section id="services"><h2>What we do</h2><div class="filters" aria-label="Filter services"><button type="button" data-category-filter="*" aria-pressed="true">All services</button>${categories.map((category, i) => `<button type="button" data-category-filter="c${i}" aria-pressed="false">${escapeHtml(category)}</button>`).join('')}</div><div class="services">${spec.services.map((service) => `<article data-service-category="c${categories.indexOf(service.category)}"><h3>${escapeHtml(service.title)}</h3><p>${escapeHtml(service.description)}</p></article>`).join('')}</div></section>
<section id="questions"><h2>A few useful answers</h2>${spec.faqs.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join('') || '<p>No questions added yet.</p>'}</section>
<section id="contact" class="brief"><div><h2>Start with your idea.</h2><p>This client-only form prepares a brief on your device. It does not send enquiries or store personal information. Connect a delivery service before using it to collect enquiries.</p></div><form id="brief-form"><label>Your name<input name="name" required maxlength="80" autocomplete="off"></label><label>What would you like to create?<textarea name="brief" required maxlength="2000"></textarea></label><button class="primary" type="submit">Prepare my brief</button><p id="brief-result" role="status" tabindex="-1" hidden></p></form></section>
</main><footer>${escapeHtml(spec.title)} · Client-side site. No analytics or form delivery service connected.</footer></body></html>`;
  const files: Record<string, string> = {
    'index.html': html,
    'styles.css': STYLE + '\nbody{overflow-wrap:anywhere}\n',
    'app.js': SCRIPT,
    'morpheus.site.json': JSON.stringify(spec, null, 2) + '\n',
    'README.md': `# ${spec.title.replace(/[\r\n]/g, ' ')}\n\nBuilt with Morpheus ${INTERACTIVE_TEMPLATE_VERSION}. Edit morpheus.site.json and rebuild to change content. Direct file edits are preserved but invalidate the pinned preview until reviewed/rebuilt.\n\nClient-only: service filters, FAQ disclosure and local brief validation. No form submission, payment processing, server, tracking, dependencies or package hooks. Publication is a separate approved operation.\n`,
  };
  const entries = Object.entries(files).map(([path, content]) => ({ path, sha256: sha(content), bytes: Buffer.byteLength(content) }));
  const revision = sha(JSON.stringify(entries));
  files['morpheus.build.json'] = JSON.stringify({ v: 1, template: INTERACTIVE_TEMPLATE_VERSION, revision, files: entries }, null, 2) + '\n';
  return { spec, files, revision, totalBytes: Object.values(files).reduce((sum, content) => sum + Buffer.byteLength(content), 0) };
}

export type MorpheusInteractiveBuild = ReturnType<typeof buildInteractiveSite>;
