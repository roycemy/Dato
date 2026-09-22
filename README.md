# Dato

**Dato stops passwords, personal details, financial information, source code, and other sensitive text before it gets sent to ChatGPT, Claude, or Gemini. Everything is checked on your computer. Dato does not send or store your prompts.**

## Install Dato in Chrome

1. Click **[Download Dato](https://github.com/roycemy/Dato/archive/refs/heads/main.zip)**.
2. Open the downloaded ZIP file, then open the new `Dato-main` folder.
3. In Chrome, go to `chrome://extensions`.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Choose the `extension` folder inside `Dato-main`.
7. Open ChatGPT, Claude, or Gemini. Look for **Dato · Protected locally** in the bottom-right corner.

Keep the `Dato-main` folder on your computer. Chrome needs it to run Dato.

## Quick test

Paste this fake example into ChatGPT, Claude, or Gemini:

```text
Summarize this fake deployment note:
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
Customer email: dana@example.com
Test card: 4111 1111 1111 1111
```

Dato should stop the message before it sends. These are public test values, not real credentials.

## What Dato does

- Checks typed and pasted prompts on ChatGPT, Claude, and Gemini.
- Detects passwords, API keys, personal information, payment details, source code, contracts, and confidential language.
- Lets you warn, redact, block, or intentionally send anyway.
- Runs entirely inside your browser and makes no network requests.
- Stores only your policy choices in Chrome's local extension storage.

## Current limits

- Dato checks prompt text, not files uploaded to AI sites.
- Detection is best-effort and is not a certified security control.
- ChatGPT, Claude, or Gemini interface changes may require a Dato update.
- Until Dato reaches the Chrome Web Store, updates must be downloaded and loaded manually.

## Developer notes

The installable Manifest V3 extension is in [`extension/`](extension/README.md). The separate root web app is a product demo and dashboard. Dato is a defensive security tool and its synthetic assessment uses fabricated data only.
