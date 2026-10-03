// The sandboxed orb has four fixed Main channels; it never owns execution or credentials.
const bridge = window.morpheusOrb;
const orb = document.querySelector('.orb');
const composer = document.querySelector('.hover-composer');
const input = document.querySelector('#orb-input');
const send = document.querySelector('.hover-composer-send');
const expand = document.querySelector('.hover-composer-expand');
const status = document.querySelector('#orb-status');
const presenceStatus = document.querySelector('#orb-presence-status');
const motionCue = document.querySelector('.morpheus-motion__cue');
const root = document.documentElement;
let language = 'en';

const motionLabels = {
  en: { asleep: 'Ask Morpheus, quiet', armed: 'Ask Morpheus, ready', listening: 'Morpheus listening', transcribing: 'Morpheus transcribing', understanding: 'Morpheus understanding', 'waiting-for-approval': 'Morpheus needs approval', working: 'Morpheus working', 'preparing-speech': 'Morpheus preparing speech', speaking: 'Morpheus speaking', error: 'Morpheus needs attention' },
  zh: { asleep: '询问 Morpheus，安静', armed: '询问 Morpheus，已就绪', listening: 'Morpheus 正在聆听', transcribing: 'Morpheus 正在转写', understanding: 'Morpheus 正在理解', 'waiting-for-approval': 'Morpheus 需要批准', working: 'Morpheus 正在处理', 'preparing-speech': 'Morpheus 正在准备语音', speaking: 'Morpheus 正在说话', error: 'Morpheus 需要注意' },
  ja: { asleep: 'Morpheus に質問、静音', armed: 'Morpheus に質問、準備完了', listening: 'Morpheus が聞き取り中', transcribing: 'Morpheus が文字起こし中', understanding: 'Morpheus が理解中', 'waiting-for-approval': 'Morpheus に承認が必要です', working: 'Morpheus が作業中', 'preparing-speech': 'Morpheus が音声を準備中', speaking: 'Morpheus が発話中', error: 'Morpheus に対応が必要です' },
  ru: { asleep: 'Спросить Morpheus, тихий режим', armed: 'Спросить Morpheus, готов', listening: 'Morpheus слушает', transcribing: 'Morpheus распознаёт речь', understanding: 'Morpheus обрабатывает запрос', 'waiting-for-approval': 'Morpheus ждёт разрешения', working: 'Morpheus работает', 'preparing-speech': 'Morpheus готовит ответ', speaking: 'Morpheus говорит', error: 'Morpheus требует внимания' },
};

const motionStates = {
  asleep: 'quiet',
  armed: 'idle',
  listening: 'listening',
  transcribing: 'understanding',
  understanding: 'understanding',
  'waiting-for-approval': 'attention',
  working: 'working',
  'preparing-speech': 'understanding',
  speaking: 'speaking',
  error: 'attention',
};

function syncMotionState() {
  const state = root.dataset.state || 'armed';
  orb.dataset.motionState = motionStates[state] || 'idle';
  orb.dataset.motionTone = state === 'error' ? 'error' : 'normal';
  motionCue.textContent = state === 'error' ? '!' : state === 'waiting-for-approval' ? '?' : '';
  const label = motionLabels[language][state] || motionLabels[language].armed;
  orb.ariaLabel = label;
  orb.title = label;
  presenceStatus.textContent = state === 'error' || state === 'waiting-for-approval' ? label : '';
}

function syncMotionVisibility() {
  const hidden = document.hidden || root.dataset.windowVisible === 'false';
  orb.dataset.motionPaused = String(hidden);
  if (hidden) orb.style.setProperty('--morpheus-audio-level', '0');
}

new MutationObserver(syncMotionState).observe(root, { attributes: true, attributeFilter: ['data-state'] });
new MutationObserver(syncMotionVisibility).observe(root, { attributes: true, attributeFilter: ['data-window-visible'] });
document.addEventListener('visibilitychange', syncMotionVisibility);
syncMotionState();
syncMotionVisibility();

