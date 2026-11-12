/* ===== YANGILANISH YUKLAGICHI: yangi versiya (userData/app-update) bo'lsa — o'shani ishga tushiramiz ===== */
if (!global.__jarvisBoot) {
  global.__jarvisBoot = true;
  try {
    const { app: A0 } = require('electron'), p0 = require('path'), f0 = require('fs');
    const ud = p0.join(A0.getPath('appData'), 'Jarvis', 'app-update');
    const ver = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
    const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 4; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
    const mine = require('./package.json').version, um = p0.join(ud, 'main.js');
    if (__dirname !== ud && f0.existsSync(um) && newer(JSON.parse(f0.readFileSync(p0.join(ud, 'package.json'), 'utf8')).version, mine)) {
      global.__jarvisBase = __dirname;
      require(um);
      return;
    }
  } catch (e) { try { console.error('update boot', e); } catch (er) {} }
}
const { app, BrowserWindow, ipcMain, shell, session, safeStorage, protocol, net, desktopCapturer, screen: eScreen, Tray, Menu, nativeImage, Notification } = require('electron');
const BASE_APP = global.__jarvisBase || __dirname;  // asl o'rnatilgan papka (katta vendor fayllar shu yerda)
const { pathToFileURL } = require('url');
protocol.registerSchemesAsPrivileged([{ scheme: 'jarvis', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const crypto = require('crypto'), http = require('http');
const path = require('path'), fs = require('fs');

const CFG_FILE = () => path.join(app.getPath('userData'), 'jarvis-config.json');
const STORE_FILE = () => path.join(app.getPath('userData'), 'jarvis-store.json');

const DEFAULT_PROVIDERS = [
  { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', key: '', enabled: true,
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], keyUrl: 'https://console.groq.com/keys', note: 'Juda tez. Ovozni matnga aylantirish (Whisper) ham shu kalit bilan ishlaydi.' },
  { id: 'gemini', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: '', enabled: true,
    models: ['gemini-flash-latest', 'gemini-flash-lite-latest'], keyUrl: 'https://aistudio.google.com/apikey', note: 'Google hisobingiz bilan bepul kalit. O\'zbek tilini yaxshi biladi.' },
  { id: 'openrouter', name: 'OpenRouter (Qwen, GLM, Kimi…)', base: 'https://openrouter.ai/api/v1', key: '', enabled: true,
    models: ['openrouter/free'], keyUrl: 'https://openrouter.ai/keys', note: '"openrouter/free" — bepul modellardan birini o\'zi tanlaydi. "Modellarni yuklash" bilan aniq modelni (":free" bilan tugaydiganlar) tanlash mumkin.' },
  { id: 'nvidia', name: 'NVIDIA NIM (Kimi, GLM)', base: 'https://integrate.api.nvidia.com/v1', key: '', enabled: true,
    models: ['moonshotai/kimi-k2.6', 'z-ai/glm-5.3'], keyUrl: 'https://build.nvidia.com/settings/api-keys', note: 'Model nomlari tez-tez o\'zgaradi — "Modellarni yuklash" bilan tekshiring.' },
  { id: 'cerebras', name: 'Cerebras', base: 'https://api.cerebras.ai/v1', key: '', enabled: false,
    models: ['gpt-oss-120b'], keyUrl: 'https://cloud.cerebras.ai', note: 'Juda tez, bepul limit bilan.' },
  { id: 'ollama', name: 'Ollama — OFLAYN (internetsiz)', base: 'http://127.0.0.1:11434/v1', key: '', enabled: true, local: true,
    models: ['qwen3:8b'], keyUrl: 'https://ollama.com/download', note: 'Internet yo\'q paytda ishlaydi. Kompyuterga Ollama o\'rnating va "ollama pull qwen3:8b" buyrug\'i bilan model yuklang (~5 GB). Kalit shart emas.' },
  { id: 'claude', name: 'Claude API (pullik)', base: 'https://api.anthropic.com/v1', key: '', enabled: false,
    models: ['claude-sonnet-5-5'], keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Ixtiyoriy, pullik. Eng sifatli javoblar.' }
];
function loadCfg() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (e) {}
  const provs = DEFAULT_PROVIDERS.map(d => Object.assign({}, d, (c.providers || []).find(p => p.id === d.id) || {}));
  // keep user order
  if (c.order) provs.sort((a, b) => (c.order.indexOf(a.id) + 1 || 99) - (c.order.indexOf(b.id) + 1 || 99));
  return { providers: provs, sttLang: c.sttLang || 'uz', order: provs.map(p => p.id) };
}
function rawCfg() { try { return JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (e) { return {}; } }
function saveCfg(c) { let raw = {}; try { raw = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (e) {} fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify({ ...raw, ...c }, null, 1)); }
const cooldown = {};   // key: provider/model -> until ms

async function online() { try { const r = await fetchT('https://www.google.com/generate_204', { method: 'GET' }, 5000); return r.status === 204 || r.ok; } catch (e) { return false; } }
ipcMain.handle('net:check', () => online());
function headers(p) {
  const h = { 'Content-Type': 'application/json' }; if (p.key) h.Authorization = 'Bearer ' + p.key;
  if (p.id === 'openrouter') { h['HTTP-Referer'] = 'https://jarvis.local'; h['X-Title'] = 'Jarvis Desktop'; }
  if (p.id === 'claude') { h['x-api-key'] = p.key; h['anthropic-version'] = '2023-06-01'; }
  return h;
}
async function fetchT(url, opts, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 90000);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}
const aborted = new Set();
ipcMain.handle('llm:abort', (e, id) => { aborted.add(id); });

const VISION = { gemini: null, groq: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'], openrouter: ['google/gemma-3-27b-it:free', 'openrouter/free'], nvidia: ['meta/llama-4-maverick-17b-128e-instruct'], claude: null };
ipcMain.handle('llm:chat', async (e, { id, messages, tools, tier, vision }) => {
  const cfg = loadCfg();
  let provs = cfg.providers.filter(p => p.enabled && (p.key || p.local) && p.models && p.models.length);
  if (vision) { provs = provs.filter(p => p.key && p.id in VISION).sort((a, b) => (a.id === 'gemini' ? -1 : 0) - (b.id === 'gemini' ? -1 : 0)); if (!provs.length) return { error: { code: 'no_keys', message: 'Rasmni tushunish uchun Google Gemini yoki Groq kaliti kerak (⚙ Modellar).' } }; }
  let netErrs = 0, attempts = 0;
  if (!provs.length) return { error: { code: 'no_keys', message: 'Hech qanday model sozlanmagan. "⚙ Modellar" oynasida kamida bitta bepul API kalit kiriting.' } };
  const errors = [];
  for (const p of provs) {
    const models = vision && VISION[p.id] ? VISION[p.id] : tier === 'quick' ? [...p.models].reverse() : p.models;
    for (const m of models) {
      if (aborted.has(id)) { aborted.delete(id); return { error: { code: 'aborted', message: 'to\'xtatildi' } }; }
      const ck = p.id + '/' + m;
      if (cooldown[ck] && cooldown[ck] > Date.now()) { errors.push(`${p.name} ${m}: kutishda`); continue; }
      attempts++;
      const body = { model: m, messages, max_tokens: 4096 };
      if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
      try {
        const r = await fetchT(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: headers(p), body: JSON.stringify(body) }, 120000);
        const txt = await r.text();
        if (!r.ok) {
          const ra = parseInt(r.headers.get('retry-after') || '0', 10);
          if (r.status === 429 || r.status >= 500) cooldown[ck] = Date.now() + Math.max(30, Math.min(600, ra || 60)) * 1000;
          if (r.status === 401 || r.status === 403) cooldown[ck] = Date.now() + 10 * 60 * 1000;
          errors.push(`${p.name} ${m}: ${r.status} ${txt.slice(0, 160)}`);
          continue; // next model / provider
        }
        const j = JSON.parse(txt);
        const msg = j.choices && j.choices[0] && j.choices[0].message;
        if (!msg) { errors.push(`${p.name} ${m}: bo'sh javob`); continue; }
        if (typeof msg.content === 'string') msg.content = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        delete msg.reasoning; delete msg.reasoning_content; delete msg.reasoning_details;
        return { message: msg, provider: p.name, model: m, tried: errors };
      } catch (err) {
        if (!p.local) netErrs++;
        cooldown[ck] = Date.now() + (p.local ? 15000 : 30000);
        errors.push(`${p.name} ${m}: ${err.name === 'AbortError' ? 'vaqt tugadi' : err.message}`);
      }
    }
  }
  const internetAttempts = provs.filter(p => !p.local).length;
  if (netErrs >= internetAttempts && !(await online())) return { error: { code: 'offline', message: 'Internet yo\'q' } };
  logw('ROUTER: ' + errors.join(' | '));
  return { error: { code: 'rate_limited', message: 'Barcha modellar band yoki xato berdi:\n' + errors.join('\n') } };
});

ipcMain.handle('llm:models', async (e, pid) => {
  const p = loadCfg().providers.find(x => x.id === pid);
  if (!p || !p.key) return { error: 'Avval API kalitni kiriting va saqlang.' };
  try {
    const r = await fetchT(p.base.replace(/\/$/, '') + '/models', { headers: headers(p) }, 30000);
    const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 200) };
    const j = JSON.parse(t); let list = (j.data || j.models || []).map(x => ({ id: (x.id || x.name || '').replace(/^models\//, ''), free: !!(x.pricing && +x.pricing.prompt === 0 && +x.pricing.completion === 0) }));
    if (pid === 'openrouter') list = list.filter(x => x.free || /:free$/.test(x.id) || x.id === 'openrouter/free');
    return { models: list.filter(x => x.id && !/whisper|embed|tts|guard|image|vision-only|audio/i.test(x.id)).map(x => x.id) };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('llm:test', async (e, pid) => {
  const p = loadCfg().providers.find(x => x.id === pid);
  if (!p || !p.key) return { error: 'Kalit yo\'q' };
  for (const m of p.models) {
    try {
      const r = await fetchT(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: headers(p), body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'Faqat "OK" deb javob ber.' }], max_tokens: 20 }) }, 40000);
      const t = await r.text(); if (r.ok) return { ok: true, model: m };
      if (m === p.models[p.models.length - 1]) return { error: r.status + ' ' + t.slice(0, 200) };
    } catch (err) { if (m === p.models[p.models.length - 1]) return { error: err.message }; }
  }
  return { error: 'model yo\'q' };
});

ipcMain.handle('stt', async (e, { data, mime }) => {
  const cfg = loadCfg(); const g = cfg.providers.find(p => p.id === 'groq');
  if (!g || !g.key) {
    // Groq kaliti bo'lmasa — Gemini orqali ovozni matnga aylantirish
    const gm = cfg.providers.find(p => p.id === 'gemini');
    if (!gm || !gm.key) return { error: 'Ovozni tanish uchun Groq yoki Google Gemini kaliti kerak (⚙ Modellar).' };
    try {
      const r = await fetchT('https://generativelanguage.googleapis.com/v1beta/models/' + (gm.models[0] || 'gemini-flash-latest') + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gm.key },
        body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: (mime || 'audio/webm').split(';')[0], data: Buffer.from(data).toString('base64') } }, { text: 'Bu audioda aytilgan gapni AYNAN yozib ber (o\'zbek lotin yozuvida; ruscha gap bo\'lsa ruscha). Hech qanday izoh, tarjima yoki qo\'shimcha so\'z yozma. Gap bo\'lmasa bo\'sh qoldir.' }] }], generationConfig: { temperature: 0 } }) }, 60000);
      const t = await r.text(); if (!r.ok) return { error: 'Gemini STT: ' + r.status + ' ' + t.slice(0, 150) };
      const j = JSON.parse(t); const txt = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      return { text: txt.map(x => x.text || '').join(' ').trim() };
    } catch (err) { return { error: err.message }; }
  }
  try {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(data)], { type: mime || 'audio/webm' }), /wav/.test(mime || '') ? 'audio.wav' : 'audio.webm');
    fd.append('model', 'whisper-large-v3');
    if (cfg.sttLang && cfg.sttLang !== 'auto') fd.append('language', cfg.sttLang);
    fd.append('response_format', 'json');
    const r = await fetchT('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + g.key }, body: fd }, 60000);
    const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 200) };
    return { text: (JSON.parse(t).text || '').trim() };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('cfg:get', () => { const c = loadCfg(); return { ...c, google: { clientId: gcfg().clientId || '', hasSecret: !!gcfg().clientSecret }, providers: c.providers.map(p => ({ ...p, hasKey: !!p.key, key: p.key ? '••••' + p.key.slice(-4) : '' })) }; });
