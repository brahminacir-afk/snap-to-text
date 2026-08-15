(() => {
  if (window.__snapToTextActive) return;
  window.__snapToTextActive = true;

  const overlay = document.createElement("div");
  overlay.id = "snap-to-text-overlay";
  overlay.innerHTML = `
    <div class="snap-to-text-topbar">Drag to select text <span>Esc to cancel</span></div>
    <div class="snap-to-text-shade snap-to-text-top"></div>
    <div class="snap-to-text-shade snap-to-text-left"></div>
    <div class="snap-to-text-shade snap-to-text-right"></div>
    <div class="snap-to-text-shade snap-to-text-bottom"></div>
    <div class="snap-to-text-selection"></div>
    <div class="snap-to-text-status" role="status"></div>`;
  document.documentElement.append(overlay);

  const css = document.createElement("style");
  css.textContent = `
    #snap-to-text-overlay { position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; font: 14px system-ui, sans-serif; user-select: none; }
    .snap-to-text-shade { position: absolute; background: rgba(8, 12, 22, .52); pointer-events: none; }
    .snap-to-text-selection { position: absolute; border: 2px solid #71f6c1; box-shadow: 0 0 0 1px rgba(0,0,0,.45); pointer-events: none; }
    .snap-to-text-topbar, .snap-to-text-status { position: fixed; left: 50%; transform: translateX(-50%); color: #fff; background: #172033; border-radius: 999px; box-shadow: 0 3px 18px rgba(0,0,0,.35); }
    .snap-to-text-topbar { top: 18px; padding: 9px 14px; font-weight: 650; } .snap-to-text-topbar span { margin-left: 12px; color: #b8c4d9; font-weight: 400; font-size: 12px; }
    .snap-to-text-status { bottom: 22px; padding: 10px 15px; display: none; } .snap-to-text-status.show { display: block; }
  `;
  document.documentElement.append(css);

  const selection = overlay.querySelector(".snap-to-text-selection");
  const status = overlay.querySelector(".snap-to-text-status");
  const shades = {
    top: overlay.querySelector(".snap-to-text-top"), left: overlay.querySelector(".snap-to-text-left"),
    right: overlay.querySelector(".snap-to-text-right"), bottom: overlay.querySelector(".snap-to-text-bottom")
  };
  let start;
  let rect;

  function setStatus(message) { status.textContent = message; status.classList.add("show"); }
  function cleanUp() { window.removeEventListener("keydown", onKeyDown); overlay.remove(); css.remove(); delete window.__snapToTextActive; }
  async function sendToBackground(message) {
    // A response can come back undefined if the extension was reloaded and
    // this page still holds a stale connection — normalize that into a clear
    // error instead of letting a raw property access throw later.
    try {
      const response = await chrome.runtime.sendMessage({ target: "background", ...message });
      return response || { error: "The extension didn't respond. Try reloading this page." };
    } catch (error) {
      return { error: error?.message || "Lost connection to the extension. Try reloading this page." };
    }
  }
  async function copy(text) {
    // This document is focused (the user just interacted with it), so this
    // is more reliable than writing to the clipboard from an offscreen document.
    try { await navigator.clipboard.writeText(text); return; }
    catch (_) {
      const area = document.createElement("textarea"); area.value = text; area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
    }
  }
  function updateSelection(x, y) {
    rect = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    Object.assign(selection.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    Object.assign(shades.top.style, { left: "0", top: "0", width: "100%", height: `${rect.top}px` });
    Object.assign(shades.left.style, { left: "0", top: `${rect.top}px`, width: `${rect.left}px`, height: `${rect.height}px` });
    Object.assign(shades.right.style, { left: `${rect.left + rect.width}px`, top: `${rect.top}px`, right: "0", height: `${rect.height}px` });
    Object.assign(shades.bottom.style, { left: "0", top: `${rect.top + rect.height}px`, width: "100%", bottom: "0" });
  }

  overlay.addEventListener("pointerdown", (event) => { start = { x: event.clientX, y: event.clientY }; updateSelection(start.x, start.y); overlay.setPointerCapture(event.pointerId); });
  overlay.addEventListener("pointermove", (event) => { if (start) updateSelection(event.clientX, event.clientY); });
  overlay.addEventListener("pointerup", async () => {
    if (!start || rect.width < 8 || rect.height < 8) { start = null; return; }
    start = null;
    overlay.style.pointerEvents = "none";
    try {
      // Hide our selection UI before taking the screenshot, then let Chrome paint
      // the page once so the overlay is never included in the OCR image. Stays
      // hidden until the screenshot capture round-trip actually finishes.
      overlay.style.visibility = "hidden";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const captured = await sendToBackground({ type: "capture-screenshot" });
      overlay.style.visibility = "visible";
      if (captured.error) throw new Error(captured.error);
      setStatus("Reading text…");
      // OCR runs off-page, in the background service worker and an offscreen
      // document, so that a host page's CSP (e.g. Facebook blocking
      // worker-src) can't interfere.
      const result = await sendToBackground({
        type: "recognize",
        image: captured.image,
        rect,
        devicePixelRatio: window.devicePixelRatio || 1
      });
      if (result.error) throw new Error(result.error);
      if (!result.text) throw new Error("No text found in that selection.");
      await copy(result.text);
      setStatus("Text copied to clipboard ✓"); setTimeout(cleanUp, 1100);
    } catch (error) { overlay.style.visibility = "visible"; setStatus(error.message || "Could not read that selection."); setTimeout(cleanUp, 2500); }
  });
  function onKeyDown(event) { if (event.key === "Escape") cleanUp(); }
  window.addEventListener("keydown", onKeyDown);
})();
