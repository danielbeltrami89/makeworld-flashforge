let armedUntil = 0;
let sourceTabId = null;
let armTimeout = null;
let handlingDownloadId = null;
let armStartedAt = null;

const ARM_WINDOW_MS = 20000;
const OFFSCREEN_PATH = 'offscreen.html';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ARM_FLASHFORGE_DOWNLOAD') {
    resetArm();
    armedUntil = Date.now() + ARM_WINDOW_MS;
    sourceTabId = sender.tab?.id ?? null;
    armStartedAt = msg.clickedAt || new Date(Date.now() - 1000).toISOString();

    notify(sourceTabId, 'Conversao armada. Clique no botao verde "Baixar 3MF" do MakerWorld.');
    scanRecentDownloads();
    armTimeout = setTimeout(() => {
      if (Date.now() <= armedUntil && handlingDownloadId == null) {
        const tabId = sourceTabId;
        resetArm();
        notify(tabId, 'Nao detectei nenhum download 3MF. Clique em "Baixar AD5X" e depois no botao verde "Baixar 3MF".');
      }
    }, ARM_WINDOW_MS + 500);

    sendResponse({ ok: true });
    return true;
  }
});

function resetArm() {
  armedUntil = 0;
  sourceTabId = null;
  armStartedAt = null;
  if (armTimeout) clearTimeout(armTimeout);
  armTimeout = null;
}

function is3mf(item) {
  const name = (item.filename || '').toLowerCase();
  const url = (item.finalUrl || item.url || '').toLowerCase();
  const mime = (item.mime || '').toLowerCase();
  return name.endsWith('.3mf') || /\.3mf(?:$|[?#])/.test(url) || mime === 'model/3mf';
}

function looksRelevant(item) {
  const text = [
    item.filename,
    item.finalUrl,
    item.url,
    item.referrer,
    item.mime
  ].filter(Boolean).join(' ').toLowerCase();
  return is3mf(item) || /(makerworld|bambulab|bblmw|3mf)/.test(text);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDownloadItem(id) {
  const items = await chrome.downloads.search({ id });
  return items?.[0] || null;
}

async function waitForDownloadMetadata(id) {
  let latest = null;
  for (const wait of [0, 200, 500, 1000]) {
    if (wait) await delay(wait);
    latest = await getDownloadItem(id);
    if (!latest) continue;
    if (is3mf(latest) || latest.filename || latest.finalUrl) break;
  }
  return latest;
}

async function scanRecentDownloads() {
  const startedAfter = armStartedAt;
  if (!startedAfter || handlingDownloadId != null) return;
  try {
    const items = await chrome.downloads.search({
      startedAfter,
      orderBy: ['-startTime'],
      limit: 10
    });
    for (const item of items || []) {
      if (Date.now() > armedUntil || handlingDownloadId != null) return;
      const latest = await waitForDownloadMetadata(item.id);
      if (!latest || !looksRelevant(latest)) continue;
      await processDownload(latest);
      return;
    }
  } catch (error) {
    console.warn('[FlashForge] recent download scan failed', error);
  }
}

function convertedFilename(item) {
  const raw = ((item.filename || '').split(/[\\/]/).pop() || 'makerworld.3mf');
  const name = raw.replace(/\.[^.]+$/i, '') || 'makerworld';
  return `${name}_AD5X.3mf`;
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

async function processDownload(item) {
  handlingDownloadId = item.id;
  const tabId = sourceTabId;
  resetArm();

  try {
    const sourceUrl = item.finalUrl || item.url;
    if (!sourceUrl) throw new Error('O Chrome criou um download, mas nao expos a URL do arquivo.');
    if (sourceUrl.startsWith('blob:')) {
      throw new Error('O MakerWorld gerou um download blob: que a extensao ainda nao consegue reler.');
    }

    await notify(tabId, 'Download detectado. Convertendo para FlashForge AD5X...');
    try { await chrome.downloads.cancel(item.id); } catch (_) {}
    try { await chrome.downloads.erase({ id: item.id }); } catch (_) {}
    await ensureOffscreen();

    const filename = convertedFilename(item);
    const result = await chrome.runtime.sendMessage({
      type: 'CONVERT_IN_OFFSCREEN',
      url: sourceUrl
    });
    if (!result?.ok) throw new Error(result?.error || 'Falha desconhecida na conversao');

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
    await notify(tabId, 'Falha ao iniciar a conversao: ' + (error?.message || error));
  } finally {
    handlingDownloadId = null;
  }
}

chrome.downloads.onCreated.addListener(async (item) => {
  if (Date.now() > armedUntil || handlingDownloadId != null) return;

  try {
    const latest = await waitForDownloadMetadata(item.id);
    if (handlingDownloadId != null) return;
    if (!latest || !looksRelevant(latest)) return;
    await processDownload(latest);
  } catch (error) {
    const tabId = sourceTabId;
    resetArm();
    console.error('[FlashForge] download capture failed', error);
    await notify(tabId, 'Falha ao capturar o download: ' + (error?.message || error));
  }
});
