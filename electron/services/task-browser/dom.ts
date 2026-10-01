import type { MorpheusBrowserCommand } from '@shared/morpheus/browser-types';

/** Compiled-in code, executed only in an isolated world. Page text cannot supply
 * selectors or JavaScript. Refs are bound to the exact observed node and state. */
const DOM_PROGRAM = String.raw`(input) => {
  const clean = (value, length = 180) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return element.isConnected && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[hidden],[inert]');
  };
  const fingerprint = (element) => JSON.stringify([element.tagName, element.getAttribute('href'), element.getAttribute('type'), element.getAttribute('name'), element.getAttribute('aria-label'), clean(element.textContent), element.disabled]);
  const kind = (element) => element.tagName === 'A' ? 'link' : element.tagName === 'SELECT' ? 'select' : ['INPUT', 'TEXTAREA'].includes(element.tagName) ? 'input' : 'button';
  const safeField = (element) => !['password', 'file', 'hidden', 'email'].includes((element.type || '').toLowerCase()) && !/(password|token|secret|credential|credit|card|cvv|otp|login|username)/i.test([element.name, element.id, element.autocomplete, element.getAttribute('aria-label')].join(' '));
  const name = (element) => clean(element.getAttribute('aria-label') || (element.labels && [...element.labels].map(label => label.textContent).join(' ')) || element.innerText || element.getAttribute('placeholder') || element.getAttribute('title') || element.name);
  const state = globalThis.__morpheusPublicDom;
  if (input.command) {
    const command = input.command;
    const entry = state && state.revision === command.revision && state.refs.get(command.ref);
    if (!entry || !visible(entry.element) || entry.element.disabled || fingerprint(entry.element) !== entry.fingerprint) throw new Error('Page control changed; inspect it again.');
    const element = entry.element;
    if (!safeField(element)) throw new Error('Account or sensitive fields require a separate approved session.');
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (top !== element && !element.contains(top)) throw new Error('Page control is covered; inspect it again.');
    if (command.kind === 'fill') {
      if (!['INPUT', 'TEXTAREA'].includes(element.tagName) || element.readOnly || (element.tagName === 'INPUT' && !['text', 'search', 'url', 'tel', 'number'].includes(element.type))) throw new Error('This control cannot receive public text.');
      const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, command.text);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (command.kind === 'select') {
      if (element.tagName !== 'SELECT' || ![...element.options].some(option => option.value === command.value && !option.disabled)) throw new Error('Selection unavailable.');
      element.value = command.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (command.kind === 'click') {
      if (!['link', 'button'].includes(kind(element))) throw new Error('Use the typed input action for this control.');
      if (element.tagName === 'A' && (element.hasAttribute('download') || new URL(element.href).origin !== input.origin || new URL(element.href).protocol !== 'https:')) throw new Error('Link exceeds the public browser scope.');
      element.click();
    } else if (command.kind === 'press') {
      element.focus();
      if (document.activeElement !== element) throw new Error('Page control could not receive focus.');
    }
    // One observed reference can perform only one operation. A new snapshot is
    // required even if a page changes asynchronously without navigation.
    state.refs.clear();
    return { acted: true };
  }
  const refs = new Map();
  const controls = [];
  const candidates = document.querySelectorAll('a[href],button,input,textarea,select,[role="button"]');
  let visited = 0;
  for (const element of candidates) {
    if (++visited > 2000 || controls.length >= 100) break;
    if (!visible(element) || element.disabled || !safeField(element)) continue;
    const label = name(element);
    if (!label) continue;
    const ref = 'e' + (controls.length + 1);
    const control = { ref, kind: kind(element), name: label };
    if (element.tagName === 'A') {
      try { const url = new URL(element.href); if (url.origin !== input.origin || url.protocol !== 'https:') continue; control.href = url.href.slice(0, 2048); } catch { continue; }
    }
    refs.set(ref, { element, fingerprint: fingerprint(element) });
    controls.push(control);
  }
  globalThis.__morpheusPublicDom = { revision: input.revision, refs };
  const text = (document.body && document.body.innerText) || '';
  return { url: location.href, title: clean(document.title, 240), text: clean(text, 16000), controls, truncated: text.length > 16000 || visited > 2000 || controls.length >= 100 };
}`;

export function browserDomScript(input: { origin: string; revision?: string; command?: MorpheusBrowserCommand }): string {
  return `(${DOM_PROGRAM})(${JSON.stringify(input)})`;
}
