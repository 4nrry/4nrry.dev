// Screenshot a page after an explicit wait, driving Chrome over the DevTools
// protocol. Needed for pages whose work never goes idle (WebGL, infinite
// animations), where --virtual-time-budget hangs forever.
//
// usage: node shot.mjs <url> <out.png> [waitMs] [width] [height] [hideSelector] [scheme]
//   scheme: "light" | "dark" emulates prefers-color-scheme; omit to use the default.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [
  url,
  out,
  waitMs = '12000',
  width = '1280',
  height = '800',
  hideSelector = '',
  scheme = '',
] = process.argv.slice(2);

const PORT = 9222 + Math.floor(process.uptime() * 10) % 100;

const { spawn } = await import('node:child_process');
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--hide-scrollbars',
  '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`,
  `--window-size=${width},${height}`,
  // Reused across runs so heavy assets (3D models, fonts) come from disk cache.
  `--user-data-dir=${join(tmpdir(), '4nrry-dev-shot-profile')}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

let page = null;
for (let i = 0; i < 60 && !page; i++) {
  await sleep(500);
  try {
    page = (await targets()).find((t) => t.type === 'page');
  } catch {
    /* not up yet */
  }
}
if (!page) {
  chrome.kill();
  throw new Error('chrome did not expose a page target');
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
if (scheme === 'light' || scheme === 'dark') {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
}
await send('Page.navigate', { url });
await sleep(Number(waitMs));

if (hideSelector) {
  await send('Runtime.evaluate', {
    expression: `document.querySelectorAll(${JSON.stringify(hideSelector)})
      .forEach(el => el.style.setProperty('display', 'none', 'important'));`,
  });
  await sleep(400);
}

const { data } = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(data, 'base64'));
console.log(`saved ${out}`);

ws.close();
chrome.kill();
process.exit(0);
