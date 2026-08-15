# Snap to Text

A privacy-first Manifest V3 Chrome extension that lets you select any visible area of a web page, recognizes its text locally with bundled Tesseract OCR, and copies the result directly to your clipboard.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Pin **Snap to Text**.

## Use

1. Open any web page with text in an image or screenshot.
2. Click the Snap to Text toolbar icon.
3. Drag over the text you want.
4. Wait for **Text copied to clipboard** and paste anywhere.

Everything stays on your device. The extension includes its English OCR language model, so it does not depend on Chrome's optional `TextDetector` API or an internet connection. It can only capture the visible part of a normal web page; Chrome's internal pages and protected browser surfaces cannot be captured by extensions.

## How it avoids site Content-Security-Policy issues

Some sites (e.g. Facebook) send a strict `worker-src` CSP that blocks a content script from spinning up a Web Worker at all, even one bundled inside the extension. To work around this, only the selection overlay runs in the page; the screenshot cropping and OCR happen in a Chrome **offscreen document** (`offscreen.html`/`offscreen.js`), which runs at the extension's own origin and isn't subject to the host page's CSP. The recognized text is then copied to the clipboard back in the page itself, since that document is focused — offscreen documents never are, which makes clipboard writes from them unreliable.
