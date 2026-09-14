// External CI probe: uses Chromium's debugging endpoint, not production test hooks.
import assert from 'node:assert/strict';
const [port, mode, token] = process.argv.slice(2);
const deadline = Date.now() + 45000;
let target;
while (Date.now() < deadline) {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = pages.find(p => p.type === 'page' && p.url.startsWith('http://tauri.localhost'));
    if (target) break;
  } catch { /* WebView is still starting. */ }
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.ok(target, 'Portable WebView did not expose its application page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('CDP timeout')); }, 10000);
    function listener(event) {
      const reply = JSON.parse(event.data);
      if (reply.id !== requestId) return;
      clearTimeout(timer); socket.removeEventListener('message', listener);
      if (reply.error || reply.result.exceptionDetails) reject(new Error(JSON.stringify(reply)));
      else resolve(reply.result.result.value);
    }
    socket.addEventListener('message', listener);
    socket.send(JSON.stringify({id: requestId, method:'Runtime.evaluate', params:{expression, returnByValue:true}}));
  });
}
try {
  let ready = false;
  while (Date.now() < deadline) {
    ready = await evaluate(`document.body.innerText.includes('Buscar AgentPad13') && document.body.innerText.includes('AgentPad13 Studio')`);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Studio home screen did not render');
  const key = JSON.stringify('agentpad13.ci-portable-probe');
  if (mode === 'write') await evaluate(`localStorage.setItem(${key}, ${JSON.stringify(token)})`);
  assert.equal(await evaluate(`localStorage.getItem(${key})`), token, 'Portable data did not persist');
  console.log(JSON.stringify({mode, rendered:true, storage:true}));
} finally { socket.close(); }
