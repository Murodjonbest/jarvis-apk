/* JARVIS — Android ko'prigi.
   Kompyuter versiyasidagi (Electron main.js) barcha imkoniyatlarni telefon ichida bajaradi:
   AI modellar, ovozni tanish, Google (Drive/Gmail/Calendar), Telegram, Gemini ovozi, Live, shifrlash, tekshiruv. */
(function () {
  'use strict';
  window.JARVIS_MOBILE = true;
  const CE = window.capacitorExports || {};
  const isNative = !!(CE.Capacitor && CE.Capacitor.isNativePlatform && CE.Capacitor.isNativePlatform());
  const reg = n => { try { return CE.registerPlugin ? CE.registerPlugin(n) : null; } catch (e) { return null; } };
  const Http = CE.CapacitorHttp || null, Browser = reg('Browser'), Launcher = reg('AppLauncher'), Loop = reg('Loopback'), AppP = reg('App');

  /* ---------- saqlash (localStorage) ---------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('jn_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jn_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const raw = () => LS.get('cfg', {}), saveRaw = r => LS.set('cfg', r);

  /* ---------- log ---------- */
  function logw(m) { try { let l = LS.get('log', []); l.push(new Date().toISOString() + ' ' + String(m).replace(/(key=|Bearer |gsk_|AIza|sk-)[\w-]{6,}/g, '$1***')); if (l.length > 400) l = l.slice(-300); LS.set('log', l); } catch (e) {} }
  window.addEventListener('error', e => logw('JS: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => logw('PROMISE: ' + ((e.reason && e.reason.message) || e.reason)));

  /* ---------- tarmoq: avval to'g'ridan (native, CORS'siz), bo'lmasa brauzer fetch ---------- */
  function mkResp(status, headers, body) {
    const h = {}; Object.keys(headers || {}).forEach(k => h[k.toLowerCase()] = headers[k]);
    const text = typeof body === 'string' ? body : body == null ? '' : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: { get: k => h[String(k).toLowerCase()] || null }, text: async () => text, json: async () => JSON.parse(text) };
  }
  async function fetchT(url, opts, ms) {
    opts = opts || {}; ms = ms || 90000;
    const body = opts.body;
    if (isNative && Http && (body == null || typeof body === 'string') && !opts.binary) {
      try {
        const r = await Http.request({ url, method: opts.method || 'GET', headers: opts.headers || {}, data: body == null ? undefined : body, responseType: 'text', connectTimeout: Math.min(ms, 30000), readTimeout: ms, dataType: 'string' });
        return mkResp(r.status, r.headers, r.data);
      } catch (e) { const er = new Error('fetch failed: ' + (e.message || e)); er.name = /timeout/i.test(e.message || '') ? 'AbortError' : 'TypeError'; throw er; }
    }
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  async function fetchBin(url, ms) {
    if (isNative && Http) { const r = await Http.request({ url, method: 'GET', responseType: 'arraybuffer', readTimeout: ms || 30000 }); return b64ToBytes(typeof r.data === 'string' ? r.data : ''); }
    return new Uint8Array(await (await fetchT(url, {}, ms)).arrayBuffer());
  }
  async function online() { try { const r = await fetchT('https://www.google.com/generate_204', {}, 6000); return r.status === 204 || r.ok; } catch (e) { return false; } }

  /* ---------- base64 ---------- */
  function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function b64ToBytes(b) { const s = atob(String(b || '').replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  const utf8 = s => new TextEncoder().encode(s), unutf8 = u => new TextDecoder().decode(u);
  const b64utf8 = s => bytesToB64(utf8(s)), b64url = s => b64utf8(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => { try { return unutf8(b64ToBytes(s)); } catch (e) { return ''; } };
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  const b64uB = u => bytesToB64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  /* ---------- AI provayderlar ---------- */
  const DEFAULT_PROVIDERS = [
    { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', key: '', enabled: true, models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], keyUrl: 'https://console.groq.com/keys', note: 'Juda tez. Ovozni matnga aylantirish (Whisper) ham shu kalit bilan ishlaydi.' },
    { id: 'gemini', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: '', enabled: true, models: ['gemini-flash-latest', 'gemini-flash-lite-latest'], keyUrl: 'https://aistudio.google.com/apikey', note: 'Google hisobingiz bilan bepul kalit. O\'zbek tilini yaxshi biladi, tiniq ovoz ham shu kalit bilan.' },
    { id: 'openrouter', name: 'OpenRouter (Qwen, GLM, Kimi…)', base: 'https://openrouter.ai/api/v1', key: '', enabled: true, models: ['openrouter/free'], keyUrl: 'https://openrouter.ai/keys', note: '"openrouter/free" — bepul modellardan birini o\'zi tanlaydi.' },
    { id: 'nvidia', name: 'NVIDIA NIM (Kimi, GLM)', base: 'https://integrate.api.nvidia.com/v1', key: '', enabled: true, models: ['moonshotai/kimi-k2.6', 'z-ai/glm-5.3'], keyUrl: 'https://build.nvidia.com/settings/api-keys', note: 'Model nomlari tez-tez o\'zgaradi — "Modellarni yuklash" bilan tekshiring.' },
    { id: 'cerebras', name: 'Cerebras', base: 'https://api.cerebras.ai/v1', key: '', enabled: false, models: ['gpt-oss-120b'], keyUrl: 'https://cloud.cerebras.ai', note: 'Juda tez, bepul limit bilan.' },
    { id: 'claude', name: 'Claude API (pullik)', base: 'https://api.anthropic.com/v1', key: '', enabled: false, models: ['claude-sonnet-5-5'], keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Ixtiyoriy, pullik.' }
  ];
  function loadCfg() {
    const c = raw();
    const provs = DEFAULT_PROVIDERS.map(d => Object.assign({}, d, (c.providers || []).find(p => p.id === d.id) || {}));
    if (c.order) provs.sort((a, b) => (c.order.indexOf(a.id) + 1 || 99) - (c.order.indexOf(b.id) + 1 || 99));
    return { providers: provs, sttLang: c.sttLang || 'uz', order: provs.map(p => p.id) };
  }
  function saveCfg(c) { const r = raw(); saveRaw({ ...r, ...c }); }
  const persistProv = c => saveCfg({ providers: c.providers.map(({ id, key, enabled, models }) => ({ id, key, enabled, models })), sttLang: c.sttLang, order: c.providers.map(p => p.id) });
  const cooldown = {}, aborted = new Set();
  function headers(p) {
    const h = { 'Content-Type': 'application/json' }; if (p.key) h.Authorization = 'Bearer ' + p.key;
    if (p.id === 'openrouter') { h['HTTP-Referer'] = 'https://jarvis.local'; h['X-Title'] = 'Jarvis Android'; }
    if (p.id === 'claude') { h['x-api-key'] = p.key; h['anthropic-version'] = '2023-06-01'; }
    return h;
  }
  async function chat({ id, messages, tools, tier }) {
    const cfg = loadCfg();
    const provs = cfg.providers.filter(p => p.enabled && p.key && p.models && p.models.length);
    if (!provs.length) return { error: { code: 'no_keys', message: 'Hech qanday model sozlanmagan. "⚙ Modellar" oynasida kamida bitta bepul API kalit kiriting (Gemini yoki Groq).' } };
    const errors = []; let netErrs = 0;
    for (const p of provs) {
      const models = tier === 'quick' ? [...p.models].reverse() : p.models;
      for (const m of models) {
        if (aborted.has(id)) { aborted.delete(id); return { error: { code: 'aborted', message: 'to\'xtatildi' } }; }
        const ck = p.id + '/' + m;
        if (cooldown[ck] && cooldown[ck] > Date.now()) { errors.push(`${p.name} ${m}: kutishda`); continue; }
        const body = { model: m, messages, max_tokens: 4096 };
        if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
        try {
          const r = await fetchT(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: headers(p), body: JSON.stringify(body) }, 120000);
          const txt = await r.text();
          if (!r.ok) {
            const ra = parseInt(r.headers.get('retry-after') || '0', 10);
            if (r.status === 429 || r.status >= 500) cooldown[ck] = Date.now() + Math.max(30, Math.min(600, ra || 60)) * 1000;
            if (r.status === 401 || r.status === 403) cooldown[ck] = Date.now() + 10 * 60 * 1000;
            errors.push(`${p.name} ${m}: ${r.status} ${txt.slice(0, 160)}`); continue;
          }
          const j = JSON.parse(txt); const msg = j.choices && j.choices[0] && j.choices[0].message;
          if (!msg) { errors.push(`${p.name} ${m}: bo'sh javob`); continue; }
          if (typeof msg.content === 'string') msg.content = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          delete msg.reasoning; delete msg.reasoning_content; delete msg.reasoning_details;
          return { message: msg, provider: p.name, model: m, tried: errors };
        } catch (err) { netErrs++; cooldown[ck] = Date.now() + 30000; errors.push(`${p.name} ${m}: ${err.name === 'AbortError' ? 'vaqt tugadi' : err.message}`); }
      }
    }
    if (netErrs && !(await online())) return { error: { code: 'offline', message: 'Internet yo\'q' } };
    logw('ROUTER: ' + errors.join(' | '));
    return { error: { code: 'rate_limited', message: 'Barcha modellar band yoki xato berdi:\n' + errors.join('\n') } };
  }
  async function models(pid) {
    const p = loadCfg().providers.find(x => x.id === pid); if (!p || !p.key) return { error: 'Avval API kalitni kiriting va saqlang.' };
    try {
      const r = await fetchT(p.base.replace(/\/$/, '') + '/models', { headers: headers(p) }, 30000); const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 200) };
      const j = JSON.parse(t); let list = (j.data || j.models || []).map(x => ({ id: (x.id || x.name || '').replace(/^models\//, ''), free: !!(x.pricing && +x.pricing.prompt === 0 && +x.pricing.completion === 0) }));
      if (pid === 'openrouter') list = list.filter(x => x.free || /:free$/.test(x.id) || x.id === 'openrouter/free');
      return { models: list.filter(x => x.id && !/whisper|embed|tts|guard|image|vision-only|audio/i.test(x.id)).map(x => x.id) };
    } catch (err) { return { error: err.message }; }
  }
  async function test(pid) {
    const p = loadCfg().providers.find(x => x.id === pid); if (!p || !p.key) return { error: 'Kalit yo\'q' };
    for (const m of p.models) {
      try { const r = await fetchT(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: headers(p), body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'Faqat "OK" deb javob ber.' }], max_tokens: 20 }) }, 40000);
        const t = await r.text(); if (r.ok) return { ok: true, model: m }; if (m === p.models[p.models.length - 1]) return { error: r.status + ' ' + t.slice(0, 200) };
      } catch (err) { if (m === p.models[p.models.length - 1]) return { error: err.message }; }
    }
    return { error: 'model yo\'q' };
  }

  /* ---------- ovozni matnga (Groq Whisper → Gemini) ---------- */
  async function multipartBody(fields, file) {
    const bd = '----jrv' + Date.now(); const parts = [];
    for (const [k, v] of Object.entries(fields)) parts.push(utf8(`--${bd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(utf8(`--${bd}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.bytes, utf8(`\r\n--${bd}--\r\n`));
    const len = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return { ct: 'multipart/form-data; boundary=' + bd, bytes: out };
  }
  async function groqWhisper(key, bytes, mime, name, lang) {
    const fields = { model: 'whisper-large-v3', response_format: 'json' }; if (lang && lang !== 'auto') fields.language = lang;
    const mp = await multipartBody(fields, { name, type: mime, bytes });
    // brauzer fetch (Groq CORS'ni qo'llaydi); bo'lmasa native (base64 orqali)
    try {
      const r = await fetchT('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': mp.ct }, body: mp.bytes }, 60000);
      const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 200) }; return { text: (JSON.parse(t).text || '').trim() };
    } catch (e) {
      if (!(isNative && Http)) throw e;
      const fd = { model: 'whisper-large-v3', response_format: 'json' }; if (lang && lang !== 'auto') fd.language = lang;
      const r = await Http.request({ url: 'https://api.groq.com/openai/v1/audio/transcriptions', method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'multipart/form-data' }, dataType: 'formData',
        data: [{ type: 'base64File', key: 'file', value: bytesToB64(bytes), fileName: name, contentType: mime }, ...Object.entries(fd).map(([k, v]) => ({ type: 'string', key: k, value: v }))], readTimeout: 60000 });
      const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; if (r.status >= 300) return { error: r.status + ' ' + JSON.stringify(j).slice(0, 200) }; return { text: (j.text || '').trim() };
    }
  }
  async function stt(data, mime) {
    const cfg = loadCfg(); const g = cfg.providers.find(p => p.id === 'groq'); const bytes = new Uint8Array(data);
    if (!g || !g.key) {
      const gm = cfg.providers.find(p => p.id === 'gemini');
      if (!gm || !gm.key) return { error: 'Ovozni tanish uchun Groq yoki Google Gemini kaliti kerak (⚙ Modellar).' };
      try {
        const r = await fetchT('https://generativelanguage.googleapis.com/v1beta/models/' + (gm.models[0] || 'gemini-flash-latest') + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gm.key },
          body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: (mime || 'audio/wav').split(';')[0], data: bytesToB64(bytes) } }, { text: 'Bu audioda aytilgan gapni AYNAN yozib ber (o\'zbek lotin yozuvida; ruscha gap bo\'lsa ruscha). Hech qanday izoh, tarjima yoki qo\'shimcha so\'z yozma. Gap bo\'lmasa bo\'sh qoldir.' }] }], generationConfig: { temperature: 0 } }) }, 60000);
        const t = await r.text(); if (!r.ok) return { error: 'Gemini STT: ' + r.status + ' ' + t.slice(0, 150) };
        const j = JSON.parse(t); const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        return { text: parts.map(x => x.text || '').join(' ').trim() };
      } catch (err) { return { error: err.message }; }
    }
    try { return await groqWhisper(g.key, bytes, (mime || 'audio/wav').split(';')[0], /wav/.test(mime || '') ? 'audio.wav' : /mp4|aac/.test(mime || '') ? 'audio.mp4' : 'audio.webm', cfg.sttLang); }
    catch (err) { return { error: err.message }; }
  }

  /* ---------- sozlamalar ---------- */
  function getCfg() { const c = loadCfg(); const gc = LS.get('gcfg', {}); return { ...c, google: { clientId: gc.clientId || '', hasSecret: !!gc.clientSecret }, providers: c.providers.map(p => ({ ...p, hasKey: !!p.key, key: p.key ? '••••' + p.key.slice(-4) : '' })) }; }
  function setCfg(upd) {
    const c = loadCfg(); let keysChanged = false; if (upd.sttLang) c.sttLang = upd.sttLang;
    for (const u of upd.providers || []) { const p = c.providers.find(x => x.id === u.id); if (!p) continue;
      if (typeof u.enabled === 'boolean') p.enabled = u.enabled; if (typeof u.key === 'string' && !u.key.startsWith('••••') && u.key.trim() !== p.key) { p.key = u.key.trim(); keysChanged = true; } if (Array.isArray(u.models)) p.models = u.models.filter(Boolean); }
    if (upd.order) c.providers.sort((a, b) => upd.order.indexOf(a.id) - upd.order.indexOf(b.id));
    persistProv(c); if (keysChanged) { const r = raw(); r.keysAt = Date.now(); saveRaw(r); } return true;
  }

  /* ---------- tashqi havola ---------- */
  async function openExt(url) {
    try { if (/^https?:/.test(url) && Browser) return await Browser.open({ url }); if (Launcher) return await Launcher.openUrl({ url }); } catch (e) {}
    window.open(url, '_blank');
  }

  /* ---------- GOOGLE: OAuth (telefon ichida loopback + PKCE) ---------- */
  const gcfg = () => LS.get('gcfg', {}), sgcfg = c => LS.set('gcfg', c);
  const readTok = () => LS.get('gtok', null), writeTok = t => LS.set('gtok', t);
  const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar openid email';
  async function gLogin() {
    const c = gcfg(); if (!c.clientId || !c.clientSecret) return { error: 'Avval Google Client ID va Client Secret kiriting (kompyuterdagi bilan bir xil).' };
    if (!Loop) return { error: 'Bu imkoniyat faqat Android ilovasida ishlaydi.' };
    const verifier = b64uB(rnd(48)), state = b64uB(rnd(16));
    const challenge = b64uB(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier))));
    let port; try { port = (await Loop.start()).port; } catch (e) { return { error: 'Lokal server ochilmadi: ' + e.message }; }
    const redirect = 'http://127.0.0.1:' + port;
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: c.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' });
    await openExt(url);
    let q; try { q = (await Loop.waitCode({ timeout: 300000 })).query || ''; } catch (e) { return { error: 'Vaqt tugadi yoki bekor qilindi' }; }
    try { Browser && Browser.close(); } catch (e) {}
    const u = new URLSearchParams(q); const code = u.get('code');
    if (u.get('state') !== state || !code) return { error: u.get('error') || 'state xato' };
    try {
      const r = await fetchT('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }).toString() }, 30000);
      const t = await r.json(); if (!t.refresh_token) return { error: 'Token olinmadi: ' + JSON.stringify(t).slice(0, 200) };
      let email = ''; try { email = JSON.parse(b64d(t.id_token.split('.')[1])).email || ''; } catch (e) {}
      writeTok({ refresh_token: t.refresh_token, access_token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000, email, scope: t.scope || '' });
      return { ok: true, email };
    } catch (err) { return { error: err.message }; }
  }
  async function gToken() {
    const t = readTok(); if (!t || !t.refresh_token) throw Object.assign(new Error('Google\'ga kirilmagan'), { code: 'no_login' });
    if (t.access_token && t.exp > Date.now()) return t.access_token;
    const c = gcfg();
    const r = await fetchT('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }).toString() }, 20000);
    const j = await r.json(); if (!j.access_token) throw Object.assign(new Error('Token yangilanmadi: ' + (j.error_description || j.error)), { code: j.error === 'invalid_grant' ? 'relogin' : 'auth' });
    t.access_token = j.access_token; t.exp = Date.now() + (j.expires_in - 60) * 1000; writeTok(t); return t.access_token;
  }
  async function gfetch(url, opts = {}) {
    const tok = await gToken();
    const r = await fetchT(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + tok } }, 60000);
    if (!r.ok) { const t = await r.text(); throw Object.assign(new Error(r.status + ' ' + t.slice(0, 200)), { code: /storageQuota|quotaExceeded/.test(t) ? 'quota' : 'drive' }); }
    return r;
  }
  const netCode = e => e.code || (/fetch failed|Failed to fetch|network|timeout|abort/i.test(e.message) ? 'offline' : 'drive');
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
  async function gPull() {
    try { const folder = await memFolder(); const files = await memFiles(folder); if (!files.length) return { empty: true };
      const t = await (await gfetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`)).text();
      return { content: t, id: files[0].id, modified: files[0].modifiedTime };
    } catch (e) { return { error: e.message, code: netCode(e) }; }
  }
  async function gPush(content) {
    try { const folder = await memFolder(); const files = await memFiles(folder);
      if (files[0]) { await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content }); return { ok: true, id: files[0].id }; }
      const bd = 'jrv' + Date.now();
      const body = `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: MEM_FILE, parents: [folder], mimeType: 'application/json' })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${bd}--`;
      const r = await (await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body })).json();
      return { ok: true, id: r.id };
    } catch (e) { return { error: e.message, code: netCode(e) }; }
  }


  /* ---------- KALITLAR: Google hisobi bilan avtomatik (kompyuter bilan bir xil format) ---------- */
  const KEY_FILE = 'jarvis_kalitlar.json';
  async function autoKey(email) { const h = await crypto.subtle.digest('SHA-256', utf8('jarvis-auto-v1|' + String(email).toLowerCase().trim())); return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function encAuto(email, obj) { const iv = rnd(12); const e = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await autoKey(email), utf8(JSON.stringify(obj))));
    return { v: 1, iv: bytesToB64(iv), tag: bytesToB64(e.slice(-16)), data: bytesToB64(e.slice(0, -16)) }; }
  async function decAuto(email, b) { const d = b64ToBytes(b.data), t = b64ToBytes(b.tag); const all = new Uint8Array(d.length + t.length); all.set(d); all.set(t, d.length);
    return JSON.parse(unutf8(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(b.iv) }, await autoKey(email), all)))); }
  function mergeKeys(local, remote) {
    const out = { at: Math.max(local.at || 0, remote.at || 0), keys: [], google: {} }; const newer = (remote.at || 0) > (local.at || 0) ? remote : local, older = newer === remote ? local : remote;
    const ids = new Set([...(local.keys || []), ...(remote.keys || [])].map(k => k.id));
    for (const id of ids) { const a = (newer.keys || []).find(k => k.id === id && k.key), b = (older.keys || []).find(k => k.id === id && k.key); if (a || b) out.keys.push(a || b); }
    out.google = (newer.google && newer.google.clientId) ? newer.google : (older.google || {}); return out;
  }
  const keysSig = b => JSON.stringify((b.keys || []).map(k => [k.id, k.key, k.enabled, (k.models || []).join(',')]).sort()) + '|' + ((b.google || {}).clientId || '') + ((b.google || {}).clientSecret || '');
  let keysBusy = null;
  function keysSync() { if (!keysBusy) keysBusy = keysSync0().finally(() => { keysBusy = null; }); return keysBusy; }
  async function keysSync0() {
    const t = readTok(); if (!t || !t.refresh_token || !t.email) return { skip: true };
    try {
      const folder = await memFolder();
      const q = encodeURIComponent(`name = '${KEY_FILE}' and '${folder}' in parents and trashed = false`);
      const files = ((await (await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id)&pageSize=5`)).json()).files || []);
      let remote = { at: 0, keys: [], google: {} };
      if (files[0]) { try { remote = await decAuto(t.email, JSON.parse(await (await gfetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`)).text())); } catch (e) { logw('KEYS decrypt: ' + e.message); } }
      const c = loadCfg(), r0 = raw(), gc = gcfg();
      const local = { at: r0.keysAt || 0, keys: c.providers.filter(p => p.key).map(p => ({ id: p.id, key: p.key, models: p.models, enabled: p.enabled })), google: { clientId: gc.clientId || '', clientSecret: gc.clientSecret || '' } };
      const m = mergeKeys(local, remote); let pulled = 0;
      for (const k of m.keys) { const p = c.providers.find(x => x.id === k.id); if (!p) continue; if (p.key !== k.key) { p.key = k.key; pulled++; } if (k.models && k.models.length) p.models = k.models; if (typeof k.enabled === 'boolean') p.enabled = k.enabled; }
      persistProv(c); const r1 = raw(); r1.keysAt = m.at; saveRaw(r1);
      if (m.google.clientId && m.google.clientSecret) sgcfg({ ...gcfg(), clientId: m.google.clientId, clientSecret: m.google.clientSecret });
      let pushed = false;
      if (keysSig(m) !== keysSig(remote) && m.keys.length) {
        const body = JSON.stringify(await encAuto(t.email, m));
        if (files[0]) await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
        else { const bd = 'jrv' + Date.now(); await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd },
          body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: KEY_FILE, parents: [folder], mimeType: 'application/json' })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${bd}--` }); }
        pushed = true;
      }
      return { ok: true, pulled, pushed, count: m.keys.length };
    } catch (e) { logw('KEYS: ' + e.message); return { error: e.message }; }
  }

  /* ---------- kalitlarni parol bilan shifrlash (kompyuter bilan bir xil format: scrypt N=16384 + AES-256-GCM) ---------- */
  async function deriveKey(pass, salt) {
    const k = await window.scrypt.scrypt(utf8(pass), salt, 16384, 8, 1, 32);
    return crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function secExport(pass, extra) {
    if (!pass || pass.length < 6) return { error: 'Parol kamida 6 belgi bo\'lsin' };
    const c = loadCfg(); const data = JSON.stringify({ extra, keys: c.providers.filter(p => p.key).map(p => ({ id: p.id, key: p.key, models: p.models, enabled: p.enabled })), google: gcfg(), sttLang: c.sttLang, order: c.order });
    const salt = rnd(16), iv = rnd(12); const key = await deriveKey(pass, salt);
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(data)));
    return { blob: { v: 1, salt: bytesToB64(salt), iv: bytesToB64(iv), tag: bytesToB64(enc.slice(-16)), data: bytesToB64(enc.slice(0, -16)) }, count: c.providers.filter(p => p.key).length };
  }
  async function secImport(blob, pass) {
    try {
      const key = await deriveKey(pass, b64ToBytes(blob.salt)); const d = b64ToBytes(blob.data), tag = b64ToBytes(blob.tag);
      const all = new Uint8Array(d.length + tag.length); all.set(d); all.set(tag, d.length);
      const j = JSON.parse(unutf8(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, all))));
      const c = loadCfg();
      for (const k of j.keys || []) { const p = c.providers.find(x => x.id === k.id); if (p) { p.key = k.key; if (k.models) p.models = k.models; if (typeof k.enabled === 'boolean') p.enabled = k.enabled; } }
      if (j.sttLang) c.sttLang = j.sttLang; persistProv(c);
      if (j.google && j.google.clientId) sgcfg({ ...gcfg(), ...j.google });
      return { ok: true, count: (j.keys || []).length, extra: j.extra || null };
    } catch (err) { return { error: 'Parol noto\'g\'ri yoki ma\'lumot buzilgan' }; }
  }

  /* ---------- Gemini tiniq ovozi ---------- */
  let ttsCool = 0;
  async function ttsGemini(text, voice) {
    const c = loadCfg(); const g = c.providers.find(p => p.id === 'gemini'); const r0 = raw();
    if (r0.ttsOn === false) return { error: 'off' }; if (!g || !g.key) return { error: 'no_key' }; if (ttsCool > Date.now()) return { error: 'cooldown' };
    const model = r0.ttsModel || 'gemini-2.5-flash-preview-tts';
    try {
      const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': g.key },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Charon' } } } } }) }, 60000);
      const t = await r.text(); if (!r.ok) { if (r.status === 429) ttsCool = Date.now() + 10 * 60 * 1000; return { error: r.status + ' ' + t.slice(0, 160) }; }
      const j = JSON.parse(t); const part = (((j.candidates || [])[0] || {}).content || {}).parts || []; const d = part.find(x => x.inlineData); if (!d) return { error: 'audio yo\'q' };
      const m = /rate=(\d+)/.exec(d.inlineData.mimeType || ''); return { pcm: d.inlineData.data, rate: m ? +m[1] : 24000 };
    } catch (err) { return { error: err.message }; }
  }
  function ttsCfg(upd) { const r = raw(); if (upd) { if (typeof upd.ttsOn === 'boolean') r.ttsOn = upd.ttsOn; if (upd.ttsModel) r.ttsModel = upd.ttsModel.trim(); saveRaw(r); ttsCool = 0; }
    return { ttsOn: r.ttsOn !== false, ttsModel: r.ttsModel || 'gemini-2.5-flash-preview-tts' }; }

  /* ---------- TELEFONNI BOSHQARISH (kompyuterdagi "pc" o'rniga) ---------- */
  const APPS = { telegram: 'tg://resolve', youtube: 'https://www.youtube.com', 'yutub': 'https://www.youtube.com', xarita: 'geo:0,0', maps: 'geo:0,0', 'google xarita': 'geo:0,0', chrome: 'https://www.google.com', brauzer: 'https://www.google.com', google: 'https://www.google.com',
    gmail: 'https://mail.google.com', pochta: 'https://mail.google.com', kalendar: 'https://calendar.google.com', drive: 'https://drive.google.com', whatsapp: 'whatsapp://send', instagram: 'https://instagram.com', 'play market': 'market://search?q=', 'sozlamalar': 'intent:#Intent;action=android.settings.SETTINGS;end', settings: 'intent:#Intent;action=android.settings.SETTINGS;end',
    'my.gov.uz': 'https://my.gov.uz', 'lex.uz': 'https://lex.uz', 'kun.uz': 'https://kun.uz' };
  async function pc(a) {
    try {
      switch (a.action) {
        case 'open_app': { const n = String(a.name || '').toLowerCase().trim(); let target = APPS[n] || a.name || '';
          if (/^\+?\d[\d\s-]{6,}$/.test(target)) target = 'tel:' + target.replace(/[\s-]/g, '');
          if (!/^[a-z][\w+.-]*:/i.test(target)) target = 'https://www.google.com/search?q=' + encodeURIComponent(target);
          await openExt(target); return { ok: true, opened: target }; }
        case 'call': await openExt('tel:' + String(a.name || a.text || '').replace(/[^\d+]/g, '')); return { ok: true };
        case 'sms': await openExt('sms:' + String(a.name || '').replace(/[^\d+]/g, '') + '?body=' + encodeURIComponent(a.text || '')); return { ok: true };
        case 'system_info': { let bat = null; try { const b = await navigator.getBattery(); bat = { level: Math.round(b.level * 100) + '%', charging: b.charging }; } catch (e) {}
          return { device: navigator.userAgent.replace(/.*\(|\).*/g, ''), lang: navigator.language, cores: navigator.hardwareConcurrency, ramGB: navigator.deviceMemory, online: navigator.onLine, battery: bat, screen: screen.width + 'x' + screen.height }; }
        default: return { error: 'Bu amal telefonda yo\'q (faqat kompyuter versiyasida).' };
      }
    } catch (err) { return { error: err.message }; }
  }

  /* ---------- INTERNET: ob-havo, yangiliklar, sahifa, vikipediya ---------- */
  const strip = s => String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const FEEDS = { kun: 'https://kun.uz/news/rss', daryo: 'https://daryo.uz/feed/', gazeta: 'https://www.gazeta.uz/uz/rss/', uza: 'https://uza.uz/uz/rss' };
  const WMO = { 0: 'ochiq', 1: 'asosan ochiq', 2: 'qisman bulutli', 3: 'bulutli', 45: 'tuman', 48: 'qirovli tuman', 51: 'mayda shivalama', 53: 'shivalama', 55: 'kuchli shivalama', 61: 'yengil yomg\'ir', 63: 'yomg\'ir', 65: 'kuchli yomg\'ir', 71: 'yengil qor', 73: 'qor', 75: 'kuchli qor', 80: 'jala', 81: 'kuchli jala', 82: 'juda kuchli jala', 95: 'momaqaldiroq', 96: 'do\'lli momaqaldiroq', 99: 'kuchli do\'l' };
  async function web(a) {
    try {
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
    } catch (err) { return { error: /fetch failed|Failed to fetch|abort/i.test(err.message) ? 'Internet yo\'q' : err.message }; }
  }

  /* ---------- TELEGRAM ---------- */
  const TG = { on: false, offset: 0, code: '', polling: false, pending: new Map(), onIn: null, onPaired: null };
  const tgCfg = () => raw().tg || {}, tgSave = t => { const r = raw(); r.tg = { ...(r.tg || {}), ...t }; saveRaw(r); };
  async function tgApi(m, body) { const r = await fetchT(`https://api.telegram.org/bot${tgCfg().token}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }, 65000); return r.json(); }
  async function tgSend(chat, text) { const s = String(text || '…'); for (let i = 0; i < s.length; i += 3900) await tgApi('sendMessage', { chat_id: chat, text: s.slice(i, i + 3900) }); }
  async function tgVoiceToText(fileId) {
    const f = await tgApi('getFile', { file_id: fileId }); if (!f.ok) throw new Error('fayl yo\'q');
    const buf = await fetchBin(`https://api.telegram.org/file/bot${tgCfg().token}/${f.result.file_path}`, 30000);
    const cfg = loadCfg(); const g = cfg.providers.find(p => p.id === 'groq'); if (!g || !g.key) throw new Error('Ovozni tanish uchun Groq kaliti kerak');
    const r = await groqWhisper(g.key, buf, 'audio/ogg', 'voice.ogg', cfg.sttLang); if (r.error) throw new Error(r.error); return r.text;
  }
  async function tgLoop() {
    if (TG.polling) return; TG.polling = true;
    while (TG.on && tgCfg().token) {
      try {
        const u = await tgApi('getUpdates', { offset: TG.offset, timeout: 50, allowed_updates: ['message'] });
        if (!u.ok) { await new Promise(r => setTimeout(r, 10000)); continue; }
        for (const up of u.result) { TG.offset = up.update_id + 1; const m = up.message; if (!m) continue; const chat = m.chat.id; const owner = tgCfg().owner; const txt0 = (m.text || '').trim();
          if (!owner) { if (TG.code && txt0 === TG.code) { tgSave({ owner: chat, ownerName: m.from.first_name || '' }); TG.code = ''; await tgSend(chat, '✅ Ulandingiz, ser. Endi menga yozing yoki ovozli xabar yuboring.'); TG.onPaired && TG.onPaired(m.from.first_name || ''); }
            else await tgSend(chat, 'Jarvis: ulanish kodini yuboring (Jarvis → ⚙ Modellar → Telegram).'); continue; }
          if (chat !== owner) { await tgSend(chat, '⛔ Bu Jarvis faqat egasi uchun ishlaydi.'); continue; }
          let text = txt0;
          try { if (m.voice || m.audio) { await tgApi('sendChatAction', { chat_id: chat, action: 'typing' }); text = await tgVoiceToText((m.voice || m.audio).file_id); if (text) await tgSend(chat, '🎙 ' + text); } }
          catch (er) { await tgSend(chat, '✕ ' + er.message); continue; }
          if (!text) continue; await tgApi('sendChatAction', { chat_id: chat, action: 'typing' });
          const id = 'tg' + up.update_id;
          const p = new Promise(res => { TG.pending.set(id, res); setTimeout(() => { if (TG.pending.has(id)) { TG.pending.delete(id); res('⌛ Jarvis javob bermadi (ilova ochiqmi?).'); } }, 180000); });
          if (TG.onIn) TG.onIn({ id, text }); else TG.pending.get(id)('Jarvis tayyor emas.');
          p.then(ans => tgSend(chat, ans).catch(() => {}));
        }
      } catch (er) { await new Promise(r => setTimeout(r, 8000)); }
    }
    TG.polling = false;
  }
  async function tgSet(a) {
    if (a.token) { const tok = a.token.trim(); let r = {}; try { r = await (await fetchT(`https://api.telegram.org/bot${tok}/getMe`, {}, 15000)).json(); } catch (e) {} if (!r.ok) return { error: 'Token noto\'g\'ri yoki internet yo\'q' }; tgSave({ token: tok, owner: null, bot: r.result.username }); }
    if (a.unpair) tgSave({ owner: null }); if (typeof a.enabled === 'boolean') tgSave({ enabled: a.enabled });
    const t = tgCfg(); TG.on = !!(t.token && t.enabled !== false);
    if (TG.on && !t.owner) TG.code = String(Math.floor(100000 + Math.random() * 900000));
    if (TG.on) tgLoop();
    return { ok: true, bot: t.bot, code: TG.code, owner: !!t.owner };
  }

  /* ---------- GOOGLE: Gmail, Calendar, Drive vositalari ---------- */
  const DRV = 'https://www.googleapis.com/drive/v3', GML = 'https://gmail.googleapis.com/gmail/v1/users/me', CAL = 'https://www.googleapis.com/calendar/v3';
  const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const gj = async (url, opts) => (await gfetch(url, opts)).json();
  const hdr = (m, n) => { const x = ((m.payload && m.payload.headers) || []).find(h => h.name.toLowerCase() === n); return x ? x.value : ''; };
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
      create_draft: async a => { const raw = [`To: ${a.to || ''}`, a.cc ? `Cc: ${a.cc}` : '', `Subject: =?UTF-8?B?${b64utf8(a.subject || '')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64utf8(a.body || a.text || '')].filter((x, i) => x !== '' || i === 6).join('\r\n');
        return gj(`${GML}/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { raw: b64url(raw), threadId: a.threadId } }) }); }
    },
    'Google Calendar': {
      list_calendars: () => gj(`${CAL}/users/me/calendarList`).then(r => ({ calendars: (r.items || []).map(c => ({ id: c.id, summary: c.summary, primary: !!c.primary })) })),
      list_events: a => gj(`${CAL}/calendars/${encodeURIComponent(a.calendarId || 'primary')}/events?${qs({ timeMin: a.timeMin || new Date().toISOString(), timeMax: a.timeMax, maxResults: a.maxResults || 50, singleEvents: true, orderBy: 'startTime' })}`).then(r => ({ events: (r.items || []).map(e => ({ id: e.id, summary: e.summary, start: e.start, end: e.end, location: e.location, description: (e.description || '').slice(0, 300) })) })),
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
  function gapiList() { const t = readTok(); if (!t || !t.refresh_token) return { servers: [] }; const sc = t.scope || 'drive';
    return { servers: Object.keys(GAPI).filter(s => s === 'Google Drive' ? true : s === 'Gmail' ? /gmail/.test(sc) : /calendar/.test(sc)).map(s => ({ server: s, authStatus: 'connected', tools: Object.keys(GAPI[s]).map(name => ({ name, description: '' })) })) }; }
  function gapiDescribe(tool) { const s = GSCHEMA[tool]; if (!s) return null; const props = {}, req = [];
    for (const k in s) { props[k] = { type: s[k] === 'number' ? 'number' : 'string', description: String(s[k]).replace(/^\*/, '') }; if (String(s[k]).startsWith('*')) req.push(k); }
    return { inputSchema: { type: 'object', properties: props, required: req } }; }
  async function gapiCall(server, tool, input) {
    const f = GAPI[server] && GAPI[server][tool]; if (!f) return { error: { code: 'not_in_manifest', message: 'Bunday vosita yo\'q' } };
    try { return { payload: await f(input || {}) }; }
    catch (err) { const m = String(err.message || err); return { error: { code: err.code === 'no_login' ? 'server_not_connected' : /\b401\b|invalid_grant|relogin/.test(m) ? 'needs_reauth' : /\b403\b/.test(m) ? 'not_in_manifest' : /fetch failed|Failed to fetch|abort/i.test(m) ? 'server_unavailable' : 'tool_error', message: m.slice(0, 400) } }; }
  }

  /* ---------- tekshiruv ---------- */
  async function diag() {
    const items = []; const add = (name, ok, msg, fix) => { items.push({ name, ok, msg, fix }); if (!ok) logw('DIAG ' + name + ': ' + msg); };
    add('Ilova', true, 'Android ' + (isNative ? '(native)' : '(brauzer)') + ' · v2.0', '');
    const on = await online(); add('Internet', on, on ? 'bor' : 'yo\'q', on ? '' : 'Internetga ulaning (internetsiz faqat vaqt, hisob, qaydlar, eslatmalar va Python/JS kod ishlaydi)');
    const c = loadCfg(); const active = c.providers.filter(p => p.enabled && p.key);
    if (!active.length) add('AI kalitlari', false, 'birorta kalit kiritilmagan', '⚙ Modellar → Google Gemini yoki Groq → 🔑 Kalit olish → joylang → Saqlash. Yoki: kompyuterda "Google\'ga shifrlab saqlash", telefonda "Google\'dan tiklash".');
    for (const p of active) {
      let ok = false, msg = '';
      for (const m of p.models.slice(0, 2)) { try { const r = await fetchT(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: headers(p), body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'OK deb yoz' }], max_tokens: 10 }) }, 25000);
        const t = await r.text(); if (r.ok) { ok = true; msg = m + ' ishlayapti'; break; } msg = m + ': ' + r.status + ' ' + t.slice(0, 140); } catch (err) { msg = m + ': ' + err.message; } }
      add('AI: ' + p.name, ok, msg, ok ? '' : /401|403|invalid|API key/i.test(msg) ? 'Kalit noto\'g\'ri — qayta oling' : /404|not found|does not exist/i.test(msg) ? 'Model nomi eskirgan — "⬇ Modellarni yuklash"' : /429/.test(msg) ? 'Limit tugadi — biroz kuting yoki boshqa kalit qo\'shing' : 'Internetni tekshiring');
    }
    const g = c.providers.find(p => p.id === 'groq'), gm = c.providers.find(p => p.id === 'gemini');
    add('Ovozni tanish (STT)', !!((g && g.key) || (gm && gm.key)), g && g.key ? 'Groq Whisper' : gm && gm.key ? 'Gemini' : 'kalit yo\'q', 'Groq yoki Gemini kaliti kerak');
    let ttsN = 0; try { ttsN = (window.speechSynthesis && speechSynthesis.getVoices().length) || 0; } catch (e) {}
    add('Telefon ovozi (TTS)', ttsN > 0 || !!(gm && gm.key), (gm && gm.key ? 'Gemini tiniq ovoz' : '') + (ttsN ? ' + ' + ttsN + ' ta telefon ovozi' : ''), 'Sozlamalar → Til → Matnni nutqqa aylantirish → Google TTS o\'rnating');
    const t = readTok(); const gc = gcfg();
    add('Google kirish', !!(t && t.refresh_token), t && t.refresh_token ? 'kirilgan: ' + (t.email || '') : gc.clientId ? 'kirilmagan' : 'Client ID kiritilmagan', '⚙ Modellar → GOOGLE XOTIRA → Client ID/Secret (kompyuterdagi bilan bir xil) → "Google bilan kirish"');
    if (t && t.refresh_token) { try { await gToken(); const r = await (await gfetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user')).json(); const q = r.storageQuota || {}; const full = q.limit && +q.usage >= +q.limit * 0.99;
        add('Google Drive', !full, full ? 'XOTIRA TO\'LGAN (' + (q.usage / 1e9).toFixed(1) + ' / ' + (q.limit / 1e9).toFixed(1) + ' GB)' : 'ishlayapti', full ? 'one.google.com/storage da joy bo\'shating — aks holda sinxron ishlamaydi' : '');
        try { await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/labels'); add('Gmail', true, 'ishlayapti'); } catch (er) { add('Gmail', false, er.message.slice(0, 120), 'Chiqib, qayta "Google bilan kirish" (Gmail ruxsatini bering)'); }
        try { await gfetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1'); add('Kalendar', true, 'ishlayapti'); } catch (er) { add('Kalendar', false, er.message.slice(0, 120), 'Google Cloud\'da Calendar API ni yoqing va qayta kiring'); }
      } catch (er) { add('Google token', false, er.message.slice(0, 160), /invalid_grant|relogin/.test(er.message) ? 'Qayta "Google bilan kirish"' : 'Google Cloud sozlamasini tekshiring'); } }
    const tg = tgCfg(); if (tg.token) add('Telegram', !!tg.owner && TG.on, tg.owner ? (TG.on ? 'ishlayapti' : 'o\'chiq') : 'ulanmagan (kodni botga yuboring)', '');
    return { items };
  }

  /* ---------- Live ---------- */
  function liveCfg() { const c = loadCfg(); const g = c.providers.find(p => p.id === 'gemini'); const r = raw(); return { key: g && g.key || '', model: r.liveModel || 'gemini-2.5-flash-native-audio-latest', voice: r.liveVoice || 'Charon' }; }
  function liveSet(u) { const r = raw(); if (u.model) r.liveModel = u.model.trim(); if (u.voice) r.liveVoice = u.voice; saveRaw(r); return true; }

  const A = f => (...a) => Promise.resolve().then(() => f(...a));
  window.jarvisNative = {
    platform: 'android',
    chat: A(chat), abort: A(id => { aborted.add(id); }), models: A(models), test: A(test), stt: A(stt),
    getCfg: A(getCfg), setCfg: A(setCfg), storeGet: A(() => LS.get('store', null)), storeSet: A(v => { LS.set('store', v); return true; }),
    open: A(openExt), net: A(online),
    gSetClient: A(({ clientId, clientSecret }) => { const c = gcfg(); if (/^JRV1:/.test((clientId || '').trim())) { try { const j = JSON.parse(b64d(clientId.trim().slice(5))); clientId = j.i; clientSecret = j.s; } catch (er) {} } if (clientId) c.clientId = clientId.trim(); if (clientSecret && !clientSecret.startsWith('••')) c.clientSecret = clientSecret.trim(); sgcfg(c); return true; }),
    gStatus: A(() => { const t = readTok(); const sc = (t && t.scope) || ''; const c = gcfg(); return { configured: !!(c.clientId && c.clientSecret), loggedIn: !!(t && t.refresh_token), email: t && t.email || '', gmail: /gmail/.test(sc), calendar: /calendar/.test(sc), drive: /auth\/drive/.test(sc) || (t && !t.scope) }; }),
    gLogin: A(gLogin), keysSync: A(keysSync), gLogout: A(() => { LS.set('gtok', null); return true; }), gPull: A(gPull), gPush: A(gPush),
    ttsGemini: A(ttsGemini), ttsCfg: A(ttsCfg), secExport: A(secExport), secImport: A(secImport),
    pc: A(pc), web: A(web), gapiList: A(gapiList), gapiDescribe: A(gapiDescribe), gapiCall: A(gapiCall),
    diag: A(diag), log: A(m => { logw(m); return true; }), logRead: A(() => LS.get('log', []).join('\n')),
    liveCfg: A(liveCfg), liveSet: A(liveSet), screenshot: A(() => ({ error: 'Telefonda ekran rasmini olish yo\'q — kamerani ishlating.' })),
    tgGet: A(() => { const t = tgCfg(); return { hasToken: !!t.token, on: TG.on, owner: !!t.owner, ownerName: t.ownerName || '', code: TG.code, enabled: t.enabled !== false }; }),
    tgSet: A(tgSet), tgNotify: A(async text => { const t = tgCfg(); if (!t.token || !t.owner || t.enabled === false) return false; try { await tgSend(t.owner, text); return true; } catch (er) { return false; } }),
    tgReply: A((id, text) => { const f = TG.pending.get(id); if (f) { TG.pending.delete(id); f(text); } return true; }),
    onTg: cb => { TG.onIn = cb; }, onTgPaired: cb => { TG.onPaired = cb; }
  };
  // Telegram oldin yoqilgan bo'lsa — avtomatik
  setTimeout(() => { const t = tgCfg(); if (t.token && t.owner && t.enabled !== false) { TG.on = true; tgLoop(); } }, 3000);
  // orqaga tugmasi: ilovadan chiqib ketmasin, oynalarni yopsin
  try { isNative && AppP && AppP.addListener('backButton', () => { if (window.mobBack && window.mobBack()) return; const m = document.querySelector('#modal.show, .win.open, .modal.show'); if (m) { const x = m.querySelector('[data-x], .x, .close'); if (x) x.click(); else m.classList.remove('show', 'open'); } else AppP.minimizeApp(); }); } catch (e) {}
})();