ipcMain.handle('cfg:set', (e, upd) => {
  const c = loadCfg(); let keysChanged = false;
  if (upd.sttLang) c.sttLang = upd.sttLang;
  if (upd.order) c.order = upd.order;
  for (const u of upd.providers || []) {
    const p = c.providers.find(x => x.id === u.id); if (!p) continue;
    if (typeof u.enabled === 'boolean') p.enabled = u.enabled;
    if (typeof u.key === 'string' && !u.key.startsWith('••••') && u.key.trim() !== p.key) { p.key = u.key.trim(); keysChanged = true; }
    if (Array.isArray(u.models)) p.models = u.models.filter(Boolean);
  }
  if (upd.order) c.providers.sort((a, b) => upd.order.indexOf(a.id) - upd.order.indexOf(b.id));
  saveCfg({ providers: c.providers.map(({ id, key, enabled, models }) => ({ id, key, enabled, models })), sttLang: c.sttLang, order: c.providers.map(p => p.id), keysAt: keysChanged ? Date.now() : (rawCfg().keysAt || 0) });
  return true;
});
ipcMain.handle('store:get', () => { try { return JSON.parse(fs.readFileSync(STORE_FILE(), 'utf8')); } catch (e) { return null; } });
ipcMain.handle('store:set', (e, v) => { fs.mkdirSync(path.dirname(STORE_FILE()), { recursive: true }); fs.writeFileSync(STORE_FILE(), JSON.stringify(v)); return true; });
ipcMain.handle('open', (e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });


/* ================= GOOGLE (OAuth loopback + PKCE) & DRIVE ================= */
const G_FILE = () => path.join(app.getPath('userData'), 'jarvis-google.bin');
const G_CFG = () => path.join(app.getPath('userData'), 'jarvis-google.json');
function gcfg() { try { return JSON.parse(fs.readFileSync(G_CFG(), 'utf8')); } catch (e) { return {}; } }
function sgcfg(c) { fs.mkdirSync(path.dirname(G_CFG()), { recursive: true }); fs.writeFileSync(G_CFG(), JSON.stringify(c)); }
function readTok() { try { const b = fs.readFileSync(G_FILE()); return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString()); } catch (e) { return null; } }
function writeTok(t) { fs.mkdirSync(path.dirname(G_FILE()), { recursive: true }); const s = JSON.stringify(t); fs.writeFileSync(G_FILE(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s)); }
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar openid email';
const b64u = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
ipcMain.handle('g:setClient', (e, { clientId, clientSecret }) => { const c = gcfg(); if (/^JRV1:/.test((clientId || '').trim())) { try { const j = JSON.parse(Buffer.from(clientId.trim().slice(5), 'base64').toString()); clientId = j.i; clientSecret = j.s; } catch (er) {} } if (clientId) c.clientId = clientId.trim(); if (clientSecret && !clientSecret.startsWith('••')) c.clientSecret = clientSecret.trim(); sgcfg(c); return true; });
ipcMain.handle('g:status', async () => { const t = readTok(); const sc = (t && t.scope) || ''; return { configured: !!(gcfg().clientId && gcfg().clientSecret), loggedIn: !!(t && t.refresh_token), email: t && t.email || '', gmail: /gmail/.test(sc), calendar: /calendar/.test(sc), drive: /auth\/drive/.test(sc) || (t && !t.scope) }; });
ipcMain.handle('g:logout', () => { try { fs.unlinkSync(G_FILE()); } catch (e) {} return true; });
ipcMain.handle('g:login', async () => {
  const c = gcfg(); if (!c.clientId || !c.clientSecret) return { error: 'Avval Google Client ID va Client Secret kiriting.' };
  const verifier = b64u(crypto.randomBytes(48)), challenge = b64u(crypto.createHash('sha256').update(verifier).digest()), state = b64u(crypto.randomBytes(16));
  return await new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1'); const code = u.searchParams.get('code');
      if (!code && !u.searchParams.get('error')) { res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;background:#03080f;color:#8be9ff;text-align:center;padding-top:80px"><h2>JARVIS: Google ulandi ✓</h2><p>Bu oynani yopib, Jarvisga qaytishingiz mumkin.</p></body></html>');
      srv.close();
      if (u.searchParams.get('state') !== state || !code) return resolve({ error: u.searchParams.get('error') || 'state xato' });
      try {
        const r = await fetchT('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }) }, 30000);
        const t = await r.json(); if (!t.refresh_token) return resolve({ error: 'Token olinmadi: ' + JSON.stringify(t).slice(0, 200) });
        let email = ''; try { email = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64').toString()).email || ''; } catch (e) {}
        writeTok({ refresh_token: t.refresh_token, access_token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000, email, scope: t.scope || '' });
        resolve({ ok: true, email });
      } catch (err) { resolve({ error: err.message }); }
    });
    let redirect = '';
    srv.listen(0, '127.0.0.1', () => {
      redirect = 'http://127.0.0.1:' + srv.address().port;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: c.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' });
      shell.openExternal(url);
    });
    setTimeout(() => { try { srv.close(); } catch (e) {} resolve({ error: 'Vaqt tugadi (5 daqiqa)' }); }, 300000);
  });
});
async function gToken() {
  const t = readTok(); if (!t || !t.refresh_token) throw Object.assign(new Error('Google\'ga kirilmagan'), { code: 'no_login' });
  if (t.access_token && t.exp > Date.now()) return t.access_token;
  const c = gcfg();
  const r = await fetchT('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) }, 20000);
  const j = await r.json(); if (!j.access_token) throw Object.assign(new Error('Token yangilanmadi: ' + (j.error_description || j.error)), { code: j.error === 'invalid_grant' ? 'relogin' : 'auth' });
  t.access_token = j.access_token; t.exp = Date.now() + (j.expires_in - 60) * 1000; writeTok(t); return t.access_token;
}
async function gfetch(url, opts = {}) {
  const tok = await gToken();
  const r = await fetchT(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + tok } }, 60000);
  if (!r.ok) { const t = await r.text(); throw Object.assign(new Error(r.status + ' ' + t.slice(0, 200)), { code: /storageQuota|quotaExceeded/.test(t) ? 'quota' : 'drive' }); }
  return r;
}
const MEM_FILE = 'jarvis_xotira.json', MEM_FOLDER = 'Jarvis xotira';
async function memFolder() {
  const q = encodeURIComponent(`name = '${MEM_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const j = await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`)).json();
  if (j.files && j.files[0]) return j.files[0].id;
  const c = await (await gfetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: MEM_FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).json();
  return c.id;
}
async function memFiles(folder) {
  const q = encodeURIComponent(`name = '${MEM_FILE}' and '${folder}' in parents and trashed = false`);
  return ((await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&pageSize=10`)).json()).files || []);
}
ipcMain.handle('g:pull', async () => {
  try { const folder = await memFolder(); const files = await memFiles(folder); if (!files.length) return { empty: true };
    const t = await (await gfetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`)).text();
    return { content: t, id: files[0].id, modified: files[0].modifiedTime };
  } catch (e) { return { error: e.message, code: e.code || (/fetch failed|ENOTFOUND|ECONN|timeout|abort/i.test(e.message) ? 'offline' : 'drive') }; }
});
ipcMain.handle('g:push', async (e, content) => {
  try { const folder = await memFolder(); const files = await memFiles(folder);
    if (files[0]) {
      await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content });
      for (const f of files.slice(2)) { try { await gfetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch (er) {} }
      return { ok: true, id: files[0].id };
    }
    const boundary = 'jrv' + Date.now();
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: MEM_FILE, parents: [folder], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const r = await (await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body })).json();
    return { ok: true, id: r.id };
  } catch (e) { return { error: e.message, code: e.code || (/fetch failed|ENOTFOUND|ECONN|timeout|abort/i.test(e.message) ? 'offline' : 'drive') }; }
});

/* ================= API KEYS: parol bilan shifrlash (AES-256-GCM + scrypt) ================= */
ipcMain.handle('sec:export', (e, arg) => {
  const pass = typeof arg === 'string' ? arg : arg.pass, extra = typeof arg === 'string' ? null : arg.extra;
  if (!pass || pass.length < 6) return { error: 'Parol kamida 6 belgi bo\'lsin' };
  const c = loadCfg(); const data = JSON.stringify({ extra, keys: c.providers.filter(p => p.key).map(p => ({ id: p.id, key: p.key, models: p.models, enabled: p.enabled })), google: gcfg(), sttLang: c.sttLang, order: c.order });
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32, { N: 16384 });
  const ci = crypto.createCipheriv('aes-256-gcm', key, iv); const enc = Buffer.concat([ci.update(data, 'utf8'), ci.final()]);
  return { blob: { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: ci.getAuthTag().toString('base64'), data: enc.toString('base64') }, count: c.providers.filter(p => p.key).length };
});

