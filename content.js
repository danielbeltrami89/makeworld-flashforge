(() => {
  const ID = 'mw-flashforge-ad5x-option';
  const LABEL = 'Download for FlashForge AD5X';
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
  const OPEN_WORDS = [
    'open',
    'abrir',
    'aberto',
    'ouvrir',
    'offnen',
    'öffnen',
    'apri',
    '打开',
    '開く',
    '열기'
  ];
  let injecting = false;
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

  function matchesActionText(text, kind) {
    if (!text || text.includes(norm(LABEL))) return false;
    const hasDownloadWord = includesAny(text, DOWNLOAD_WORDS);

    if (kind === '3mf') {
      return text.includes('3mf') && (hasDownloadWord || !text.includes('stl'));
    }
    if (kind === 'stlCad') {
      return (text.includes('stl') || text.includes('cad')) && hasDownloadWord;
    }
    if (kind === 'bambu') {
      return text.includes('bambu') && text.includes('studio') && includesAny(text, OPEN_WORDS);
    }
    return false;
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

  function scoreCandidate(el, target, text, kind) {
    let score = 0;
    if (target.matches('button, a')) score += 50;
    if (target.matches('[role="menuitem"], [role="option"], [role="button"]')) score += 40;
    if (target.hasAttribute('tabindex')) score += 10;
    if (target.closest('[role="menu"], [role="listbox"]')) score += 15;

    const exactText = kind === '3mf'
      ? ['download 3mf', 'baixar 3mf', 'descarregar 3mf', 'descargar 3mf']
      : kind === 'stlCad'
        ? ['download stl/cad files', 'baixar arquivos stl/cad', 'descarregar ficheiros stl/cad']
        : ['open in bambu studio', 'abrir no bambu studio'];
    if (exactText.some(item => text === norm(item))) score += 30;

    if (text.length <= 35) score += 20;
    else if (text.length <= 90) score += 8;
    else score -= Math.min(50, Math.floor(text.length / 20));

    const rect = target.getBoundingClientRect();
    if (rect.height <= 72) score += 10;
    else if (rect.height > 140) score -= 30;
    if (rect.width <= Math.min(window.innerWidth * 0.9, 560)) score += 5;
    else score -= 15;
    if (norm(target.textContent) === text) score += 8;
    if (el === target) score += 4;
    return score;
  }

  function findAction(kind, root = document) {
    let best = null;
    const candidates = root.querySelectorAll(SEARCH_SELECTOR);
    for (const el of candidates) {
      if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
      if (el.id === ID || el.closest(`#${ID}`)) continue;

      const text = norm(el.textContent);
      if (!matchesActionText(text, kind)) continue;

      const target = clickable(el);
      if (!(target instanceof HTMLElement) || !isVisible(target)) continue;
      if (target.id === ID || target.closest(`#${ID}`)) continue;

      const score = scoreCandidate(el, target, text, kind);
      if (!best || score > best.score) best = { target, score };
    }
    return best?.target || null;
  }

  function findNearbyAction(anchor, kind) {
    for (let cur = anchor?.parentElement; cur && cur !== document.body; cur = cur.parentElement) {
      const found = findAction(kind, cur);
      if (found) return found;
    }
    return null;
  }

  function isValidInjectedItem(item) {
    if (!(item instanceof HTMLElement) || !isVisible(item)) return false;
    const parent = item.parentElement;
    if (!parent) return false;
    return Array.from(parent.children).some(child => (
      child !== item &&
      child instanceof HTMLElement &&
      isVisible(child) &&
      matchesActionText(norm(child.textContent), 'stlCad')
    ));
  }

  function hasInjectedItemInOpenMenu() {
    let valid = false;
    for (const item of document.querySelectorAll(`#${ID}`)) {
      if (isValidInjectedItem(item)) valid = true;
      else item.remove();
    }
    return valid;
  }

  function findInsertionParent(source, required = []) {
    for (let cur = source?.parentElement; cur && cur !== document.body; cur = cur.parentElement) {
      if (required.some(el => el && !cur.contains(el))) continue;
      const visibleChildren = Array.from(cur.children).filter(child => child instanceof HTMLElement && isVisible(child));
      if (visibleChildren.length >= 2) return cur;
    }
    return source?.parentElement || null;
  }

  function replaceVisibleText(item) {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      if (norm(walker.currentNode.nodeValue)) textNodes.push(walker.currentNode);
    }

    const main = textNodes.find(node => {
      const text = norm(node.nodeValue);
      return matchesActionText(text, 'stlCad') || matchesActionText(text, '3mf') || matchesActionText(text, 'bambu');
    }) || textNodes[0];

    if (!main) {
      item.textContent = LABEL;
      return;
    }

    for (const node of textNodes) {
      node.nodeValue = node === main ? LABEL : '';
    }
  }

  async function startConversion(preferredOriginal) {
    const existing = document.getElementById(ID);
    const original = (
      preferredOriginal instanceof HTMLElement &&
      document.contains(preferredOriginal) &&
      isVisible(preferredOriginal)
    )
      ? preferredOriginal
      : findNearbyAction(existing, '3mf') || findAction('3mf');
    if (!original) {
      alert('Não encontrei a opção “Download 3MF”. Feche e abra o menu de download novamente.');
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'ARM_FLASHFORGE_DOWNLOAD' });
    if (!response?.ok) {
      alert('Não foi possível iniciar a conversão. Recarregue a página e tente novamente.');
      return;
    }

    original.click();
  }

  function inject() {
    if (injecting || hasInjectedItemInOpenMenu()) return;
    injecting = true;
    try {
      const stl = findAction('stlCad');
      if (!stl) return;

      const original3mf = findNearbyAction(stl, '3mf') || findAction('3mf');
      if (!original3mf) return;

      const parent = findInsertionParent(stl);
      if (!parent) return;

      const item = stl.cloneNode(true);
      item.id = ID;
      item.removeAttribute('href');
      item.removeAttribute('download');
      item.removeAttribute('disabled');
      item.removeAttribute('aria-disabled');
      item.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      item.setAttribute('role', stl.getAttribute('role') || 'menuitem');
      if (item.tabIndex < 0) item.tabIndex = 0;

      replaceVisibleText(item);

      item.style.borderTop = item.style.borderTop || '1px solid rgba(255,255,255,.08)';
      item.style.fontWeight = '600';
      item.style.color = '#32d74b';
      item.title = 'Baixa o 3MF e converte localmente para um projeto da FlashForge AD5X';
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startConversion(original3mf);
      }, true);

      if (stl.parentElement === parent) stl.insertAdjacentElement('afterend', item);
      else parent.appendChild(item);
    } finally {
      injecting = false;
    }
  }

  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      inject();
    });
  }

  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'FLASHFORGE_STATUS') return;
  let el = document.getElementById('mw-flashforge-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mw-flashforge-toast';
    Object.assign(el.style, {
      position: 'fixed', right: '24px', bottom: '24px', zIndex: '2147483647',
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
