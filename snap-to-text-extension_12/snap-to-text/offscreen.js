chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "offscreen" || message.type !== "run-ocr") return;
  console.log("[Snap to Text][offscreen] run-ocr received");
  handleOcr(message)
    .then((text) => { console.log("[Snap to Text][offscreen] OCR succeeded"); sendResponse({ text }); })
    .catch((error) => { console.error("[Snap to Text][offscreen] OCR failed", error); sendResponse({ error: error.message || "Could not read that selection." }); });
  return true; // keep the message channel open for the async response
});

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out ${label} after ${ms / 1000}s.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function handleOcr({ image, rect, devicePixelRatio }) {
  // This document only crops the screenshot and runs OCR (both need APIs a
  // service worker doesn't have). The clipboard write happens back in the
  // content script, whose document is actually focused — offscreen documents
  // never are, which makes clipboard writes from here unreliable.
  console.log("[Snap to Text][offscreen] cropping screenshot", rect);
  const blob = await withTimeout(cropToBlob(image, rect, devicePixelRatio || 1), 15000, "cropping the screenshot");
  console.log("[Snap to Text][offscreen] cropped, blob size", blob.size);
  const text = await withTimeout(recognize(blob), 60000, "running OCR");
  if (!text) throw new Error("No text found in that selection.");
  return text;
}

async function cropToBlob(imageDataUrl, rect, ratio) {
  const response = await fetch(imageDataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(rect.width * ratio)),
    Math.max(1, Math.round(rect.height * ratio))
  );
  const context = canvas.getContext("2d");
  context.drawImage(
    bitmap,
    Math.round(rect.left * ratio),
    Math.round(rect.top * ratio),
    Math.round(rect.width * ratio),
    Math.round(rect.height * ratio),
    0,
    0,
    canvas.width,
    canvas.height
  );
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

async function recognize(imageBlob) {
  if (typeof Tesseract === "undefined") throw new Error("The bundled OCR engine could not start.");
  console.log("[Snap to Text][offscreen] creating Tesseract worker");
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: chrome.runtime.getURL("vendor/worker.min.js"),
    corePath: chrome.runtime.getURL("vendor/core/"),
    langPath: chrome.runtime.getURL("vendor/lang/"),
    workerBlobURL: false,
    logger: (m) => console.log("[Snap to Text][tesseract]", m.status, m.progress)
  });
  console.log("[Snap to Text][offscreen] worker ready, recognizing");
  try {
    const { data } = await worker.recognize(imageBlob);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}