/* ================= KALITLAR: Google hisobi bilan avtomatik (parolsiz) ================= */
// Kalitlar Google Drive'dagi "Jarvis xotira/jarvis_kalitlar.json" faylida, Google hisobingizga bog'langan kalit bilan shifrlangan holda turadi.
// Shu Google hisob bilan kirilgan har qanday kompyuter yoki telefon ularni o'zi yuklab oladi.
const KEY_FILE = 'jarvis_kalitlar.json';
const autoKey = email => crypto.createHash('sha256').update('jarvis-auto-v1|' + String(email).toLowerCase().trim()).digest();
function encAuto(email, obj) { const iv = crypto.randomBytes(12); const ci = crypto.createCipheriv('aes-256-gcm', autoKey(email), iv); const d = Buffer.concat([ci.update(JSON.stringify(obj), 'utf8'), ci.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: ci.getAuthTag().toString('base64'), data: d.toString('base64') }; }
function decAuto(email, b) { const dc = crypto.createDecipheriv('aes-256-gcm', autoKey(email), Buffer.from(b.iv, 'base64')); dc.setAuthTag(Buffer.from(b.tag, 'base64'));
  return JSON.parse(Buffer.concat([dc.update(Buffer.from(b.data, 'base64')), dc.final()]).toString('utf8')); }
function mergeKeys(local, remote) {
  // local/remote: {at, keys:[{id,key,models,enabled}], google:{clientId,clientSecret}}
  const out = { at: Math.max(local.at || 0, remote.at || 0), keys: [], google: {} }; const newer = (remote.at || 0) > (local.at || 0) ? remote : local, older = newer === remote ? local : remote;
  const ids = new Set([...(local.keys || []), ...(remote.keys || [])].map(k => k.id));
  for (const id of ids) { const a = (newer.keys || []).find(k => k.id === id && k.key), b = (older.keys || []).find(k => k.id === id && k.key); if (a || b) out.keys.push(a || b); }
  out.google = (newer.google && newer.google.clientId) ? newer.google : (older.google || {});
  return out;
}
const keysSig = b => JSON.stringify((b.keys || []).map(k => [k.id, k.key, k.enabled, (k.models || []).join(',')]).sort()) + '|' + ((b.google || {}).clientId || '') + ((b.google || {}).clientSecret || '');
ipcMain.handle('keys:sync', async () => {
  const t = readTok(); if (!t || !t.refresh_token || !t.email) return { skip: true };
  try {
    const folder = await memFolder();
    const q = encodeURIComponent(`name = '${KEY_FILE}' and '${folder}' in parents and trashed = false`);
    const files = ((await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id)&pageSize=5`)).json()).files || []);
    let remote = { at: 0, keys: [], google: {} };
    if (files[0]) { try { remote = decAuto(t.email, JSON.parse(await (await gfetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`)).text())); } catch (e) { logw('KEYS decrypt: ' + e.message); } }
    const c = loadCfg(), r0 = rawCfg();
    const local = { at: r0.keysAt || 0, keys: c.providers.filter(p => p.key && !p.local).map(p => ({ id: p.id, key: p.key, models: p.models, enabled: p.enabled })), google: { clientId: gcfg().clientId || '', clientSecret: gcfg().clientSecret || '' } };
    const m = mergeKeys(local, remote);
    let pulled = 0;
    for (const k of m.keys) { const p = c.providers.find(x => x.id === k.id); if (!p) continue; if (p.key !== k.key) { p.key = k.key; pulled++; } if (k.models && k.models.length) p.models = k.models; if (typeof k.enabled === 'boolean') p.enabled = k.enabled; }
    saveCfg({ providers: c.providers.map(({ id, key, enabled, models }) => ({ id, key, enabled, models })), sttLang: c.sttLang, order: c.providers.map(p => p.id), keysAt: m.at });
    if (m.google.clientId && m.google.clientSecret) sgcfg({ ...gcfg(), clientId: m.google.clientId, clientSecret: m.google.clientSecret });
    let pushed = false;
    if (keysSig(m) !== keysSig(remote) && m.keys.length) {
      const body = JSON.stringify(encAuto(t.email, m));
      if (files[0]) await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      else { const bd = 'jrv' + Date.now(); await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd },
        body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: KEY_FILE, parents: [folder], mimeType: 'application/json' })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${bd}--` }); }
      pushed = true;
    }
    return { ok: true, pulled, pushed, count: m.keys.length };
  } catch (e) { logw('KEYS: ' + e.message); return { error: e.message }; }
});
// telefon uchun ulanish kodi (Client ID + Secret) — faqat siz bosganingizda
ipcMain.handle('g:phoneCode', () => { const c = gcfg(); if (!c.clientId || !c.clientSecret) return { error: 'Avval Google Client ID/Secret kiriting' }; return { code: 'JRV1:' + Buffer.from(JSON.stringify({ i: c.clientId, s: c.clientSecret })).toString('base64') }; });

ipcMain.handle('sec:import', (e, { blob, pass }) => {
  try {
    const key = crypto.scryptSync(pass, Buffer.from(blob.salt, 'base64'), 32, { N: 16384 });
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64')); d.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const j = JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64')), d.final()]).toString('utf8'));
    const c = loadCfg();
    for (const k of j.keys || []) { const p = c.providers.find(x => x.id === k.id); if (p) { p.key = k.key; if (k.models) p.models = k.models; if (typeof k.enabled === 'boolean') p.enabled = k.enabled; } }
    saveCfg({ providers: c.providers.map(({ id, key, enabled, models }) => ({ id, key, enabled, models })), sttLang: j.sttLang || c.sttLang, order: j.order || c.order });
    if (j.google && j.google.clientId) { const g = gcfg(); sgcfg({ ...g, ...j.google }); }
    return { ok: true, count: (j.keys || []).length, extra: j.extra || null };
  } catch (err) { return { error: 'Parol noto\'g\'ri yoki ma\'lumot buzilgan' }; }
});


/* ================= TINIQ OVOZ: Gemini TTS ================= */
let ttsCool=0;
ipcMain.handle('tts:gemini', async (e, { text, voice }) => {
  const c = loadCfg(); const g = c.providers.find(p => p.id === 'gemini'); const raw = (() => { try { return JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (er) { return {}; } })();
  if (raw.ttsOn === false) return { error: 'off' };
  if (!g || !g.key) return { error: 'no_key' };
  if (ttsCool > Date.now()) return { error: 'cooldown' };
  const model = raw.ttsModel || 'gemini-2.5-flash-preview-tts';
  try {
    const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': g.key },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Charon' } } } } }) }, 60000);
    const t = await r.text();
    if (!r.ok) { if (r.status === 429) ttsCool = Date.now() + 10 * 60 * 1000; return { error: r.status + ' ' + t.slice(0, 160) }; }
    const j = JSON.parse(t); const part = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const d = part.find(x => x.inlineData); if (!d) return { error: 'audio yo\'q' };
    const m = /rate=(\d+)/.exec(d.inlineData.mimeType || ''); return { pcm: d.inlineData.data, rate: m ? +m[1] : 24000 };
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('tts:cfg', (e, upd) => { let raw = {}; try { raw = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (er) {}
  if (upd) { if (typeof upd.ttsOn === 'boolean') raw.ttsOn = upd.ttsOn; if (upd.ttsModel) raw.ttsModel = upd.ttsModel.trim(); fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(raw, null, 1)); ttsCool = 0; }
  return { ttsOn: raw.ttsOn !== false, ttsModel: raw.ttsModel || 'gemini-2.5-flash-preview-tts' }; });


/* ================= KOMPYUTERNI BOSHQARISH ================= */
const os = require('os'); const { execFile } = require('child_process');
const APPS = { word: 'winword', excel: 'excel', powerpoint: 'powerpnt', chrome: 'chrome', edge: 'msedge', firefox: 'firefox', 'fayl': 'explorer', explorer: 'explorer', provodnik: 'explorer',
  kalkulyator: 'calc', calculator: 'calc', bloknot: 'notepad', notepad: 'notepad', paint: 'mspaint', telegram: 'telegram', autocad: 'acad', photoshop: 'photoshop', 'sozlamalar': 'ms-settings:', settings: 'ms-settings:', 'vazifalar': 'taskmgr', taskmgr: 'taskmgr', cmd: 'cmd', powershell: 'powershell' };
const HOME = os.homedir(), ROOTS = ['Desktop', 'Documents', 'Downloads', 'OneDrive', 'Pictures'].map(d => path.join(HOME, d)).filter(d => fs.existsSync(d));
function walk(dir, q, out, depth) { if (depth > 5 || out.length >= 60) return; let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) { if (out.length >= 60) return; if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'AppData') continue; const f = path.join(dir, e.name);
    if (e.name.toLowerCase().includes(q)) { let st = {}; try { st = fs.statSync(f); } catch (er) {} out.push({ path: f, dir: e.isDirectory(), size: st.size, modified: st.mtime }); }
    if (e.isDirectory()) walk(f, q, out, depth + 1); } }
ipcMain.handle('pc', async (e, a) => {
  try {
    switch (a.action) {
      case 'open_app': { const n = String(a.name || '').toLowerCase().trim(); const target = APPS[n] || a.name;
        if (/^https?:\/\//.test(target)) { shell.openExternal(target); return { ok: true }; }
        await new Promise((res, rej) => execFile('cmd', ['/c', 'start', '""', target], { windowsHide: true }, er => er ? rej(er) : res())); return { ok: true, opened: target }; }
      case 'open_path': { const r = await shell.openPath(a.path); return r ? { error: r } : { ok: true }; }
      case 'show_in_folder': shell.showItemInFolder(a.path); return { ok: true };
      case 'list_dir': { const d = a.path || HOME; return fs.readdirSync(d, { withFileTypes: true }).slice(0, 200).map(x => ({ name: x.name, dir: x.isDirectory() })); }
      case 'find_files': { const q = String(a.query || '').toLowerCase(); if (!q) return { error: 'query kerak' }; const out = []; for (const r of (a.root ? [a.root] : ROOTS)) walk(r, q, out, 0); return out; }
      case 'read_file': { const st = fs.statSync(a.path); if (!/\.(txt|csv|md|json|log|xml|html|ini)$/i.test(a.path)) return { error: 'Faqat matnli fayllar o\'qiladi; boshqasini open_path bilan oching.' };
        return { size: st.size, text: fs.readFileSync(a.path, 'utf8').slice(0, 20000) }; }
      case 'write_text_file': { const f = a.path || path.join(HOME, 'Desktop', a.name || 'jarvis.txt'); fs.writeFileSync(f, a.text || '', 'utf8'); return { ok: true, path: f }; }
      case 'system_info': { let disk = null; try { const s = fs.statfsSync(HOME); disk = { freeGB: +(s.bavail * s.bsize / 1e9).toFixed(1), totalGB: +(s.blocks * s.bsize / 1e9).toFixed(1) }; } catch (er) {}
        return { os: os.type() + ' ' + os.release(), host: os.hostname(), user: os.userInfo().username, cpu: os.cpus()[0] && os.cpus()[0].model, cores: os.cpus().length, ramGB: +(os.totalmem() / 1e9).toFixed(1), freeRamGB: +(os.freemem() / 1e9).toFixed(1), uptimeH: +(os.uptime() / 3600).toFixed(1), disk, roots: ROOTS }; }
      case 'powershell': return await new Promise(res => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', a.command], { timeout: 30000, windowsHide: true, maxBuffer: 2e6 },
        (er, so, se) => res({ code: er ? (er.code || 1) : 0, stdout: String(so).slice(0, 8000), stderr: String(se).slice(0, 2000) })));
      default: return { error: 'Noma\'lum amal' };
    }
  } catch (err) { return { error: err.message }; }
});


/* ================= INTERNET: ob-havo, yangiliklar, sahifa, vikipediya ================= */
const strip = s => String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const FEEDS = { kun: 'https://kun.uz/news/rss', daryo: 'https://daryo.uz/feed/', gazeta: 'https://www.gazeta.uz/uz/rss/', 'uza': 'https://uza.uz/uz/rss' };
const WMO = { 0: 'ochiq', 1: 'asosan ochiq', 2: 'qisman bulutli', 3: 'bulutli', 45: 'tuman', 48: 'qirovli tuman', 51: 'mayda shivalama', 53: 'shivalama', 55: 'kuchli shivalama', 61: 'yengil yomg\'ir', 63: 'yomg\'ir', 65: 'kuchli yomg\'ir', 71: 'yengil qor', 73: 'qor', 75: 'kuchli qor', 80: 'jala', 81: 'kuchli jala', 82: 'juda kuchli jala', 95: 'momaqaldiroq', 96: 'do\'lli momaqaldiroq', 99: 'kuchli do\'l' };
  /* ---------- QIDIRUV: veb, rasm, video (kalitsiz) ---------- */
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const UAD = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ent = s => String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const untag = s => ent(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
async function getText(url, headers) { const r = await fetchT(url, { headers: Object.assign({ 'User-Agent': UAD, 'Accept-Language': 'uz,ru;q=0.9,en;q=0.8' }, headers || {}) }, 20000); return { status: r.status, text: await r.text() }; }
async function searchWeb(q, n) {
  n = Math.min(n || 8, 15); const out = [];
  try { // DuckDuckGo (HTML)
    const r = await getText('https://html.duckduckgo.com/html/?kl=wt-wt&q=' + encodeURIComponent(q));
    const blocks = r.text.split(/<div class="result results_links/).slice(1);
    for (const b of blocks) {
      const a = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b); if (!a) continue;
      let url = ent(a[1]); const m = /[?&]uddg=([^&]+)/.exec(url); if (m) url = decodeURIComponent(m[1]); if (url.startsWith('//')) url = 'https:' + url;
      if (/duckduckgo\.com\/y\.js|ad_provider/.test(url)) continue;
      const sn = /class="result__snippet"[^>]*>([\s\S]*?)<\/(a|div)>/.exec(b);
      out.push({ title: untag(a[2]), url, site: host(url), snippet: sn ? untag(sn[1]) : '' }); if (out.length >= n) break;
    }
  } catch (e) {}
  if (out.length < 3) try { // zaxira: Bing
    const r = await getText('https://www.bing.com/search?setlang=uz&q=' + encodeURIComponent(q));
    for (const b of r.text.split('<li class="b_algo"').slice(1)) {
      const a = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b); if (!a) continue;
      let url = ent(a[1]); const u = /[?&]u=a1([^&]+)/.exec(url); if (/bing\.com\/ck\//.test(url) && u) { try { url = atob(u[1].replace(/-/g, '+').replace(/_/g, '/')); } catch (e) {} }
      const p = /<p[^>]*>([\s\S]*?)<\/p>/.exec(b) || /class="b_lineclamp\d"[^>]*>([\s\S]*?)<\/(p|div)>/.exec(b);
      if (!out.some(x => x.url === url)) out.push({ title: untag(a[2]), url, site: host(url), snippet: p ? untag(p[1]) : '' }); if (out.length >= n) break;
    }
  } catch (e) {}
  return out;
}
async function searchImages(q, n) {
  n = Math.min(n || 12, 30); const out = [];
  const r = await getText('https://www.bing.com/images/async?first=0&count=35&mmasync=1&q=' + encodeURIComponent(q));
  const re = /class="iusc"[^>]*?\sm="([^"]+)"/g; let m;
  while ((m = re.exec(r.text)) && out.length < n) {
    try { const j = JSON.parse(ent(m[1])); if (!j.murl) continue; out.push({ title: untag(j.t || ''), image: j.murl, thumb: j.turl || j.murl, page: j.purl || j.murl, site: host(j.purl || j.murl) }); } catch (e) {}
  }
  if (!out.length) { // zaxira: DuckDuckGo rasmlari
    try {
      const p = await getText('https://duckduckgo.com/?ia=images&iax=images&q=' + encodeURIComponent(q)); const v = /vqd=["']?([\d-]+)/.exec(p.text);
      if (v) { const j = JSON.parse((await getText('https://duckduckgo.com/i.js?o=json&l=wt-wt&p=1&q=' + encodeURIComponent(q) + '&vqd=' + v[1], { Referer: 'https://duckduckgo.com/' })).text);
        (j.results || []).slice(0, n).forEach(x => out.push({ title: x.title || '', image: x.image, thumb: x.thumbnail || x.image, page: x.url, site: host(x.url) })); }
    } catch (e) {}
  }
  if (out.length < 4) { // zaxira: Wikimedia Commons (doim ochiq)
    try { const j = JSON.parse((await getText('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=' + n + '&prop=imageinfo&iiprop=url&iiurlwidth=360&gsrsearch=' + encodeURIComponent(q))).text);
      Object.values((j.query && j.query.pages) || {}).forEach(pg => { const ii = (pg.imageinfo || [])[0]; if (ii && /\.(jpe?g|png|webp|gif)$/i.test(ii.url)) out.push({ title: (pg.title || '').replace(/^File:|\.\w+$/g, ''), image: ii.url, thumb: ii.thumburl || ii.url, page: ii.descriptionurl || ii.url, site: 'commons.wikimedia.org' }); }); } catch (e) {}
  }
  return out;
}
async function searchVideos(q, n) {
  n = Math.min(n || 6, 15); const out = [];
  const r = await getText('https://www.youtube.com/results?hl=uz&search_query=' + encodeURIComponent(q), { Cookie: 'CONSENT=YES+1; SOCS=CAI' });
  const m = /var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(r.text) || /ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/.exec(r.text);
  if (m) {
    const walk = o => { if (!o || typeof o !== 'object' || out.length >= n) return; if (o.videoRenderer) { const v = o.videoRenderer; const t = (v.title && (v.title.runs ? v.title.runs.map(x => x.text).join('') : v.title.simpleText)) || '';
        out.push({ id: v.videoId, title: t, url: 'https://www.youtube.com/watch?v=' + v.videoId, thumb: 'https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg', duration: (v.lengthText && v.lengthText.simpleText) || '', channel: (v.ownerText && v.ownerText.runs && v.ownerText.runs[0].text) || '', views: (v.shortViewCountText && v.shortViewCountText.simpleText) || (v.viewCountText && v.viewCountText.simpleText) || '' }); return; }
      for (const k in o) walk(o[k]); };
    try { walk(JSON.parse(m[1])); } catch (e) {}
  }
  if (!out.length) { const re = /"videoId":"([\w-]{11})"/g; const seen = new Set(); let x; while ((x = re.exec(r.text)) && out.length < n) { if (seen.has(x[1])) continue; seen.add(x[1]); out.push({ id: x[1], title: '', url: 'https://www.youtube.com/watch?v=' + x[1], thumb: 'https://i.ytimg.com/vi/' + x[1] + '/hqdefault.jpg' }); } }
  return out;
}
async function httpReq(a) {
  if (!/^https?:\/\//.test(a.url || '')) return { error: 'URL noto\'g\'ri' };
  const r = await fetchT(a.url, { method: a.method || 'GET', headers: Object.assign({ 'User-Agent': UAD }, a.headers || {}), body: a.body == null ? undefined : (typeof a.body === 'string' ? a.body : JSON.stringify(a.body)) }, Math.min(a.timeout || 30000, 60000));
  const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch (e) {}
  return { status: r.status, ok: r.ok, json, text: json ? undefined : t.slice(0, 200000) };
}

  /* ---------- RASM: Lens qidiruv, AI tahrir; HUJJAT: PDF o'qish ---------- */
async function geminiKey() { const g = loadCfg().providers.find(p => p.id === 'gemini'); return g && g.key ? g : null; }
async function imgEdit({ b64, mime, prompt }) {
  const g = await geminiKey(); if (!g) return { error: 'Buning uchun Google Gemini kaliti kerak' };
  const model = (rawCfg().imgModel) || 'gemini-2.5-flash-image';
  try {
    const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': g.key },
      body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: mime || 'image/jpeg', data: b64 } }, { text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) }, 120000);
    const t = await r.text(); if (!r.ok) return { error: r.status === 429 ? 'Bepul limit tugadi — birozdan keyin urinib ko\'ring' : r.status + ' ' + t.slice(0, 160) };
    const parts = (((JSON.parse(t).candidates || [])[0] || {}).content || {}).parts || []; const im = parts.find(x => x.inlineData);
    if (!im) return { error: parts.map(x => x.text || '').join(' ').slice(0, 200) || 'Rasm qaytmadi' };
    return { b64: im.inlineData.data, mime: im.inlineData.mimeType };
  } catch (err) { return { error: err.message }; }
}
async function docRead({ b64, mime, name }) {
  const g = await geminiKey(); if (!g) return { error: 'PDF va skaner hujjatlarni o\'qish uchun Google Gemini kaliti kerak' };
  if (!/pdf|image/.test(mime || '')) return { error: 'Bu fayl turi qo\'llanmaydi: ' + (name || mime) };
  try {
    const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${g.models[0] || 'gemini-flash-latest'}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': g.key },
      body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: 'Bu hujjatning to\'liq matnini AYNAN, asl tilida chiqarib ber. Jadvallarni | belgisi bilan qator-qator yoz. Hech qanday izoh qo\'shma.' }] }], generationConfig: { temperature: 0 } }) }, 180000);
    const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 160) };
    const parts = (((JSON.parse(t).candidates || [])[0] || {}).content || {}).parts || []; return { text: parts.map(x => x.text || '').join('') };
  } catch (err) { return { error: err.message }; }
}

async function lens({ b64, mime }) {
  const buf = Buffer.from(b64, 'base64');
  try {
    const fd = new FormData(); fd.append('encoded_image', new Blob([buf], { type: mime || 'image/jpeg' }), 'image.jpg'); fd.append('processed_image_dimensions', '1000,1000');
    const r = await fetchT('https://lens.google.com/v3/upload?hl=uz&re=df&ep=gsbubb&st=' + Date.now(), { method: 'POST', body: fd, redirect: 'manual', headers: { 'User-Agent': UAD } }, 30000);
    let loc = r.headers.get('location'); if (!loc) { const t = await r.text(); const m = /(https:\/\/lens\.google\.com\/search\?[^"'<\s]+)/.exec(t) || /URL='?([^"'>]+)/i.exec(t); if (m) loc = ent(m[1]); }
    if (loc) { if (loc.startsWith('/')) loc = 'https://lens.google.com' + loc; return { url: loc, site: 'lens.google.com' }; }
  } catch (e) { logw('LENS: ' + e.message); }
  try {
    const fd = new FormData(); fd.append('upfile', new Blob([buf], { type: mime || 'image/jpeg' }), 'image.jpg');
    const r = await fetchT('https://yandex.ru/images/search?rpt=imageview&format=json&request=' + encodeURIComponent('{"blocks":[{"block":"b-page_type_search-by-image__link"}]}'), { method: 'POST', body: fd, headers: { 'User-Agent': UAD } }, 30000);
    const j = await r.json(); const u = j.blocks && j.blocks[0] && j.blocks[0].params && j.blocks[0].params.url; if (u) return { url: 'https://yandex.ru/images/search?' + u, site: 'yandex.ru' };
  } catch (e) { logw('YANDEX-IMG: ' + e.message); }
  return { error: 'Rasm bo\'yicha qidiruv xizmatlari javob bermadi' };
}
ipcMain.handle('img:lens', (e, a) => lens(a || {}));
ipcMain.handle('img:edit', (e, a) => imgEdit(a || {}));
ipcMain.handle('doc:read', (e, a) => docRead(a || {}));
ipcMain.handle('file:save', async (e, { b64, name, share }) => {
  try { const dir = path.join(app.getPath('documents'), 'Jarvis'); fs.mkdirSync(dir, { recursive: true });
    let f = path.join(dir, String(name || 'fayl').replace(/[\\/:*?"<>|]+/g, ' ')); if (fs.existsSync(f)) { const ext = path.extname(f); f = f.slice(0, -ext.length || undefined) + ' (' + Date.now() % 100000 + ')' + ext; }
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    if (share || /\.(jpe?g|png|webp)$/i.test(f)) shell.showItemInFolder(f); else shell.openPath(f);
    return { ok: true, path: f };
  } catch (err) { return { error: err.message }; }
});
/* ---------- NAMUNALAR: Google Drive'da (hamma qurilmada) ---------- */
const tplFile = (n, k) => (k || 'namuna') + '__' + String(n).replace(/['\\\/:*?"<>|]+/g, '_').slice(0, 80) + '.json';
async function tplFind(folder, n, k) { const q = encodeURIComponent(`name = '${tplFile(n, k)}' and '${folder}' in parents and trashed = false`); return ((await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=3`)).json()).files || [])[0]; }
async function tplPut({ name, json, kind }) {
  try { const folder = await memFolder(); const ex = await tplFind(folder, name, kind); let desc = ''; try { desc = (JSON.parse(json).desc || '').slice(0, 200); } catch (e) {}
    if (ex) { await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${ex.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json }); return { ok: true }; }
    const bd = 'jrv' + Date.now();
    await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd },
      body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: tplFile(name, kind), parents: [folder], mimeType: 'application/json', description: name + (desc ? ' — ' + desc : ''), appProperties: { jarvisTpl: '1' } })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${bd}--` });
    return { ok: true };
  } catch (e) { return { error: e.message }; }
}
async function tplList(a) { const kind = (a && a.kind) || 'namuna';
  try { const folder = await memFolder(); const q = encodeURIComponent(`name contains '${kind}__' and '${folder}' in parents and trashed = false`);
    const fl = ((await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,description,modifiedTime)&pageSize=100`)).json()).files || []);
    return { items: fl.map(f => { const d = f.description || ''; const i = d.indexOf(' — '); return { name: i > 0 ? d.slice(0, i) : (d || f.name.replace(new RegExp('^' + kind + '__|\\.json$', 'g'), '')), desc: i > 0 ? d.slice(i + 3) : '', at: Date.parse(f.modifiedTime) || 0 }; }) };
  } catch (e) { return { error: e.message }; }
}
async function tplGet({ name, kind }) { try { const folder = await memFolder(); const ex = await tplFind(folder, name, kind); if (!ex) return { error: 'yo\'q' }; return { json: await (await gfetch(`https://www.googleapis.com/drive/v3/files/${ex.id}?alt=media`)).text() }; } catch (e) { return { error: e.message }; } }
async function tplDel({ name, kind }) { try { const folder = await memFolder(); const ex = await tplFind(folder, name, kind); if (ex) await gfetch(`https://www.googleapis.com/drive/v3/files/${ex.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); return { ok: true }; } catch (e) { return { error: e.message }; } }
ipcMain.handle('tpl:put', (e, a) => tplPut(a || {}));
ipcMain.handle('tpl:list', (e, a) => tplList(a));
ipcMain.handle('tpl:get', (e, a) => tplGet(a || {}));
ipcMain.handle('tpl:del', (e, a) => tplDel(a || {}));
ipcMain.handle('http', async (e, a) => { try { return await httpReq(a || {}); } catch (err) { return { error: err.message }; } });
ipcMain.handle('openInApp', (e, url) => {
  if (!/^https?:\/\//.test(url || '')) return false;
  const w = new BrowserWindow({ width: 1150, height: 820, autoHideMenuBar: true, backgroundColor: '#03080f', title: 'JARVIS — ' + url, webPreferences: { contextIsolation: true, sandbox: true } });
  w.loadURL(url); w.webContents.setWindowOpenHandler(({ url: u }) => { w.loadURL(u); return { action: 'deny' }; }); return true;
});
ipcMain.handle('web', async (e, a) => {
  try {
    if (a.action === 'search') { const r = await searchWeb(a.query || '', a.limit); return r.length ? { results: r } : { error: 'Hech narsa topilmadi yoki qidiruv xizmati javob bermadi' }; }
    if (a.action === 'images') { const r = await searchImages(a.query || '', a.limit); return r.length ? { images: r } : { error: 'Rasm topilmadi' }; }
    if (a.action === 'videos') { const r = await searchVideos(a.query || '', a.limit); return r.length ? { videos: r } : { error: 'Video topilmadi' }; }
    if (a.action === 'weather') {
      const g = await (await fetchT('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' + encodeURIComponent(a.city || 'Guliston'), {}, 15000)).json();
      const pl = g.results && g.results[0]; if (!pl) return { error: 'Shahar topilmadi' };
      const w = await (await fetchT(`https://api.open-meteo.com/v1/forecast?latitude=${pl.latitude}&longitude=${pl.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`, {}, 15000)).json();
      return { place: pl.name + ', ' + (pl.country || ''), now: { temp: w.current.temperature_2m, feels: w.current.apparent_temperature, humidity: w.current.relative_humidity_2m, wind_kmh: w.current.wind_speed_10m, sky: WMO[w.current.weather_code] || w.current.weather_code },
        days: w.daily.time.map((d, i) => ({ date: d, min: w.daily.temperature_2m_min[i], max: w.daily.temperature_2m_max[i], rain_pct: w.daily.precipitation_probability_max[i], sky: WMO[w.daily.weather_code[i]] || w.daily.weather_code[i] })) };
    }
    if (a.action === 'news') {
      const srcs = a.source && FEEDS[a.source] ? [a.source] : Object.keys(FEEDS); const out = [];
      await Promise.all(srcs.map(async s => { try { const x = await (await fetchT(FEEDS[s], {}, 15000)).text();
        (x.match(/<item[\s\S]*?<\/item>/g) || []).slice(0, a.limit || 8).forEach(it => { const t = (it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''; const l = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || ''; const d = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
          out.push({ source: s, title: strip(t.replace(/<!\[CDATA\[|\]\]>/g, '')), link: l.replace(/<!\[CDATA\[|\]\]>/g, '').trim(), date: d }); }); } catch (er) { out.push({ source: s, error: er.message }); } }));
      return out;
    }
    if (a.action === 'fetch_url') { if (!/^https?:\/\//.test(a.url || '')) return { error: 'URL noto\'g\'ri' }; const r = await fetchT(a.url, { headers: { 'User-Agent': 'Mozilla/5.0 Jarvis' } }, 20000); return { status: r.status, text: strip(await r.text()).slice(0, 12000) }; }
    if (a.action === 'wiki') { const L = a.lang || 'uz'; const s = await (await fetchT(`https://${L}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(a.query || '')}`, {}, 15000)).json();
      const hits = (s.query && s.query.search) || []; if (!hits.length) return { error: 'Topilmadi' };
      const sum = await (await fetchT(`https://${L}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title)}`, {}, 15000)).json();
      return { title: sum.title, summary: sum.extract, url: sum.content_urls && sum.content_urls.desktop.page, other: hits.slice(1).map(x => x.title) }; }
    return { error: 'Noma\'lum amal' };
  } catch (err) { return { error: /fetch failed|ENOTFOUND|abort/i.test(err.message) ? 'Internet yo\'q' : err.message }; }
});

/* ================= TELEGRAM: telefondan Jarvisga yozish / ovozli xabar ================= */
const TG = { on: false, offset: 0, code: '', polling: false, pending: new Map(), win: null };
function tgCfg() { try { return JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')).tg || {}; } catch (e) { return {}; } }
function tgSave(t) { let raw = {}; try { raw = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (e) {} raw.tg = { ...(raw.tg || {}), ...t }; fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(raw, null, 1)); }
async function tgApi(m, body) { const t = tgCfg().token; const r = await fetchT(`https://api.telegram.org/bot${t}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }, 65000); return r.json(); }
async function tgSend(chat, text) { const s = String(text || '…'); for (let i = 0; i < s.length; i += 3900) await tgApi('sendMessage', { chat_id: chat, text: s.slice(i, i + 3900) }); }
async function tgVoiceToText(fileId) {
  const f = await tgApi('getFile', { file_id: fileId }); if (!f.ok) throw new Error('fayl yo\'q');
  const buf = Buffer.from(await (await fetchT(`https://api.telegram.org/file/bot${tgCfg().token}/${f.result.file_path}`, {}, 30000)).arrayBuffer());
  const cfg = loadCfg(); const g = cfg.providers.find(p => p.id === 'groq'); if (!g || !g.key) throw new Error('Ovozni tanish uchun Groq kaliti kerak');
  const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg'); fd.append('model', 'whisper-large-v3'); if (cfg.sttLang && cfg.sttLang !== 'auto') fd.append('language', cfg.sttLang);
  const r = await fetchT('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + g.key }, body: fd }, 60000); const j = await r.json(); return (j.text || '').trim();
}
async function tgLoop() {
  if (TG.polling) return; TG.polling = true;
  while (TG.on && tgCfg().token) {
    try {
      const u = await tgApi('getUpdates', { offset: TG.offset, timeout: 50, allowed_updates: ['message'] });
      if (!u.ok) {
          if (u.error_code === 409) { // shu bot boshqa qurilmada ham ishlayapti — bir-biriga xalaqit bermaslik uchun biri chetga chiqadi
            const now = Date.now(); TG.conf = (TG.conf || []).filter(t => now - t < 600000); TG.conf.push(now);
            if (TG.conf.length >= 3) { TG.on = false; TG.conflict = true; logw('TG: bot boshqa qurilmada ishlayapti — bu qurilmada to\'xtatildi'); break; }
            await new Promise(r => setTimeout(r, 30000 + Math.random() * 60000)); continue; }
          await new Promise(r => setTimeout(r, 10000)); continue; }
        TG.conf = [];
      for (const up of u.result) { TG.offset = up.update_id + 1; const m = up.message; if (!m) continue; const chat = m.chat.id; const owner = tgCfg().owner;
        const txt0 = (m.text || '').trim();
        if (!owner) { if (TG.code && txt0 === TG.code) { tgSave({ owner: chat, ownerName: (m.from.first_name || '') }); TG.code = ''; await tgSend(chat, '✅ Ulandingiz, ser. Endi menga yozing yoki ovozli xabar yuboring.'); TG.win && TG.win.webContents.send('tg:paired', m.from.first_name || ''); }
          else await tgSend(chat, 'Jarvis: ulanish kodini yuboring (Jarvis → ⚙ Modellar → Telegram).'); continue; }
        if (chat !== owner) { await tgSend(chat, '⛔ Bu Jarvis faqat egasi uchun ishlaydi.'); continue; }
        let text = txt0 || (m.caption || '').trim(); let file = null;
        try { if (m.voice || m.audio) { await tgApi('sendChatAction', { chat_id: chat, action: 'typing' }); text = await tgVoiceToText((m.voice || m.audio).file_id); if (text) await tgSend(chat, '🎙 ' + text); }
          else if (m.photo || m.document) { const fo = m.photo ? m.photo[m.photo.length - 1] : m.document; if ((fo.file_size || 0) > 20e6) throw new Error('Fayl 20 MB dan katta'); await tgApi('sendChatAction', { chat_id: chat, action: 'upload_document' });
            const fi = await tgApi('getFile', { file_id: fo.file_id }); if (!fi.ok) throw new Error('Faylni olib bo\'lmadi');
            const buf = Buffer.from(await (await fetchT(`https://api.telegram.org/file/bot${tgCfg().token}/${fi.result.file_path}`, {}, 60000)).arrayBuffer());
            file = { name: m.document ? (m.document.file_name || 'fayl') : 'rasm.jpg', mime: m.document ? (m.document.mime_type || '') : 'image/jpeg', b64: buf.toString('base64') };
            if (!text) text = m.photo ? 'Bu rasmda nima bor?' : 'Shu faylni o\'qib, qisqa mazmunini ayt.'; } }
        catch (er) { await tgSend(chat, '✕ ' + er.message); continue; }
        if (!text) continue; await tgApi('sendChatAction', { chat_id: chat, action: 'typing' });
        const id = 'tg' + up.update_id; const p = new Promise(res => { TG.pending.set(id, res); setTimeout(() => { if (TG.pending.has(id)) { TG.pending.delete(id); res('⌛ Jarvis javob bermadi (dastur ochiqmi?).'); } }, 180000); });
        if (TG.win && !TG.win.isDestroyed()) TG.win.webContents.send('tg:in', { id, text, file }); else TG.pending.get(id)('Jarvis oynasi yopiq.');
        p.then(ans => tgSend(chat, ans).catch(() => {}));
      }
    } catch (er) { await new Promise(r => setTimeout(r, 8000)); }
  }
  TG.polling = false;
}
ipcMain.handle('tg:file', async (e, { name, b64, mime, caption }) => { const t = tgCfg(); if (!t.token || !t.owner) return false;
  try { const fd = new FormData(); fd.append('chat_id', String(t.owner)); if (caption) fd.append('caption', caption.slice(0, 1000)); fd.append('document', new Blob([Buffer.from(b64, 'base64')], { type: mime || 'application/octet-stream' }), name);
    const r = await (await fetchT(`https://api.telegram.org/bot${t.token}/sendDocument`, { method: 'POST', body: fd }, 120000)).json(); return !!r.ok; } catch (er) { logw('TG file: ' + er.message); return false; } });
ipcMain.handle('tg:notify', async (e, text) => { const t = tgCfg(); if (!t.token || !t.owner || t.enabled === false) return false; try { await tgSend(t.owner, text); return true; } catch (er) { return false; } });
ipcMain.handle('tg:reply', (e, { id, text }) => { const f = TG.pending.get(id); if (f) { TG.pending.delete(id); f(text); } return true; });
ipcMain.handle('tg:get', () => { const t = tgCfg(); return { hasToken: !!t.token, on: TG.on, owner: !!t.owner, ownerName: t.ownerName || '', code: TG.code, enabled: t.enabled !== false, conflict: !!TG.conflict }; });
ipcMain.handle('tg:set', async (e, a) => {
  if (a.token) { const tok = a.token.trim(); const r = await (await fetchT(`https://api.telegram.org/bot${tok}/getMe`, {}, 15000)).json().catch(() => ({})); if (!r.ok) return { error: 'Token noto\'g\'ri yoki internet yo\'q' }; tgSave({ token: tok, owner: null, bot: r.result.username }); }
  if (a.unpair) tgSave({ owner: null });
  if (typeof a.enabled === 'boolean') tgSave({ enabled: a.enabled });
  const t = tgCfg(); TG.on = !!(t.token && t.enabled !== false); TG.conflict = false; TG.conf = [];
  if (TG.on && !t.owner) TG.code = String(Math.floor(100000 + Math.random() * 900000));
  if (TG.on) tgLoop();
  return { ok: true, bot: t.bot, code: TG.code, owner: !!t.owner };
});


/* ================= GEMINI LIVE: kalit va ekran rasmi ================= */
ipcMain.handle('live:cfg', () => { const c = loadCfg(); const g = c.providers.find(p => p.id === 'gemini'); let raw = {}; try { raw = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (e) {}
  return { key: g && g.key || '', model: raw.liveModel || 'gemini-2.5-flash-native-audio-latest', voice: raw.liveVoice || 'Charon' }; });
ipcMain.handle('live:set', (e, u) => { let raw = {}; try { raw = JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (er) {} if (u.model) raw.liveModel = u.model.trim(); if (u.voice) raw.liveVoice = u.voice; fs.writeFileSync(CFG_FILE(), JSON.stringify(raw, null, 1)); return true; });
ipcMain.handle('screen:shot', async () => { try { const d = eScreen.getPrimaryDisplay().size; const s = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.min(1600, d.width), height: Math.round(Math.min(1600, d.width) * d.height / d.width) } });
  const img = s[0].thumbnail; return { jpeg: img.toJPEG(80).toString('base64'), w: img.getSize().width, h: img.getSize().height }; } catch (err) { return { error: err.message }; } });


/* ================= GOOGLE: Gmail, Calendar, Drive (exe uchun) ================= */
const DRV = 'https://www.googleapis.com/drive/v3', GML = 'https://gmail.googleapis.com/gmail/v1/users/me', CAL = 'https://www.googleapis.com/calendar/v3';
const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const gj = async (url, opts) => (await gfetch(url, opts)).json();
const hdr = (m, n) => ((m.payload && m.payload.headers) || []).find(x => x.name.toLowerCase() === n)?.value || '';
function b64d(s) { return Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
function msgText(p) { if (!p) return ''; if (p.mimeType === 'text/plain' && p.body && p.body.data) return b64d(p.body.data);
  for (const x of p.parts || []) { const t = msgText(x); if (t) return t; } if (p.mimeType === 'text/html' && p.body && p.body.data) return strip(b64d(p.body.data)); return ''; }
const fixQ = q => String(q || '').replace(/\btitle\b/g, 'name');
const FIELDS = 'files(id,name,mimeType,modifiedTime,size,webViewLink,owners(displayName),parents)';
async function readDrive(id) {
  const m = await gj(`${DRV}/files/${id}?fields=id,name,mimeType,size,webViewLink`);
  const ex = { 'application/vnd.google-apps.document': 'text/plain', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' }[m.mimeType];
  let text = '';
  if (ex) text = await (await gfetch(`${DRV}/files/${id}/export?mimeType=${encodeURIComponent(ex)}`)).text();
  else if (/^text\/|json|xml|csv/.test(m.mimeType)) text = await (await gfetch(`${DRV}/files/${id}?alt=media`)).text();
  else if (/wordprocessingml|msword|pdf|spreadsheetml|presentationml/.test(m.mimeType)) {
    // nusxa: Google Docs formatiga aylantirib, matnini olamiz, so'ng vaqtinchalik nusxani o'chiramiz
    const target = /spreadsheetml/.test(m.mimeType) ? 'application/vnd.google-apps.spreadsheet' : /presentationml/.test(m.mimeType) ? 'application/vnd.google-apps.presentation' : 'application/vnd.google-apps.document';
    const c = await gj(`${DRV}/files/${id}/copy?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '~jarvis_tmp_' + m.name, mimeType: target }) });
    try { text = await (await gfetch(`${DRV}/files/${c.id}/export?mimeType=${encodeURIComponent(target.endsWith('spreadsheet') ? 'text/csv' : 'text/plain')}`)).text(); }
    finally { try { await gfetch(`${DRV}/files/${c.id}`, { method: 'DELETE' }); } catch (er) {} }
  } else text = '(Bu fayl turini matn sifatida o\'qib bo\'lmaydi: ' + m.mimeType + ')';
  return { id: m.id, title: m.name, mimeType: m.mimeType, link: m.webViewLink, content: text.slice(0, 60000) };
}
const GAPI = {
  'Google Drive': {
    search_files: a => gj(`${DRV}/files?${qs({ q: fixQ(a.query) || 'trashed = false', pageSize: a.pageSize || 25, orderBy: a.orderBy, fields: FIELDS })}`).then(r => ({ files: (r.files || []).map(f => ({ ...f, title: f.name })) })),
    list_recent_files: a => gj(`${DRV}/files?${qs({ q: 'trashed = false', pageSize: a.pageSize || 20, orderBy: 'modifiedTime desc', fields: FIELDS })}`).then(r => ({ files: (r.files || []).map(f => ({ ...f, title: f.name })) })),
    read_file_content: a => readDrive(a.fileId || a.id),
    get_file_metadata: a => gj(`${DRV}/files/${a.fileId || a.id}?fields=*`),
    create_file: async a => { const meta = { name: a.title || a.name || 'Jarvis', mimeType: a.mimeType || (a.contentMimeType && !a.disableConversionToGoogleType && /text\/plain|markdown/.test(a.contentMimeType) ? 'application/vnd.google-apps.document' : undefined), parents: a.parentId ? [a.parentId] : undefined };
      if (!a.textContent) return gj(`${DRV}/files?fields=id,name,webViewLink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) });
      const bd = 'jrv' + Date.now(); const body = `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: ${a.contentMimeType || 'text/plain'}; charset=UTF-8\r\n\r\n${a.textContent}\r\n--${bd}--`;
      return gj(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body }); },
    trash_file: a => gj(`${DRV}/files/${a.fileId || a.id}?fields=id,trashed`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
  },
  'Gmail': {
    search_threads: async a => { const r = await gj(`${GML}/threads?${qs({ q: a.query || 'in:inbox', maxResults: Math.min(a.pageSize || a.maxResults || 20, 40) })}`);
      const th = await Promise.all((r.threads || []).map(async t => { const d = await gj(`${GML}/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`); const m = (d.messages || [])[0] || {}; const l = (d.messages || []).slice(-1)[0] || m;
        return { id: t.id, subject: hdr(m, 'subject'), from: hdr(l, 'from'), date: hdr(l, 'date'), snippet: l.snippet || t.snippet, messages: (d.messages || []).length, unread: (l.labelIds || []).includes('UNREAD') }; }));
      return { threads: th }; },
    get_thread: async a => { const d = await gj(`${GML}/threads/${a.threadId || a.id}?format=full`);
      return { id: d.id, messages: (d.messages || []).map(m => ({ id: m.id, from: hdr(m, 'from'), to: hdr(m, 'to'), date: hdr(m, 'date'), subject: hdr(m, 'subject'), plainText: msgText(m.payload).slice(0, 15000) })) }; },
    get_message: async a => { const m = await gj(`${GML}/messages/${a.messageId || a.id}?format=full`); return { id: m.id, from: hdr(m, 'from'), to: hdr(m, 'to'), date: hdr(m, 'date'), subject: hdr(m, 'subject'), plainText: msgText(m.payload).slice(0, 15000) }; },
    list_labels: () => gj(`${GML}/labels`),
    create_draft: async a => { const raw = [`To: ${a.to || ''}`, a.cc ? `Cc: ${a.cc}` : '', `Subject: =?UTF-8?B?${Buffer.from(a.subject || '').toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(a.body || a.text || '').toString('base64')].filter(x => x !== '').join('\r\n').replace('Content-Transfer-Encoding: base64\r\n', 'Content-Transfer-Encoding: base64\r\n\r\n');
      return gj(`${GML}/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { raw: Buffer.from(raw).toString('base64url'), threadId: a.threadId } }) }); }
  },
  'Google Calendar': {
    list_calendars: () => gj(`${CAL}/users/me/calendarList`).then(r => ({ calendars: (r.items || []).map(c => ({ id: c.id, summary: c.summary, primary: !!c.primary })) })),
    list_events: a => gj(`${CAL}/calendars/${encodeURIComponent(a.calendarId || 'primary')}/events?${qs({ timeMin: a.timeMin || new Date().toISOString(), timeMax: a.timeMax, maxResults: a.maxResults || 50, singleEvents: true, orderBy: 'startTime' })}`).then(r => ({ events: (r.items || []).map(e => ({ id: e.id, summary: e.summary, start: e.start, end: e.end, location: e.location, description: (e.description || '').slice(0, 500) })) })),
    search_events: a => gj(`${CAL}/calendars/primary/events?${qs({ q: a.query, timeMin: a.timeMin, timeMax: a.timeMax, maxResults: 30, singleEvents: true, orderBy: 'startTime' })}`).then(r => ({ events: (r.items || []).map(e => ({ id: e.id, summary: e.summary, start: e.start, end: e.end, location: e.location })) })),
    get_event: a => gj(`${CAL}/calendars/primary/events/${a.eventId || a.id}`),
    create_event: a => { const tz = 'Asia/Tashkent'; const t = v => /T/.test(v || '') ? { dateTime: v, timeZone: tz } : { date: v };
      return gj(`${CAL}/calendars/primary/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: a.summary || a.title, description: a.description, location: a.location, start: t(a.start || a.startTime), end: t(a.end || a.endTime || a.start), reminders: { useDefault: true } }) }); }
  }
};
const GSCHEMA = {
  search_files: { query: 'Drive qidiruv sintaksisi: name contains \'...\', fullText contains \'...\', mimeType = \'...\'', pageSize: 'number', orderBy: 'masalan modifiedTime desc' }, list_recent_files: { pageSize: 'number' },
  read_file_content: { fileId: '*fayl id' }, get_file_metadata: { fileId: '*' }, create_file: { title: '*nomi', textContent: 'matn', contentMimeType: 'text/plain', parentId: '' }, trash_file: { fileId: '*' },
  search_threads: { query: 'Gmail qidiruv: from:, subject:, newer_than:7d, is:unread', pageSize: 'number' }, get_thread: { threadId: '*' }, get_message: { messageId: '*' }, list_labels: {},
  create_draft: { to: '*email', subject: '*', body: '*matn', cc: '', threadId: 'javob uchun' },
  list_calendars: {}, list_events: { timeMin: 'ISO sana-vaqt', timeMax: 'ISO', maxResults: 'number' }, search_events: { query: '*', timeMin: '', timeMax: '' }, get_event: { eventId: '*' },
  create_event: { summary: '*', start: '*2026-11-12T09:00:00 yoki 2026-11-12', end: '*', description: '', location: '' }
};
ipcMain.handle('gapi:list', async () => { const t = readTok(); if (!t || !t.refresh_token) return { servers: [] }; const sc = t.scope || 'drive';
  return { servers: Object.keys(GAPI).filter(s => s === 'Google Drive' ? true : s === 'Gmail' ? /gmail/.test(sc) : /calendar/.test(sc)).map(s => ({ server: s, authStatus: 'connected', tools: Object.keys(GAPI[s]).map(name => ({ name, description: '' })) })) }; });
ipcMain.handle('gapi:describe', (e, { tool }) => { const s = GSCHEMA[tool]; if (!s) return null; const props = {}, req = [];
  for (const k in s) { props[k] = { type: s[k] === 'number' ? 'number' : 'string', description: String(s[k]).replace(/^\*/, '') }; if (String(s[k]).startsWith('*')) req.push(k); }
  return { inputSchema: { type: 'object', properties: props, required: req } }; });
ipcMain.handle('gapi:call', async (e, { server, tool, input }) => {
  const f = GAPI[server] && GAPI[server][tool]; if (!f) return { error: { code: 'not_in_manifest', message: 'Bunday vosita yo\'q' } };
  try { return { payload: await f(input || {}) }; }
  catch (err) { const m = String(err.message || err); return { error: { code: err.code === 'no_login' ? 'server_not_connected' : /\b401\b|invalid_grant|relogin/.test(m) ? 'needs_reauth' : /\b403\b/.test(m) ? 'not_in_manifest' : /fetch failed|ENOTFOUND|abort/i.test(m) ? 'server_unavailable' : 'tool_error', message: m.slice(0, 400) } }; }
});


/* ================= OLLAMA: o'rnatish va model yuklash ================= */
const OLL = 'http://127.0.0.1:11434';
ipcMain.handle('ollama:status', async () => { let installed = false; try { installed = fs.existsSync(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')); } catch (e) {}
  try { const r = await fetchT(OLL + '/api/tags', {}, 3000); const j = await r.json(); return { running: true, installed: true, models: (j.models || []).map(m => m.name) }; } catch (e) { return { running: false, installed, models: [] }; } });
ipcMain.handle('ollama:install', async e => {
  try { const send = s => TG.win && TG.win.webContents.send('ollama:progress', s);
    const f = path.join(app.getPath('temp'), 'OllamaSetup.exe'); send({ status: 'Ollama yuklab olinmoqda…' });
    const r = await fetchT('https://ollama.com/download/OllamaSetup.exe', {}, 900000); if (!r.ok) return { error: 'Yuklab bo\'lmadi: ' + r.status };
    const total = +r.headers.get('content-length') || 0; const out = fs.createWriteStream(f); let got = 0; const rd = r.body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; out.write(Buffer.from(value)); got += value.length; if (got % (5 << 20) < value.length) send({ status: 'Ollama yuklab olinmoqda', completed: got, total }); }
    await new Promise(res => out.end(res)); send({ status: 'O\'rnatilmoqda…' });
    await new Promise((res, rej) => execFile(f, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true }, er => er ? rej(er) : res()));
    for (let i = 0; i < 30; i++) { try { await fetchT(OLL + '/api/tags', {}, 2000); return { ok: true }; } catch (er) { await new Promise(r2 => setTimeout(r2, 2000)); } }
    try { execFile(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe'), [], { windowsHide: true }); } catch (er) {}
    return { ok: true };
  } catch (err) { return { error: err.message }; } });
ipcMain.handle('ollama:pull', async (e, model) => {
  try { const r = await fetchT(OLL + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }) }, 3600000);
    if (!r.ok) return { error: 'Ollama javob bermadi (' + r.status + ')' };
    const rd = r.body.getReader(); let buf = '', last = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; buf += Buffer.from(value).toString(); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(line); if (j.error) return { error: j.error };
        if (Date.now() - last > 400 || j.status === 'success') { last = Date.now(); TG.win && TG.win.webContents.send('ollama:progress', { status: j.status, completed: j.completed || 0, total: j.total || 0 }); } } catch (er) {} } }
    // oflayn modelni ro'yxatga qo'yish
    const c = loadCfg(); const p = c.providers.find(x => x.id === 'ollama'); if (p) { p.models = [model, ...p.models.filter(m => m !== model)]; p.enabled = true; saveCfg({ providers: c.providers.map(({ id, key, enabled, models }) => ({ id, key, enabled, models })), sttLang: c.sttLang, order: c.order }); }
    return { ok: true };
  } catch (err) { return { error: /ECONNREFUSED|fetch failed/.test(err.message) ? 'Ollama ishlamayapti — avval o\'rnating' : err.message }; } });


/* ================= 🩺 DIAGNOSTIKA + JURNAL ================= */
const LOG_FILE = () => path.join(app.getPath('userData'), 'jarvis-log.txt');
function logw(m) { try { const f = LOG_FILE(); if (fs.existsSync(f) && fs.statSync(f).size > 400000) fs.renameSync(f, f + '.old'); fs.appendFileSync(f, new Date().toISOString() + ' ' + String(m).replace(/(key=|Bearer |gsk_|AIza|sk-)[\w-]{6,}/g, '$1***') + '\n'); } catch (e) {} }
ipcMain.handle('log:write', (e, m) => { logw(m); return true; });
ipcMain.handle('log:read', () => { try { return fs.readFileSync(LOG_FILE(), 'utf8').split('\n').slice(-120).join('\n'); } catch (e) { return ''; } });
ipcMain.handle('diag', async () => {
  const items = []; const add = (name, ok, msg, fix) => { items.push({ name, ok, msg, fix }); if (!ok) logw('DIAG ' + name + ': ' + msg); };
  const on = await online(); add('Internet', on, on ? 'bor' : 'yo\'q', on ? '' : 'Internetga ulaning (oflayn rejimda faqat Ollama AI ishlaydi)');
  const c = loadCfg(); const active = c.providers.filter(p => p.enabled && (p.key || p.local));
  if (!active.some(p => p.key)) add('AI kalitlari', false, 'birorta kalit kiritilmagan', '⚙ Modellar → Google Gemini yoki Groq → 🔑 Kalit olish → joylang → Saqlash');
  for (const p of active) {
    let ok = false, msg = '';
    for (const m of p.models.slice(0, 2)) { try { const r = await fetchT(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: headers(p), body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'OK deb yoz' }], max_tokens: 10 }) }, 25000);
      const t = await r.text(); if (r.ok) { ok = true; msg = m + ' ishlayapti'; break; } msg = m + ': ' + r.status + ' ' + t.slice(0, 140); } catch (err) { msg = m + ': ' + err.message; } }
    add('AI: ' + p.name, ok, msg, ok ? '' : p.local ? 'Ollama o\'rnatilmagan/ishlamayapti — ⚙ Modellar → INTERNETSIZ AI' : /401|403|invalid|API key/i.test(msg) ? 'Kalit noto\'g\'ri — qayta oling' : /404|not found|does not exist/i.test(msg) ? 'Model nomi eskirgan — "⬇ Modellarni yuklash" bilan yangisini tanlang' : /429/.test(msg) ? 'Limit tugagan — keyinroq yoki boshqa xizmat' : 'Internet yoki xizmat muammosi');
  }
  const g = c.providers.find(p => p.id === 'groq'), gm = c.providers.find(p => p.id === 'gemini');
  add('Ovozni tanish (STT)', !!((g && g.key) || (gm && gm.key)), g && g.key ? 'Groq Whisper' : gm && gm.key ? 'Gemini' : 'kalit yo\'q', 'Groq yoki Gemini kaliti kerak');
  const t = readTok(); const gc = gcfg();
  add('Google kirish', !!(t && t.refresh_token), t && t.refresh_token ? 'kirilgan: ' + (t.email || '') + (t.scope && !/gmail/.test(t.scope) ? ' (Gmail ruxsati yo\'q — qayta kiring)' : '') : gc.clientId ? 'kirilmagan' : 'Client ID kiritilmagan', '⚙ Modellar → GOOGLE XOTIRA → 1-qadam va "🔑 Google bilan kirish"');
  if (t && t.refresh_token) { try { await gToken(); const r = await (await gfetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user')).json(); const q = r.storageQuota || {}; const full = q.limit && +q.usage >= +q.limit * 0.99;
      add('Google Drive', !full, full ? 'XOTIRA TO\'LGAN (' + (q.usage / 1e9).toFixed(1) + ' / ' + (q.limit / 1e9).toFixed(1) + ' GB)' : 'ishlayapti', full ? 'one.google.com/storage da joy bo\'shating — aks holda sinxron ishlamaydi' : '');
      try { await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/labels'); add('Gmail', true, 'ishlayapti'); } catch (er) { add('Gmail', false, er.message.slice(0, 120), 'Chiqib, qayta "Google bilan kirish" (Gmail ruxsatini bering)'); }
      try { await gfetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1'); add('Kalendar', true, 'ishlayapti'); } catch (er) { add('Kalendar', false, er.message.slice(0, 120), 'Google Cloud\'da Calendar API ni yoqing va qayta kiring'); }
    } catch (er) { add('Google token', false, er.message.slice(0, 160), /invalid_grant|relogin/.test(er.message) ? 'Qayta "Google bilan kirish"' : 'Google Cloud sozlamasini tekshiring'); } }
  try { const r = await fetchT(OLL + '/api/tags', {}, 2500); const j = await r.json(); add('Internetsiz AI (Ollama)', (j.models || []).length > 0, (j.models || []).map(m => m.name).join(', ') || 'model yo\'q', 'Modelni yuklang'); } catch (er) { add('Internetsiz AI (Ollama)', false, 'o\'rnatilmagan', 'Ixtiyoriy: ⚙ Modellar → INTERNETSIZ AI'); }
  const tg = tgCfg(); if (tg.token) add('Telegram', !!tg.owner && TG.on, TG.conflict ? 'bu bot boshqa qurilmada ishlayapti — bu yerda to\'xtatildi' : tg.owner ? (TG.on ? 'ishlayapti' : 'o\'chiq') : 'ulanmagan (kodni botga yuboring)', TG.conflict ? 'Telegram faqat bitta qurilmada yoqilsin (kompyuter tavsiya). Shu qurilmada kerak bo\'lsa — Telegram sozlamasida qayta yoqing' : '');
  return { items };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#03080f', title: 'JARVIS',
    autoHideMenuBar: true,
    show: !process.argv.includes('--hidden'), icon: path.join(BASE_APP, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  MAINWIN = win;
  win.on('close', e => { if (!app.__quitting) { e.preventDefault(); win.hide(); if (!trayTipShown) { trayTipShown = true; try { new Notification({ title: 'JARVIS fonda ishlayapti', body: '"Jarvis" deb chaqiring yoki pastdagi belgini bosing. To\'liq chiqish — belgi ustida o\'ng tugma → Chiqish.' }).show(); } catch (er) {} } } });
  makeTray();
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('jarvis:')) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL('jarvis://app/index.html');
  TG.win = win; const t = tgCfg(); if (t.token && t.owner && t.enabled !== false) { TG.on = true; tgLoop(); }
}
app.whenReady().then(() => {
  protocol.handle('jarvis', req => { const u = new URL(req.url); const rel = decodeURIComponent(u.pathname); let f = path.normalize(path.join(__dirname, rel)); if (!f.startsWith(__dirname)) return new Response('no', { status: 403 }); if (!fs.existsSync(f) && BASE_APP !== __dirname) { const g = path.normalize(path.join(BASE_APP, rel)); if (g.startsWith(BASE_APP)) f = g; } return net.fetch(pathToFileURL(f).toString()); });
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*', '*://*.ytimg.com/*'] }, (d, cb) => { const h = d.requestHeaders; if (!h.Referer || /^jarvis:/.test(h.Referer)) h.Referer = 'https://jarvis.uz/'; cb({ requestHeaders: h }); });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-sanitized-write', 'clipboard-read', 'notifications'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ['media', 'clipboard-sanitized-write'].includes(perm));
  createWindow();
});
app.on('window-all-closed', () => { if (app.__quitting) app.quit(); });
app.on('before-quit', () => { app.__quitting = true; });
let MAINWIN = null, TRAY = null, trayTipShown = false;
function showMain() { if (!MAINWIN) return; if (MAINWIN.isMinimized()) MAINWIN.restore(); MAINWIN.show(); MAINWIN.focus(); }
function makeTray() {
  if (TRAY) return;
  try {
    TRAY = new Tray(nativeImage.createFromPath(path.join(BASE_APP, 'icon.png')).resize({ width: 16, height: 16 }));
    const menu = () => Menu.buildFromTemplate([
      { label: "JARVIS'ni ochish", click: showMain },
      { label: 'Windows bilan birga ishga tushsin', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: it => { app.setLoginItemSettings({ openAtLogin: it.checked, args: ['--hidden'] }); } },
      { type: 'separator' },
      { label: 'Chiqish', click: () => { app.__quitting = true; app.quit(); } }]);
    TRAY.setToolTip('JARVIS — "Jarvis" deb chaqiring'); TRAY.setContextMenu(menu()); TRAY.on('click', showMain); TRAY.on('right-click', () => TRAY.setContextMenu(menu()));
  } catch (e) { logw('TRAY: ' + e.message); }
}
ipcMain.handle('win:show', () => { showMain(); return true; });
if (!app.requestSingleInstanceLock()) { app.__quitting = true; app.exit(0); } else app.on('second-instance', () => showMain());
// birinchi ishga tushishda — Windows bilan birga ochilsin (fonda)
app.whenReady().then(() => { try { const f = path.join(app.getPath('userData'), '.autostart-set'); if (!fs.existsSync(f)) { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); fs.writeFileSync(f, '1'); } } catch (e) {} });

/* ================= AVTOMATIK YANGILANISH (GitHub Releases) ================= */
const UPD_API = 'https://api.github.com/repos/Murodjonbest/jarvis-apk/releases/latest';
const UPD_DIR = () => path.join(app.getPath('appData'), 'Jarvis', 'app-update');
const verArr = v => String(v || '0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const isNewer = (a, b) => { const x = verArr(a), y = verArr(b); for (let i = 0; i < 4; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const myVersion = () => require(path.join(__dirname, 'package.json')).version;
let UPD = { ready: false };
function unzipTo(buf, dir) {
  const zlib = require('zlib'); let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip buzilgan'); const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8'); p += 46 + nl + xl + cl;
    const ln = buf.readUInt16LE(lo + 26), lx = buf.readUInt16LE(lo + 28); const raw = buf.slice(lo + 30 + ln + lx, lo + 30 + ln + lx + cs);
    const out = path.normalize(path.join(dir, name)); if (!out.startsWith(dir)) continue;
    if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, method === 0 ? raw : zlib.inflateRawSync(raw));
  }
}
async function updCheck() {
  try {
    const r = await fetchT(UPD_API, { headers: { 'User-Agent': 'Jarvis', Accept: 'application/vnd.github+json' } }, 20000); if (!r.ok) return { error: 'GitHub ' + r.status };
    const j = await r.json(); const latest = String(j.tag_name || '').replace(/^v/, ''); const a = (j.assets || []).find(x => x.name === 'jarvis-desktop-update.zip');
    return { current: myVersion(), latest, available: !!a && isNewer(latest, myVersion()), url: a && a.browser_download_url, full: ((j.assets || []).find(x => x.name === 'Jarvis-Desktop.zip') || {}).browser_download_url, notes: (j.body || '').slice(0, 800) };
  } catch (e) { return { error: e.message }; }
}
async function updInstall() {
  const c = await updCheck(); if (c.error) return c; if (!c.available) return { ok: true, nothing: true, current: c.current };
  try {
    const buf = Buffer.from(await (await fetchT(c.url, { headers: { 'User-Agent': 'Jarvis' } }, 300000)).arrayBuffer());
    const tmp = UPD_DIR() + '.tmp'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true }); unzipTo(buf, tmp);
    const pj = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')); if (!fs.existsSync(path.join(tmp, 'main.js')) || !isNewer(pj.version, myVersion())) throw new Error('yangilanish fayli noto\'g\'ri');
    fs.rmSync(UPD_DIR(), { recursive: true, force: true }); fs.renameSync(tmp, UPD_DIR()); UPD = { ready: true, version: pj.version };
    logw('UPDATE: ' + pj.version + ' tayyor'); return { ok: true, version: pj.version };
  } catch (e) { logw('UPDATE: ' + e.message); return { error: e.message }; }
}
ipcMain.handle('upd:check', () => updCheck());
ipcMain.handle('upd:install', () => updInstall());
ipcMain.handle('upd:restart', () => { app.__quitting = true; app.relaunch(); app.exit(0); });
ipcMain.handle('app:version', () => myVersion());

