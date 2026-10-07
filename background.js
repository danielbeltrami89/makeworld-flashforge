let armedUntil = 0;
let sourceTabId = null;
const OFFSCREEN_PATH = 'offscreen.html';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ARM_FLASHFORGE_DOWNLOAD') {
    armedUntil = Date.now() + 15000;
    sourceTabId = sender.tab?.id ?? null;
    sendResponse({ ok: true });
    return true;
  }
});

function is3mf(item) {
  const name = (item.filename || '').toLowerCase();
  const url = (item.finalUrl || item.url || '').toLowerCase();
  return name.endsWith('.3mf') || /\.3mf(?:$|[?#])/.test(url) || item.mime === 'model/3mf';
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts?.({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url]
  });
  if (contexts?.length) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['BLOBS'],
      justification: 'Converter o 3MF localmente e criar um Blob para download.'
    });
  } catch (e) {
    // Another event may have created it first.
    if (!String(e).includes('Only a single offscreen')) throw e;
  }
}

async function notify(tabId, message) {
  if (tabId == null) return;
  try { await chrome.tabs.sendMessage(tabId, { type: 'FLASHFORGE_STATUS', message }); } catch (_) {}
}

chrome.downloads.onCreated.addListener(async (item) => {
  if (Date.now() > armedUntil || !is3mf(item)) return;
  armedUntil = 0;
  const tabId = sourceTabId;
  sourceTabId = null;

  try {
    await chrome.downloads.cancel(item.id);
    await chrome.downloads.erase({ id: item.id });
    await ensureOffscreen();

    const filename = ((item.filename || 'makerworld.3mf').split(/[\\/]/).pop() || 'makerworld.3mf')
      .replace(/\.3mf$/i, '_AD5X.3mf');

    await notify(tabId, 'Baixando e convertendo o 3MF localmente…');
    const result = await chrome.runtime.sendMessage({
      type: 'CONVERT_IN_OFFSCREEN',
      url: item.finalUrl || item.url
    });
    if (!result?.ok) throw new Error(result?.error || 'Falha desconhecida na conversão');

    const downloadId = await chrome.downloads.download({
      url: result.objectUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
    console.info('[FlashForge] conversion report', result.report, 'download', downloadId);
    await notify(tabId, `Pronto: ${filename}`);
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'REVOKE_OBJECT_URL', url: result.objectUrl }).catch(() => {});
    }, 60000);
  } catch (error) {
    console.error('[FlashForge] conversion bootstrap failed', error);
    await notify(tabId, 'Falha ao iniciar a conversão: ' + (error?.message || error));
  }
});