let conversationId = '';
let revision = 0;
let ready = false;
let dirty = false;
let conflict = false;
let writing = null;
let submitting = false;
let composing = false;
let pendingRequestId = '';
let hoverTimer;
let collapseTimer;
let pointerPosition = null;
let dismissedPointer = null;

function observePointer(event) {
  pointerPosition = { x: event.screenX, y: event.screenY };
  if (dismissedPointer && (Math.abs(event.screenX - dismissedPointer.x) > 4
    || Math.abs(event.screenY - dismissedPointer.y) > 4)) dismissedPointer = null;
}
document.addEventListener('pointermove', observePointer);

const notices = {
  en: { conflict: 'The draft changed in another window. Send this text here or copy it before closing.', failed: 'Morpheus could not save that yet. Try again.', sending: 'Sending to Morpheus.' },
  zh: { conflict: '草稿已在另一窗口更改。请在此发送或先复制文本。', failed: '暂时无法保存，请重试。', sending: '正在发送给 Morpheus。' },
  ja: { conflict: '別のウィンドウで下書きが変更されました。ここで送信するか、閉じる前にコピーしてください。', failed: '保存できませんでした。もう一度お試しください。', sending: 'Morpheus に送信中です。' },
  ru: { conflict: 'Черновик изменился в другом окне. Отправьте текст здесь или скопируйте его перед закрытием.', failed: 'Не удалось сохранить. Повторите попытку.', sending: 'Отправка Морфеусу.' },
};

function report(message) {
  status.textContent = message;
  input.title = message;
}

function setBusy(busy) {
  submitting = busy;
  send.disabled = busy || !ready || !input.value.trim();
}

async function snapshot({ preserveLocal = false } = {}) {
  if (!bridge) throw new Error('Morpheus orb bridge unavailable');
  const result = await bridge.snapshot();
  if (!result || result.schemaVersion !== 1 || !result.draft || !result.conversationId) {
    throw new Error('Invalid assistant snapshot');
  }
  conversationId = result.conversationId;
  revision = result.draft.revision;
  language = result.presentation?.language in notices ? result.presentation.language : 'en';
  document.documentElement.lang = language;
  syncMotionState();
  input.placeholder = result.presentation?.placeholder || 'Ask Morpheus…';
  send.ariaLabel = result.presentation?.submit || 'Send';
  send.title = send.ariaLabel;
  expand.ariaLabel = result.presentation?.open || 'Open compact conversation';
  expand.title = expand.ariaLabel;
  if (!preserveLocal) {
    input.value = result.draft.text;
    dirty = false;
    conflict = false;
    document.documentElement.dataset.draftConflict = 'false';
    report('');
  }
  ready = true;
  input.disabled = false;
  if (!preserveLocal) setBusy(false);
  return result;
}

async function saveDraft() {
  if (!ready || conflict || !dirty) return !conflict;
  if (writing) return writing;
  writing = (async () => {
    while (dirty && !conflict) {
      const text = input.value;
      try {
        const next = await bridge.updateDraft({ conversationId, expectedRevision: revision, text });
        if (!next || next.conversationId !== conversationId || !Number.isSafeInteger(next.revision)) {
          throw new Error('Invalid draft response');
        }
        revision = next.revision;
        dirty = input.value !== text;
        report('');
      } catch {
        try {
          const current = await snapshot({ preserveLocal: true });
          if (current.draft.text === text) {
            dirty = input.value !== text;
            continue;
          }
          conflict = true;
          document.documentElement.dataset.draftConflict = 'true';
          report(notices[language].conflict);
        } catch {
          report(notices[language].failed);
        }
        break;
      }
    }
    return !dirty && !conflict;
  })().finally(() => { writing = null; });
  return writing;
}

function requestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `orb:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function openCompact() {
  await saveDraft();
  if (conflict || dirty) return;
  await bridge.present('open');
}

async function submit() {
  if (!ready || submitting || composing || !input.value.trim()) return;
  setBusy(true);
  const text = input.value;
  pendingRequestId ||= requestId();
  await saveDraft();
  try {
    report(notices[language].sending);
    await bridge.admitTurn({ conversationId, clientRequestId: pendingRequestId, text, source: 'orb' });
    // Admission is idempotent in Main; opening compact only presents the existing turn.
    pendingRequestId = '';
    dirty = false;
    conflict = false;
    input.value = '';
    await bridge.present('open');
  } catch {
    report(notices[language].failed);
  } finally {
    setBusy(false);
  }
}

let dragPointer = null;
let dragStarted = false;
let suppressDragClick = false;
let dragUpdate = null;
let dragAdmission = Promise.resolve();
orb.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragPointer = { id: event.pointerId, x: event.screenX, y: event.screenY };
  dragStarted = false;
  clearTimeout(hoverTimer);
});
orb.addEventListener('pointermove', (event) => {
  if (!dragPointer || event.pointerId !== dragPointer.id) return;
  if (!dragStarted && Math.hypot(event.screenX - dragPointer.x, event.screenY - dragPointer.y) < 5) return;
  if (!dragStarted) {
    dragStarted = true;
    suppressDragClick = true;
    orb.setPointerCapture(event.pointerId);
    clearTimeout(hoverTimer); clearTimeout(collapseTimer);
    dragAdmission = bridge.present('drag-start');
  }
  if (!dragUpdate) dragUpdate = requestAnimationFrame(() => {
    dragUpdate = null;
    void dragAdmission.then(() => bridge.present('drag-move'));
  });
});
const finishDrag = (event) => {
  if (!dragPointer || event.pointerId !== dragPointer.id) return;
  if (event.type === 'pointercancel') suppressDragClick = false;
  dragPointer = null;
  if (!dragStarted) return;
  dragStarted = false;
  if (dragUpdate) cancelAnimationFrame(dragUpdate);
  dragUpdate = null;
  void dragAdmission.then(() => bridge.present('drag-end'));
  if (orb.hasPointerCapture(event.pointerId)) orb.releasePointerCapture(event.pointerId);
};
orb.addEventListener('pointerup', finishDrag);
orb.addEventListener('pointercancel', finishDrag);
orb.addEventListener('keydown', (event) => {
  const moves = { ArrowLeft: 'move-left', ArrowRight: 'move-right', ArrowUp: 'move-up', ArrowDown: 'move-down', Home: 'reset-position' };
  if (!event.altKey || !moves[event.key]) return;
  event.preventDefault();
  void bridge.present(moves[event.key]);
});

orb.addEventListener('pointerenter', (event) => {
  observePointer(event);
  clearTimeout(collapseTimer);
  clearTimeout(hoverTimer);
  // Resizing a native window can generate pointerenter under a stationary
  // cursor. Escape is a dismissal, not an invitation to reopen immediately.
  if (dismissedPointer || dragPointer || dragStarted) return;
  hoverTimer = setTimeout(() => {
    void bridge?.present('hover');
    if (!dirty && !writing) void snapshot().catch(() => report(notices[language].failed));
  }, 140);
});

orb.addEventListener('click', async () => {
  if (suppressDragClick) { suppressDragClick = false; return; }
  dismissedPointer = null;
  clearTimeout(hoverTimer);
  clearTimeout(collapseTimer);
  await bridge.present('focus');
  if (!ready) await snapshot();
  input.focus();
});

document.body.addEventListener('pointerenter', () => clearTimeout(collapseTimer));
document.body.addEventListener('pointerleave', (event) => {
  observePointer(event);
  clearTimeout(hoverTimer);
  clearTimeout(collapseTimer);
  if (dragStarted || composer.contains(document.activeElement) || conflict) return;
  collapseTimer = setTimeout(() => { void bridge?.present('collapse'); }, 260);
});

input.addEventListener('pointerdown', () => { void bridge.present('focus'); });
input.addEventListener('input', () => {
  dirty = true;
  pendingRequestId = '';
  setBusy(false);
  void saveDraft();
});
input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; });
composer.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!composing) void submit();
});
expand.addEventListener('click', () => { void openCompact(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  dismissedPointer = pointerPosition;
  clearTimeout(hoverTimer);
  clearTimeout(collapseTimer);
  void (async () => {
    await saveDraft();
    if (conflict || dirty) return;
    input.blur();
    await bridge.present('collapse');
  })();
});

void snapshot().catch(() => report(notices[language].failed));
