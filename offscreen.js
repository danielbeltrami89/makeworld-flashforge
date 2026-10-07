chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'REVOKE_OBJECT_URL') {
    try { URL.revokeObjectURL(msg.url); } catch (_) {}
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type !== 'CONVERT_IN_OFFSCREEN') return;

  (async () => {
    try {
      const res = await fetch(msg.url, { credentials: 'include' });
      if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
      const original = new Uint8Array(await res.arrayBuffer());
      const { bytes, report } = await FlashForgeConverter.convert3mf(original);
      const blob = new Blob([bytes], { type: 'model/3mf' });
      const objectUrl = URL.createObjectURL(blob);
      sendResponse({ ok: true, objectUrl, report });
    } catch (error) {
      console.error('[FlashForge] conversion failed', error);
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true;
});
