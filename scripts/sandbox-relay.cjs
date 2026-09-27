// Local development adapter for Dodo's documented CLI relay protocol.
// Reference: https://github.com/dodopayments/dodopayments-cli
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('next/dist/compiled/ws');
const key = fs.readFileSync(process.env.DODO_SANDBOX_KEY_FILE || path.join(process.env.TEMP, 'dragonpixel-dodo-sandbox-key.txt'), 'utf8').trim();
const socket = new WebSocket('wss://wsserver.dodopayments.tech/connect', { headers: { 'api-key': key } });
socket.on('open', () => console.log('Dodo TEST webhook relay connected to localhost:3101.'));
socket.on('error', () => console.error('Dodo test relay connection failed. No credentials logged.'));
socket.on('close', code => console.log(`Dodo test relay closed (${code}). Restart npm run dev:sandbox to reconnect.`));
socket.on('message', async bytes => {
  try {
    const event = JSON.parse(bytes.toString());
    if (!event.requestId) return;
    const response = await fetch('http://127.0.0.1:3101/api/webhooks/dodo', { method: 'POST', headers: { ...event.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(event.payload), signal: AbortSignal.timeout(25000) });
    const body = await response.json();
    console.log(`Dodo test ${event.payload.type}: HTTP ${response.status}`);
    // Receipt for local replay checks only; never source-controlled or printed.
    if (response.ok) fs.writeFileSync(path.join(process.env.TEMP, 'dragonpixel-last-test-webhook.json'), JSON.stringify({ headers: event.headers, payload: event.payload }), { mode: 0o600 });
    socket.send(JSON.stringify({ type: 'webhook_response', requestId: event.requestId, status: response.status, body, headers: Object.fromEntries(response.headers) }));
  } catch { console.error('Test webhook forwarding failed; check the local server.'); }
});
