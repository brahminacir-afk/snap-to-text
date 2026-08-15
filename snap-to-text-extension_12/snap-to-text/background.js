chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (error) {
    console.warn("Snap to Text cannot run on this page.", error);
  }
});

let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS"],
    justification: "Crop the captured screenshot and run the local OCR worker outside the page, so a host page's CSP can't block it."
  });
  try {
    await creatingOffscreen;
  } catch (error) {
    // Another call may have created it in the meantime; only rethrow real failures.
    if (!/already exists|single offscreen/i.test(error?.message || "")) throw error;
  } finally {
    creatingOffscreen = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Snap to Text][background] received message", message);
  if (message?.target !== "background") return;

  if (message.type === "capture-screenshot") {
    (async () => {
      try {
        const image = await chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: "png" });
        console.log("[Snap to Text][background] capture-screenshot succeeded, image length", image?.length);
        sendResponse({ image });
      } catch (error) {
        console.error("[Snap to Text][background] capture-screenshot failed", error);
        sendResponse({ error: error?.message || "Could not capture this tab." });
      }
    })();
    return true;
  }

  if (message.type === "recognize") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        console.log("[Snap to Text][background] offscreen document ready, forwarding for OCR");
        const result = await chrome.runtime.sendMessage({
          target: "offscreen",
          type: "run-ocr",
          image: message.image,
          rect: message.rect,
          devicePixelRatio: message.devicePixelRatio
        });
        console.log("[Snap to Text][background] OCR result", result);
        sendResponse(result || { error: "No response from the OCR worker." });
      } catch (error) {
        console.error("[Snap to Text][background] recognize failed", error);
        sendResponse({ error: error?.message || "Could not read that selection." });
      }
    })();
    return true;
  }
});
