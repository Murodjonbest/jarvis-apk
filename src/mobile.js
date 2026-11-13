/* JARVIS — telefon interfeysi: yuqori panel, pastki menyu, ilovalar varag'i, to'liq ekran oynalar */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const DESK = !window.JARVIS_MOBILE;
  document.body.classList.add('mob'); if (DESK) document.body.classList.add('desk');
  window.NO_ORB = !DESK;

  /* ---- yuqori panel ---- */
  const top = document.createElement('header'); top.id = 'mTop';
  top.innerHTML = '<div id="mOrb"></div><div class="mb"><b>JARVIS</b><small id="mState">tayyor</small></div><button id="mLive" title="Gemini bilan jonli suhbat">🎙</button><button id="mStop" title="Hammasini to\'xtatish">⛔</button>';
  try { const NV = window.jarvisNative; if (NV && NV.appVersion) NV.appVersion().then(v => { const b = top.querySelector('.mb b'); if (b && v) b.insertAdjacentHTML('beforeend', ' <small style="opacity:.55;font-size:10px;font-weight:400">v' + v + '</small>'); }).catch(() => {}); } catch (e) {}
  document.body.appendChild(top);
  $('mStop').onclick = () => $('estop') && $('estop').click();
  $('mLive').onclick = () => { const b = $('liveBtn'); if (b) b.click(); else toast('Jonli suhbat uchun Gemini kaliti kerak (⚙ Sozlash)'); };

  /* ---- pastki menyu ---- */
  const NAV = [['center', '💬', 'Suhbat'], ['read', '📖', "O'qish"], ['right', '📋', 'Eslatma'], ['apps', '🧩', 'Ilovalar'], ['left', '📊', 'Holat'], ['mods', '🛠', "O'zgartirish"], ['set', '⚙', 'Sozlash']];
  const nav = document.createElement('nav'); nav.id = 'mNav';
  nav.innerHTML = NAV.map(([v, i, t]) => `<button data-v="${v}"><span class="i">${i}</span>${t}<span class="badge"></span></button>`).join('');
  document.body.appendChild(nav);
  const shade = document.createElement('div'); shade.id = 'mShade'; document.body.appendChild(shade);
  const sheet = document.createElement('div'); sheet.id = 'mSheet'; document.body.appendChild(sheet);
  shade.onclick = () => closeSheet();

  let view = 'center';
  function setOn(v) { nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
  function hideWins() { try { Object.keys(WINS).forEach(id => minWin(id)); } catch (e) { document.querySelectorAll('.win').forEach(w => w.style.display = 'none'); } }
  function show(v) {
    closeSheet(); hideWins(); view = v;
    ['leftCol', 'centerCol', 'rightCol'].forEach(id => { const el = $(id); if (!el) return; el.style.display = 'none'; el.classList.remove('show'); });
    const el = $({ left: 'leftCol', center: 'centerCol', right: 'rightCol' }[v]); if (el) { el.style.display = 'flex'; el.classList.add('show'); }
    setOn(v);
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const v = b.dataset.v;
    if (v === 'apps') { sheet.classList.contains('open') ? closeSheet() : openSheet(); return; }
    if (v === 'set') { closeSheet(); const m = dockBtn(/Modellar/); if (m) m.click(); setOn('set'); return; }
    if (v === 'read') { closeSheet(); try { openReader(null); } catch (er) {} return; }
    if (v === 'mods') { closeSheet(); try { openCustomize(); } catch (er) {} return; }
    show(v);
  });

  /* ---- ilovalar varag'i (kompyuterdagi pastki panel o'rniga) ---- */
  function dockBtn(re) { return [...document.querySelectorAll('#dock > button')].find(b => re.test(b.textContent)); }
  function splitLabel(t) { const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u.exec(t.trim()); return m ? [m[1], m[2]] : ['•', t.trim()]; }
  function openSheet() {
    const apps = [...document.querySelectorAll('#dock > button')].filter(b => !/Modellar/.test(b.textContent) && !b.classList.contains('dmore'));
    const wins = [...document.querySelectorAll('#dockWins button')];
    let h = '<div class="grab"></div>';
    if (wins.length) h += '<h4>OCHIQ OYNALAR</h4><div class="wl">' + wins.map((b, i) => `<button data-w="${i}"><span>${esc(b.textContent)}</span><i data-x="${i}">✕</i></button>`).join('') + '</div>';
    h += '<h4>ILOVALAR VA ASBOBLAR</h4><div class="grid">' + apps.map((b, i) => { const [ic, t] = splitLabel(b.textContent); return `<button class="app" data-a="${i}"><span class="i">${ic}</span>${esc(t)}</button>`; }).join('') + '</div>';
    sheet.innerHTML = h;
    sheet.onclick = e => {
      const x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); const w = winIds()[+x.dataset.x]; try { closeWin(w); } catch (er) {} openSheet(); return; }
      const w = e.target.closest('[data-w]'); if (w) { closeSheet(); wins[+w.dataset.w].click(); setOn('apps'); return; }
      const a = e.target.closest('[data-a]'); if (a) { closeSheet(); apps[+a.dataset.a].click(); setOn('apps'); }
    };
    sheet.classList.add('open'); shade.classList.add('open'); setOn('apps');
  }
  function closeSheet() { sheet.classList.remove('open'); shade.classList.remove('open'); if (!document.querySelector('.win.top:not([style*="display: none"])')) setOn(view); }
  function winIds() { try { return Object.keys(WINS); } catch (e) { return []; } }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---- holat yozuvi, jonli tugma holati ---- */
  function syncState() {
    const s = $('stateTxt'); const m = $('mState'); if (!s || !m) return;
    const t = (s.textContent || 'TAYYOR').trim(); if (m.textContent !== t) m.textContent = t; m.classList.toggle('busy', !/TAYYOR|KUTISH|READY/i.test(t));
    const o = $('mOrb'); if (o) { const md = (typeof S !== 'undefined' && S.mode) || 'idle'; o.className = /think/.test(md) ? 'thinking' : /listen/.test(md) ? 'listening' : /speak/.test(md) ? 'speaking' : ''; }
    const lb = $('liveBtn'); $('mLive').classList.toggle('on', !!(lb && /\b(on|active|rec)\b/.test(lb.className)));
  }
  setTimeout(() => { const s = $('stateTxt'); if (s) new MutationObserver(syncState).observe(s, { subtree: true, childList: true, characterData: true });
    const lb = $('liveBtn'); if (lb) new MutationObserver(syncState).observe(lb, { attributes: true, attributeFilter: ['class'] }); syncState(); }, 1200);

  /* ---- oynalar: orqaga tugmasi, ochilganda menyu holati ---- */
  /* Sozlamalar oynasi: bo'limlar yig'iladigan (akkordeon), eng muhimi tepada */
  function accordion(w) {
    const wb = w.querySelector('.wb'); if (!wb) return;
    const wt = w.querySelector('.wt'); if (wt && /MODELLAR/.test(wt.textContent)) wt.textContent = '⚙ SOZLAMALAR';
    const run = () => {
      const g = wb.querySelector('[data-gbox]'); if (g && wb.firstElementChild !== g) wb.prepend(g);
      wb.querySelectorAll(':scope > .wmsg').forEach(m => {
        if (m.dataset.acc) return; const h = m.querySelector(':scope > .h'); if (!h) return;
        m.dataset.acc = 1; m.classList.add('acc'); if (m.hasAttribute('data-gbox') && !/ulangan/.test(m.textContent)) m.classList.add('open');
        h.addEventListener('click', e => { if (e.target.closest('button,input,select,a')) return; m.classList.toggle('open'); });
      });
    };
    run(); new MutationObserver(() => setTimeout(run, 30)).observe(wb, { childList: true });
  }
  function decorate(w) {
    if (w.dataset.mob) return; w.dataset.mob = 1; setTimeout(() => accordion(w), 60);
    const wh = w.querySelector('.wh'); if (!wh) return;
    const b = document.createElement('button'); b.className = 'mBack'; b.textContent = '‹'; b.title = 'Orqaga';
    b.onclick = e => { e.stopPropagation(); const x = wh.querySelectorAll('button'); x[x.length - 1].click(); };
    wh.insertBefore(b, wh.firstChild); closeSheet();
  }
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('win')) decorate(n); }))).observe(document.body, { childList: true });
  document.querySelectorAll('.win').forEach(decorate);

  /* ---- klaviatura ochilganda joyni kengaytirish ---- */
  let kbT;
  document.addEventListener('focusin', e => { if (!DESK && (/TEXTAREA|INPUT/.test(e.target.tagName) && !/checkbox|range|radio|button/.test(e.target.type))) { clearTimeout(kbT); document.body.classList.add('kb'); setTimeout(() => e.target.scrollIntoView({ block: 'nearest' }), 250); } });
  document.addEventListener('focusout', () => { kbT = setTimeout(() => document.body.classList.remove('kb'), 150); });

  /* ---- suhbat boshlangach markaz kichrayadi; markazni bossa — katta/kichik ---- */
  const log = $('log');
  function compact() { if (log && log.children.length > 2 && !document.body.dataset.big) document.body.classList.add('compact'); }
  if (log) new MutationObserver(compact).observe(log, { childList: true });
  const core = $('core'); if (core) core.addEventListener('click', () => { const c = document.body.classList.toggle('compact'); if (c) delete document.body.dataset.big; else document.body.dataset.big = '1'; });
  compact();

  /* ---- matn maydoni o'zi kattalashadi ---- */
  const inp = $('inp'); const hasT = () => document.body.classList.toggle('hastext', !!(inp && inp.value.trim()) || (typeof ATT !== 'undefined' && ATT.items && ATT.items.length > 0));
  if (inp) { inp.placeholder = 'Xabar yozing…'; inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, innerHeight * 0.3) + 'px'; hasT(); }); setInterval(hasT, 500); }

  /* ---- telefonning "orqaga" tugmasi ---- */
  window.mobBack = function () {
    const nf = $('notiqFrame'); if (nf) { nf.remove(); return true; }
    const md = $('modal'); if (md && getComputedStyle(md).display !== 'none') { const n = $('mNo'); if (n) n.click(); return true; }
    if (sheet.classList.contains('open')) { closeSheet(); return true; }
    const w = [...document.querySelectorAll('.win')].filter(x => x.style.display !== 'none').sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0];
    if (w) { const x = w.querySelectorAll('.wh button'); x[x.length - 1].click(); setOn(view); return true; }
    if (view !== 'center') { show('center'); return true; }
    return false;
  };

  function toast(t) { const el = $('toast'), tt = $('toastT'); if (el && tt) { tt.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500); } }


  /* ---- 🌙 Ekran o'chiq holatda ham "Jarvis" (Android xizmati, internetsiz) ---- */
  const CE = window.capacitorExports || {};
  const WakeP = CE.registerPlugin && CE.Capacitor && CE.Capacitor.isNativePlatform && CE.Capacitor.isNativePlatform() ? CE.registerPlugin('Wake') : null;
  const moon = document.createElement('button'); moon.id = 'mMoon'; moon.title = "Ekran o'chiq holatda ham 'Jarvis'"; moon.textContent = '🌙';
  top.insertBefore(moon, $('mLive'));
  const card = document.createElement('div'); card.className = 'panel'; card.id = 'wakeCard';
  const lc = $('leftCol'); if (lc && !DESK) lc.insertBefore(card, lc.firstChild);
  async function wst() { try { return WakeP ? await WakeP.status() : null; } catch (e) { return null; } }
  async function drawWake() {
    const st = await wst();
    moon.classList.toggle('on', !!(st && st.running));
    if (!st) { card.innerHTML = '<div class="ttl">🌙 EKRAN O\'CHIQ HOLATDA HAM "JARVIS"</div><div class="kbm">Bu imkoniyat faqat Android ilovasida ishlaydi.</div>'; return; }
    const row = (ok, t, act) => `<div class="stat"><span>${ok ? '🟢' : '🔴'} ${t}</span>${ok ? '<b>bor</b>' : `<button class="chip" data-w="${act}">Ruxsat berish</button>`}</div>`;
    card.innerHTML = `<div class="ttl">🌙 EKRAN O'CHIQ HOLATDA HAM "JARVIS"</div>
      <div class="kbm" style="margin:6px 0">Yoqilsa, telefon cho'ntakda, ekran o'chiq yoki boshqa ilova ochiq bo'lsa ham "Jarvis" deganingizni eshitadi (internetsiz, telefon ichida) va o'zi ochilib buyruqni tinglaydi. Batareyani biroz ko'proq sarflaydi.</div>
      ${row(st.mic, 'Mikrofon', 'app')}${row(st.notif, 'Bildirishnoma', 'app')}${row(st.overlay, 'Boshqa ilovalar ustida ochilish', 'overlay')}${row(st.battery, 'Batareya cheklovisiz', 'battery')}${row(st.fullscreen, 'Qulflangan ekranda ochilish', 'fs')}<div class="stat"><span>⚙ Fonda ishlash (Xiaomi, Samsung…)</span><button class="chip" data-w="auto">Sozlash</button></div>
      <div class="row2" style="margin-top:8px"><button class="chip ${st.running ? 'red' : 'w'}" data-w="toggle">${st.running ? '⏹ O\'chirish' : '▶ Yoqish'}</button></div>
      ${st.error ? `<div class="kbm" style="color:var(--red)">${esc(st.error)}</div>` : st.running ? (st.ready ? '<div class="kbm" style="color:var(--cy2)">✓ Tinglayapti. "Jarvis" deb aniq ayting (ingliz talaffuzida: "JAR-vis").</div>' : '<div class="kbm" style="color:var(--amber)">⏳ Ovoz modeli tayyorlanmoqda (birinchi marta 10–30 soniya)…</div>') + (st.heard ? `<div class="kbm">Oxirgi eshitgani: <b>${esc(st.heard)}</b></div>` : '') : ''}`;
  }
  card.addEventListener('click', async e => {
    const b = e.target.closest('[data-w]'); if (!b || !WakeP) return; const a = b.dataset.w;
    try {
      if (a === 'toggle') { const st = await wst(); if (st && st.running) { await WakeP.stop(); try { localStorage.setItem('jn_wake_auto', '0'); } catch (e) {} } else { try { localStorage.setItem('jn_wake_auto', '1'); } catch (e) {} await WakeP.start(); toast("🌙 Endi ekran o'chiq bo'lsa ham \"Jarvis\" deng"); } }
      if (a === 'overlay') await WakeP.askOverlay(); if (a === 'battery') await WakeP.askBattery(); if (a === 'app') await WakeP.appSettings(); if (a === 'fs') await WakeP.askFullScreen(); if (a === 'auto') await WakeP.askAutostart();
    } catch (er) { toast(er.message || String(er)); }
    setTimeout(drawWake, 800);
  });
  if (DESK) moon.style.display = 'none';
  moon.onclick = () => { show('left'); const lc2 = $('leftCol'); if (lc2) lc2.scrollTop = 0; drawWake(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(drawWake, 500); });
  drawWake();
  // xizmat "Jarvis"ni eshitib ilovani ochganda — buyruqni tinglashni boshlaymiz
  window.onNativeWake = async function () {
    show('center');
    try { if (typeof W !== 'undefined' && W.on && W.running && typeof handleWakeFinal === 'function') { handleWakeFinal('Jarvis'); return; } } catch (e) {}
    try { if (window.wakeGreet) await window.wakeGreet(); } catch (e) {}
    const mic = $('mic'); if (mic && !mic.classList.contains('rec')) mic.click();
  };
  // xizmat "Jarvis"ni eshitganda (ilova ochiq bo'lsa ham) — shu yerda javob beramiz
  try { WakeP && WakeP.addListener('wake', () => window.onNativeWake && window.onNativeWake()); } catch (e) {}
  // xizmat ishlayotganda WebView o'zi alohida tinglamaydi (mikrofon va internet limiti tejaladi)
  setInterval(async () => { const st = await wst(); if (st && st.running && typeof W !== 'undefined' && W.on && !W.await && typeof wakeOff === 'function') { wakeOff(); } }, 5000);
  // doim tayyor: fon xizmati o'zi yoqiladi (o'chirib qo'ymagan bo'lsangiz)
  setTimeout(async () => { if (!WakeP) return; let off = false; try { off = localStorage.getItem('jn_wake_auto') === '0'; } catch (e) {}
    const st = await wst(); if (st && !st.running && !off) {
      let first = false; try { first = !localStorage.getItem('jn_wake_asked'); localStorage.setItem('jn_wake_asked', '1'); } catch (e) {}
      if (st.mic || first) { try { await WakeP.start(); if (first) toast('🌙 "Jarvis" deb chaqirsangiz, ekran o\'chiq bo\'lsa ham eshitaman. To\'liq ishlashi uchun Holat → 🌙 bo\'limida ruxsatlarni bering'); } catch (e) { if (first) toast(e.message || String(e)); } }
      drawWake(); } }, 3000);
  setInterval(() => { if (view === 'left') drawWake(); }, 3000);

  /* ---- avtomatik yangilanish: GitHub'dagi yangi APK ---- */
  const AppI = CE.registerPlugin && CE.Capacitor && CE.Capacitor.isNativePlatform && CE.Capacitor.isNativePlatform() ? CE.registerPlugin('App') : null;
  const vNum = v => String(v || '0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const newer = (a, b) => { const x = vNum(a), y = vNum(b); for (let i = 0; i < 4; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function checkUpdate(loud) {
    if (!AppI || !window.jarvisNative) return;
    try { const cur = (await AppI.getInfo()).version; const r = await window.jarvisNative.http({ url: 'https://api.github.com/repos/Murodjonbest/jarvis-apk/releases/latest', headers: { Accept: 'application/vnd.github+json' } });
      const j = r.json || {}; const latest = String(j.tag_name || '').replace(/^v/, ''); const a = (j.assets || []).find(x => x.name === 'Jarvis.apk');
      if (a && newer(latest, cur)) { if (localStorage.getItem('jn_upd_seen') === latest && !loud) return; localStorage.setItem('jn_upd_seen', latest);
        const d = addMsg('j', `📲 **Yangi versiya: v${latest}** (sizda v${cur}). Bosing — yuklab olinadi, keyin "O'rnatish"ni bosasiz. Ma'lumotlaringiz saqlanib qoladi.`);
        const b = document.createElement('button'); b.className = 'chip w'; b.style.marginTop = '8px'; b.textContent = '⬇ Yangilash'; b.onclick = () => window.jarvisNative.open(a.browser_download_url); d.appendChild(b); }
      else if (loud) toast('Sizda eng so\'nggi versiya: v' + cur);
    } catch (e) {} }
  window.checkUpdate = checkUpdate; setTimeout(() => checkUpdate(false), 20000); setInterval(() => checkUpdate(false), 6 * 3600 * 1000);
  if (DESK) {
    const cw = document.querySelector('.coreWrap'); if (cw) { cw.classList.add('deskOrb'); nav.prepend(cw); }
    const wh = $('wakeHint'); if (wh) document.body.appendChild(wh);
    if (cw) cw.addEventListener('click', () => show('center'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && window.mobBack) window.mobBack(); });
    const paneSync = () => { const vis = [...document.querySelectorAll('.win')].some(w => w.style.display !== 'none'); document.body.classList.toggle('winopen', vis); };
    new MutationObserver(paneSync).observe(document.body, { childList: true, subtree: false, attributes: false }); setInterval(paneSync, 400);
  }
  show('center'); syncState();
  addEventListener('resize', () => { if (view && !$({ left: 'leftCol', center: 'centerCol', right: 'rightCol' }[view])?.classList.contains('show')) show(view); });
})();
