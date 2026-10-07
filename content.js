(() => {
  const BUTTON_ID = 'mw-flashforge-ad5x-button';
  const STYLE_ID = 'mw-flashforge-ad5x-style';
  const HIGHLIGHT_CLASS = 'mw-flashforge-ad5x-target';
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

  function cleanItemName(value) {
    return (value || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*(?:\||-|–|—)\s*(?:MakerWorld|Bambu Lab).*$/i, '')
      .replace(/\s*(?:\||-|–|—)\s*(?:Modelo 3D|3D Model).*$/i, '')
      .trim();
  }

  function titleCaseSlug(value) {
    return value.replace(/\p{L}[\p{L}\p{N}]*/gu, word => {
      if (word.length <= 2 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  function itemNameFromUrl() {
    const match = location.pathname.match(/\/models\/([^/?#]+)/i);
    if (!match) return '';
    const decoded = decodeURIComponent(match[1]);
    const withoutId = decoded.replace(/^\d+[-_]?/, '');
    return cleanItemName(titleCaseSlug(withoutId.replace(/[-_]+/g, ' ')));
  }

  function resemblesSlug(candidate, slugName) {
    if (!candidate || !slugName) return false;
    const candidateNorm = norm(candidate);
    const tokens = norm(slugName).split(' ').filter(token => token.length > 2 || /^\d+$/.test(token));
    if (!tokens.length) return false;
    const matches = tokens.filter(token => candidateNorm.includes(token)).length;
    return matches >= Math.min(tokens.length, 3);
  }

  function extractItemName() {
    const slugName = itemNameFromUrl();
    const candidates = [
      document.querySelector('meta[property="og:title"]')?.content,
      document.querySelector('meta[name="twitter:title"]')?.content,
      ...Array.from(document.querySelectorAll('h1')).filter(isVisible).map(el => el.textContent),
      document.title
    ].map(cleanItemName).filter(Boolean);

    if (slugName) {
      return candidates.find(candidate => resemblesSlug(candidate, slugName)) || slugName;
    }
    return candidates[0] || '';
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

  function resetButton(button) {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    clearTimeout(button._resetTimer);
    const main = button.querySelector('[data-main]');
    if (main) main.textContent = LABEL;
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
  }

  function highlightDownloadTarget(target, button) {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
    target.classList.add(HIGHLIGHT_CLASS);
    clearTimeout(button._highlightTimer);
    button._highlightTimer = setTimeout(() => {
      target.classList.remove(HIGHLIGHT_CLASS);
    }, 22000);
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
      showStatus('Armando a conversao...');
      const clickedAt = new Date(Date.now() - 1000).toISOString();
      const itemName = extractItemName();
      log('item name detected', itemName);
      const response = await chrome.runtime.sendMessage({ type: 'ARM_FLASHFORGE_DOWNLOAD', clickedAt, itemName });
      log('background arm response', response);
      if (!response?.ok) {
        resetButton(button);
        alert('Não foi possível iniciar a conversão. Recarregue a página e tente novamente.');
        return;
      }

      highlightDownloadTarget(original, button);
      button.querySelector('[data-main]').textContent = 'Clique 3MF';
      showStatus('Conversao armada. Agora clique no botao verde "Baixar 3MF" do MakerWorld.');
      clearTimeout(button._resetTimer);
      button._resetTimer = setTimeout(() => {
        resetButton(button);
        showStatus('Nao recebi nenhum download 3MF. Clique em "Baixar AD5X" e depois no botao verde "Baixar 3MF".');
      }, 24000);
    } catch (error) {
      log('conversion start failed', error);
      resetButton(button);
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
      .${HIGHLIGHT_CLASS} {
        outline: 3px solid #02c91f !important;
        outline-offset: 4px !important;
        box-shadow: 0 0 0 5px rgba(2, 201, 31, .26), 0 0 26px rgba(2, 201, 31, .44) !important;
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
        resetButton(button);
      }, 120000);
      if (main) main.textContent = 'Convertendo...';
    } else if (message.startsWith('Pronto') || message.startsWith('Falha') || message.startsWith('Nao detectei')) {
      resetButton(button);
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
