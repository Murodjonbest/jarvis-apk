/* JARVIS — telefon interfeysi: yuqori panel, pastki menyu, ilovalar varag'i, to'liq ekran oynalar */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  document.body.classList.add('mob');

  /* ---- yuqori panel ---- */
  const top = document.createElement('header'); top.id = 'mTop';
  top.innerHTML = '<div class="mb"><b>J.A.R.V.I.S.</b><small id="mState">TAYYOR</small></div><button id="mLive" title="Gemini bilan jonli suhbat">🎙 Jonli</button><button id="mStop" title="Hammasini to\'xtatish">⛔</button>';
  document.body.appendChild(top);
  $('mStop').onclick = () => $('estop') && $('estop').click();
  $('mLive').onclick = () => { const b = $('liveBtn'); if (b) b.click(); else toast('Jonli suhbat uchun Gemini kaliti kerak (⚙ Sozlash)'); };

  /* ---- pastki menyu ---- */
  const NAV = [['center', '💬', 'Jarvis'], ['left', '🛰', 'Tizim'], ['right', '📋', 'Eslatma'], ['apps', '🧰', 'Ilovalar'], ['set', '⚙', 'Sozlash']];
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
    show(v);
  });

  /* ---- ilovalar varag'i (kompyuterdagi pastki panel o'rniga) ---- */
  function dockBtn(re) { return [...document.querySelectorAll('#dock > button')].find(b => re.test(b.textContent)); }
  function splitLabel(t) { const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u.exec(t.trim()); return m ? [m[1], m[2]] : ['•', t.trim()]; }
  function openSheet() {
    const apps = [...document.querySelectorAll('#dock > button')].filter(b => !/Modellar/.test(b.textContent));
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
    const lb = $('liveBtn'); $('mLive').classList.toggle('on', !!(lb && /\b(on|active|rec)\b/.test(lb.className)));
  }
  setTimeout(() => { const s = $('stateTxt'); if (s) new MutationObserver(syncState).observe(s, { subtree: true, childList: true, characterData: true });
    const lb = $('liveBtn'); if (lb) new MutationObserver(syncState).observe(lb, { attributes: true, attributeFilter: ['class'] }); syncState(); }, 1200);

  /* ---- oynalar: orqaga tugmasi, ochilganda menyu holati ---- */
  function decorate(w) {
    if (w.dataset.mob) return; w.dataset.mob = 1;
    const wh = w.querySelector('.wh'); if (!wh) return;
    const b = document.createElement('button'); b.className = 'mBack'; b.textContent = '‹'; b.title = 'Orqaga';
    b.onclick = e => { e.stopPropagation(); const x = wh.querySelectorAll('button'); x[x.length - 1].click(); };
    wh.insertBefore(b, wh.firstChild); closeSheet();
  }
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('win')) decorate(n); }))).observe(document.body, { childList: true });
  document.querySelectorAll('.win').forEach(decorate);

  /* ---- klaviatura ochilganda joyni kengaytirish ---- */
  let kbT;
  document.addEventListener('focusin', e => { if (/TEXTAREA|INPUT/.test(e.target.tagName) && !/checkbox|range|radio|button/.test(e.target.type)) { clearTimeout(kbT); document.body.classList.add('kb'); setTimeout(() => e.target.scrollIntoView({ block: 'nearest' }), 250); } });
  document.addEventListener('focusout', () => { kbT = setTimeout(() => document.body.classList.remove('kb'), 150); });

  /* ---- suhbat boshlangach markaz kichrayadi; markazni bossa — katta/kichik ---- */
  const log = $('log');
  function compact() { if (log && log.children.length > 2 && !document.body.dataset.big) document.body.classList.add('compact'); }
  if (log) new MutationObserver(compact).observe(log, { childList: true });
  const core = $('core'); if (core) core.addEventListener('click', () => { const c = document.body.classList.toggle('compact'); if (c) delete document.body.dataset.big; else document.body.dataset.big = '1'; });
  compact();

  /* ---- matn maydoni o'zi kattalashadi ---- */
  const inp = $('inp'); if (inp) inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, innerHeight * 0.3) + 'px'; });

  /* ---- telefonning "orqaga" tugmasi ---- */
  window.mobBack = function () {
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
  const lc = $('leftCol'); if (lc) lc.insertBefore(card, lc.firstChild);
  async function wst() { try { return WakeP ? await WakeP.status() : null; } catch (e) { return null; } }
  async function drawWake() {
    const st = await wst();
    moon.classList.toggle('on', !!(st && st.running));
    if (!st) { card.innerHTML = '<div class="ttl">🌙 EKRAN O\'CHIQ HOLATDA HAM "JARVIS"</div><div class="kbm">Bu imkoniyat faqat Android ilovasida ishlaydi.</div>'; return; }
    const row = (ok, t, act) => `<div class="stat"><span>${ok ? '🟢' : '🔴'} ${t}</span>${ok ? '<b>bor</b>' : `<button class="chip" data-w="${act}">Ruxsat berish</button>`}</div>`;
    card.innerHTML = `<div class="ttl">🌙 EKRAN O'CHIQ HOLATDA HAM "JARVIS"</div>
      <div class="kbm" style="margin:6px 0">Yoqilsa, telefon cho'ntakda, ekran o'chiq yoki boshqa ilova ochiq bo'lsa ham "Jarvis" deganingizni eshitadi (internetsiz, telefon ichida) va o'zi ochilib buyruqni tinglaydi. Batareyani biroz ko'proq sarflaydi.</div>
      ${row(st.mic, 'Mikrofon', 'app')}${row(st.notif, 'Bildirishnoma', 'app')}${row(st.overlay, 'Boshqa ilovalar ustida ochilish', 'overlay')}${row(st.battery, 'Batareya cheklovisiz', 'battery')}
      <div class="row2" style="margin-top:8px"><button class="chip ${st.running ? 'red' : 'w'}" data-w="toggle">${st.running ? '⏹ O\'chirish' : '▶ Yoqish'}</button></div>
      ${st.error ? `<div class="kbm" style="color:var(--red)">${esc(st.error)}</div>` : st.running ? '<div class="kbm" style="color:var(--cy2)">✓ Tinglayapti. Ekranni o\'chirib "Jarvis" deb ko\'ring.</div>' : ''}`;
  }
  card.addEventListener('click', async e => {
    const b = e.target.closest('[data-w]'); if (!b || !WakeP) return; const a = b.dataset.w;
    try {
      if (a === 'toggle') { const st = await wst(); if (st && st.running) await WakeP.stop(); else { await WakeP.start(); toast("🌙 Endi ekran o'chiq bo'lsa ham \"Jarvis\" deng"); } }
      if (a === 'overlay') await WakeP.askOverlay(); if (a === 'battery') await WakeP.askBattery(); if (a === 'app') await WakeP.appSettings();
    } catch (er) { toast(er.message || String(er)); }
    setTimeout(drawWake, 800);
  });
  moon.onclick = () => { show('left'); const lc2 = $('leftCol'); if (lc2) lc2.scrollTop = 0; drawWake(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(drawWake, 500); });
  drawWake();
  // xizmat "Jarvis"ni eshitib ilovani ochganda — buyruqni tinglashni boshlaymiz
  window.onNativeWake = function () {
    show('center');
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    const mic = $('mic'); if (mic && !mic.classList.contains('rec')) mic.click();
  };

  show('center'); syncState();
  addEventListener('resize', () => { if (view && !$({ left: 'leftCol', center: 'centerCol', right: 'rightCol' }[view])?.classList.contains('show')) show(view); });
})();
