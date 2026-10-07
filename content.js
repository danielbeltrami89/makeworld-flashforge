(() => {
  const BUTTON_ID = 'mw-flashforge-ad5x-button';
  const STYLE_ID = 'mw-flashforge-ad5x-style';
  const LABEL = 'Baixar AD5X';
  const SEARCH_SELECTOR = [
    'button',
    'a',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="button"]',
    '[tabindex]',
    'li',
    'div',
    'span'
  ].join(',');
  const DOWNLOAD_WORDS = [
    'download',
    'baixar',
    'descarregar',
    'descargar',
    'telecharger',
    'télécharger',
    'herunterladen',
    'scarica',
    '下载',
    '下載',
    'ダウンロード',
    '다운로드'
  ];
  let scheduled = false;

  function norm(s) {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }

  function includesAny(text, words) {
    return words.some(word => text.includes(norm(word)));
  }

  function log(...args) {
    console.info('[FlashForge AD5X]', ...args);
  }

  function showStatus(message) {
    let el = document.getElementById('mw-flashforge-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mw-flashforge-toast';
      Object.assign(el.style, {
        position: 'fixed', right: '24px', bottom: 'calc(214px + env(safe-area-inset-bottom, 0px))', zIndex: '2147483647',
        background: '#202020', color: '#fff', border: '1px solid #3a3a3a', borderRadius: '10px',
        padding: '12px 16px', font: '14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        boxShadow: '0 8px 30px rgba(0,0,0,.35)', maxWidth: '380px'
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.remove(), 8000);
  }

  function isDownload3mfText(text) {
    if (!text) return false;
    const selfText = norm(`${LABEL} FlashForge AD5X`);
    if (text.includes(selfText) || text.includes('flashforge')) return false;
    return text.includes('3mf') && (includesAny(text, DOWNLOAD_WORDS) || !text.includes('stl'));
  }

  function clickable(el) {
    if (!el) return null;
    const semantic = el.closest('button, a, [role="menuitem"], [role="option"], [role="button"], [tabindex]');
    if (semantic instanceof HTMLElement) return semantic;

    let best = null;
    let cur = el;
    for (let i = 0; cur && cur !== document.body && i < 5; i++, cur = cur.parentElement) {
      if (!(cur instanceof HTMLElement)) break;
      if (getComputedStyle(cur).cursor === 'pointer') best = cur;
    }
    return best || el;
  }

  function score3mfCandidate(el, target, text) {
    let score = 0;
    if (target.matches('button, a')) score += 50;
    if (target.matches('[role="menuitem"], [role="option"], [role="button"]')) score += 35;
    if (target.hasAttribute('tabindex')) score += 8;
    if (text === 'download 3mf' || text === 'baixar 3mf') score += 40;
    if (text.length <= 35) score += 25;
    else if (text.length <= 90) score += 8;
    else score -= Math.min(60, Math.floor(text.length / 15));

    const rect = target.getBoundingClientRect();
    if (rect.height >= 32 && rect.height <= 80) score += 15;
    else if (rect.height > 140) score -= 30;
    if (rect.width <= Math.min(window.innerWidth * 0.9, 620)) score += 6;
    else score -= 15;
    if (norm(target.textContent) === text) score += 8;
    if (el === target) score += 4;
    return score;
  }

  function findDownload3mfAction() {
    let best = null;
    const candidates = document.querySelectorAll(SEARCH_SELECTOR);
    for (const el of candidates) {
      if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
      if (el.id === BUTTON_ID || el.closest(`#${BUTTON_ID}`)) continue;

      const text = norm(el.textContent);
      if (!isDownload3mfText(text)) continue;

      const target = clickable(el);
      if (!(target instanceof HTMLElement) || !isVisible(target)) continue;
      if (target.id === BUTTON_ID || target.closest(`#${BUTTON_ID}`)) continue;

      const score = score3mfCandidate(el, target, text);
      if (!best || score > best.score) best = { target, score };
    }
    return best?.target || null;
  }

  function setButtonBusy(button, busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    button.querySelector('[data-main]').textContent = busy ? 'Preparando...' : LABEL;
  }

  async function startConversion(button) {
    log('floating button clicked');
    showStatus('Procurando o botao "Baixar 3MF"...');
    const original = findDownload3mfAction();
    if (!original) {
      log('download button not found');
      alert('Não encontrei o botão “Baixar 3MF” nesta página. Abra um modelo/perfil de impressão e tente novamente.');
      return;
    }

    log('download target found', {
      tag: original.tagName,
      text: norm(original.textContent).slice(0, 140),
      className: original.className
    });
    setButtonBusy(button, true);
    try {
      showStatus('Acionando o download original do MakerWorld...');
      const clickedAt = new Date(Date.now() - 1000).toISOString();
      const armPromise = chrome.runtime.sendMessage({ type: 'ARM_FLASHFORGE_DOWNLOAD', clickedAt });
      original.click();
      showStatus('Clique enviado. Aguardando o Chrome detectar o download...');
      armPromise.then((response) => {
        log('background arm response', response);
        if (!response?.ok) {
          setButtonBusy(button, false);
          alert('Não foi possível iniciar a conversão. Recarregue a página e tente novamente.');
        }
      }).catch((error) => {
        log('background arm failed', error);
        setButtonBusy(button, false);
        alert('Falha ao iniciar a conversão: ' + (error?.message || error));
      });
      clearTimeout(button._resetTimer);
      button._resetTimer = setTimeout(() => {
        setButtonBusy(button, false);
        showStatus('Ainda nao recebi um download 3MF. Teste o botao verde original para confirmar se ele baixa nesta pagina.');
      }, 24000);
    } catch (error) {
      log('conversion start failed', error);
      setButtonBusy(button, false);
      alert('Falha ao iniciar a conversão: ' + (error?.message || error));
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        --mw-flashforge-right: 24px;
        --mw-flashforge-bottom: calc(148px + env(safe-area-inset-bottom, 0px));
        position: fixed;
        right: var(--mw-flashforge-right);
        bottom: var(--mw-flashforge-bottom);
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 172px;
        height: 48px;
        padding: 0 18px;
        border: 1px solid rgba(255, 255, 255, .18);
        border-radius: 999px;
        background: linear-gradient(135deg, #02c91f, #008f6a);
        color: #07120a;
        box-shadow: 0 14px 34px rgba(0, 0, 0, .38), 0 0 0 1px rgba(0, 0, 0, .18);
        cursor: pointer;
        font: 700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        user-select: none;
      }
      #${BUTTON_ID}:hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
      }
      #${BUTTON_ID}:active {
        transform: translateY(0);
      }
      #${BUTTON_ID}:disabled {
        cursor: wait;
        filter: saturate(.8);
        opacity: .82;
      }
      #${BUTTON_ID} [data-icon] {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .24);
        color: #06250d;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
      }
      #${BUTTON_ID} [data-text] {
        display: grid;
        gap: 1px;
        text-align: left;
        white-space: nowrap;
      }
      #${BUTTON_ID} [data-sub] {
        font-size: 10px;
        font-weight: 700;
        opacity: .74;
      }
      @media (max-width: 640px) {
        #${BUTTON_ID} {
          --mw-flashforge-right: 16px;
          --mw-flashforge-bottom: calc(132px + env(safe-area-inset-bottom, 0px));
          min-width: 150px;
          height: 44px;
          padding: 0 14px;
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureFloatingButton() {
    if (!document.body || document.getElementById(BUTTON_ID)) return;
    ensureStyles();

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.title = 'Baixa o 3MF e converte localmente para um projeto da FlashForge AD5X';
    button.innerHTML = `
      <span data-icon aria-hidden="true">3MF</span>
      <span data-text>
        <span data-main>${LABEL}</span>
        <span data-sub>FlashForge</span>
      </span>
    `;
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startConversion(button);
    }, true);

    document.body.appendChild(button);
  }

  function scheduleButton() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureFloatingButton();
    });
  }

  const observer = new MutationObserver(scheduleButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureFloatingButton();
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'FLASHFORGE_STATUS') return;
  const button = document.getElementById('mw-flashforge-ad5x-button');
  if (button instanceof HTMLButtonElement) {
    const main = button.querySelector('[data-main]');
    const message = msg.message || '';
    if (message.startsWith('Download detectado')) {
      clearTimeout(button._resetTimer);
      button._resetTimer = setTimeout(() => {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        if (main) main.textContent = 'Baixar AD5X';
      }, 120000);
      if (main) main.textContent = 'Convertendo...';
    } else if (message.startsWith('Pronto') || message.startsWith('Falha') || message.startsWith('Nao detectei')) {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      clearTimeout(button._resetTimer);
      if (main) main.textContent = 'Baixar AD5X';
    } else if (main && message.startsWith('Aguardando')) {
      main.textContent = 'Preparando...';
    }
  }
  console.info('[FlashForge AD5X]', msg.message);

  let el = document.getElementById('mw-flashforge-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mw-flashforge-toast';
    Object.assign(el.style, {
      position: 'fixed', right: '24px', bottom: 'calc(214px + env(safe-area-inset-bottom, 0px))', zIndex: '2147483647',
      background: '#202020', color: '#fff', border: '1px solid #3a3a3a', borderRadius: '10px',
      padding: '12px 16px', font: '14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      boxShadow: '0 8px 30px rgba(0,0,0,.35)', maxWidth: '380px'
    });
    document.documentElement.appendChild(el);
  }
  el.textContent = msg.message;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.remove(), 6000);
});
