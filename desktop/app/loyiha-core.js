/* LOYIHA YADROSI — uy rejasini hisoblash, 2D chizma, 3D geometriya, smeta, DXF va Blender skripti.
   Bitta "spec" (JSON) dan hammasi chiqadi: o'lchamlar metrda, x — sharq (o'ngga), y — shimol (orqaga), z — yuqoriga. Old tomon — y=0 (janub). */
(function (G) {
  'use strict';
  const r2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EPS = 0.05;

  /* ---------- spec tozalash ---------- */
  const DEF = { name: 'Yangi uy', W: 12, L: 10, h: 3, levels: [{ rooms: [] }], wallT: 0.38, inT: 0.12, roof: 'gable', pitch: 28, overhang: 0.5,
    colors: { wall: '#efe4d2', roof: '#8a3324', trim: '#ffffff', base: '#8c8378', ground: '#6f9a4c', door: '#6b4423' }, porch: null, style: 'zamonaviy', trees: true };
  const TYPE_RE = [['hall', /dahliz|koridor|yo'lak|yolak|xoll|hall|kirish/i], ['living', /mehmon|zal|yashash|living/i], ['bed', /yotoq|bolalar|spal|bed/i], ['kitchen', /oshxona|kuxn|kitchen/i], ['bath', /hammom|vanna|sanuzel|hojat|wc|dush|bath/i], ['store', /ombor|kladov|garderob|qozonxona|texnik/i], ['garage', /garaj|garage/i]];
  const typeOf = n => (TYPE_RE.find(([, re]) => re.test(n || '')) || ['room'])[0];
  function normalize(s) {
    s = Object.assign({}, DEF, s || {}); s.colors = Object.assign({}, DEF.colors, (s && s.colors) || {});
    s.W = clamp(+s.W || 12, 4, 60); s.L = clamp(+s.L || 10, 4, 60); s.h = clamp(+s.h || 3, 2.4, 5);
    s.wallT = clamp(+s.wallT || 0.38, 0.2, 0.64); s.inT = clamp(+s.inT || 0.12, 0.08, 0.38); s.pitch = clamp(+s.pitch || 28, 10, 50); s.overhang = clamp(s.overhang == null ? 0.5 : +s.overhang, 0, 1.5);
    if (!['gable', 'hip', 'flat'].includes(s.roof)) s.roof = 'gable';
    s.neo = /neo|klassik|classic|saroy/i.test(s.style || '');
    if (s.neo && !(s.colors && s.colors._user)) { const u = (arguments[0] && arguments[0].colors) || {}; s.colors = Object.assign({}, DEF.colors, { wall: '#f3efe7', roof: '#2f343b', trim: '#ffffff', base: '#3d3d3f', door: '#26282c' }, u.wall && u.wall !== DEF.colors.wall ? { wall: u.wall } : {}, u.roof && u.roof !== DEF.colors.roof ? { roof: u.roof } : {}); }
    if (!Array.isArray(s.levels) || !s.levels.length) s.levels = [{ rooms: s.rooms || [] }];
    s.levels = s.levels.slice(0, 3).map((lv, i) => ({ rooms: fixRooms((lv && lv.rooms) || [], s.W, s.L, i) }));
    if (s.porch && typeof s.porch === 'object') { s.porch = { side: /^[NSEW]$/.test(s.porch.side) ? s.porch.side : 'S', depth: clamp(+s.porch.depth || 2.5, 1.2, 5), len: clamp(+s.porch.len || (s.porch.side === 'E' || s.porch.side === 'W' ? s.L : s.W), 2, 60) }; } else s.porch = null;
    delete s.rooms; return s;
  }
  // xonalar to'g'ri joylashganmi (to'liq qoplash, ustma-ust tushmaslik) — bo'lmasa avtomatik joylash
  function fixRooms(rooms, W, L, lvl) {
    let rs = rooms.filter(r => r && (r.name || r.area || r.w)).map(r => ({ name: String(r.name || 'Xona').slice(0, 40), x: +r.x, y: +r.y, w: +r.w, h: +r.h, area: +r.area || 0 }));
    if (!rs.length) rs = lvl ? [{ name: 'Yotoqxona', area: 0 }, { name: 'Yotoqxona', area: 0 }, { name: 'Yo\'lak', area: 0 }, { name: 'Hammom', area: 0 }] : [{ name: 'Mehmonxona', area: 0 }, { name: 'Oshxona', area: 0 }, { name: 'Yotoqxona', area: 0 }, { name: 'Yotoqxona', area: 0 }, { name: 'Dahliz', area: 0 }, { name: 'Hammom', area: 0 }];
    const okGeom = rs.every(r => isFinite(r.x) && isFinite(r.y) && r.w >= 1 && r.h >= 1 && r.x >= -EPS && r.y >= -EPS && r.x + r.w <= W + EPS && r.y + r.h <= L + EPS);
    if (okGeom) {
      let overlap = false, area = 0;
      for (let i = 0; i < rs.length; i++) { area += rs[i].w * rs[i].h; for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ox > EPS && oy > EPS) overlap = true; } }
      if (!overlap && Math.abs(area - W * L) < W * L * 0.03) return snap(rs.map(r => ({ name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, type: typeOf(r.name) })), W, L);
    }
    return autoLayout(rs, W, L);
  }
  function snap(rs, W, L) { const s = v => Math.round(v * 20) / 20; return rs.map(r => { const x1 = s(r.x), y1 = s(r.y), x2 = Math.abs(r.x + r.w - W) < 0.08 ? W : s(r.x + r.w), y2 = Math.abs(r.y + r.h - L) < 0.08 ? L : s(r.y + r.h); return { ...r, x: x1, y: y1, w: r2(x2 - x1), h: r2(y2 - y1) }; }); }
  // "squarified" bo'lish: xonalar maydoni bo'yicha to'rtburchakni bo'laklash
  const DEF_AREA = { living: 22, bed: 14, kitchen: 12, bath: 5, hall: 8, store: 4, garage: 20, room: 12 };
  function autoLayout(rs, W, L) {
    const items = rs.map(r => ({ name: r.name, type: typeOf(r.name), a: r.area > 1 ? r.area : DEF_AREA[typeOf(r.name)] }));
    const tot = items.reduce((s, i) => s + i.a, 0); items.forEach(i => i.a = i.a * W * L / tot);
    // dahliz o'rtaga, katta xonalar oldinga
items.sort((a, b) => b.a - a.a); { const hi = items.findIndex(i => i.type === 'hall'); if (hi > 1) { const [h] = items.splice(hi, 1); items.splice(1, 0, h); } }
    const out = [];
    (function split(list, x, y, w, h) {
      if (list.length === 1) { out.push({ name: list[0].name, type: list[0].type, x, y, w, h }); return; }
      const sum = list.reduce((s, i) => s + i.a, 0); let acc = 0, k = 0;
      for (; k < list.length - 1; k++) { if (acc + list[k].a > sum / 2 && k > 0) break; acc += list[k].a; }
      if (k === 0) { acc = list[0].a; k = 1; }
      const A = list.slice(0, k), B = list.slice(k), f = acc / sum;
      if (w >= h) { const wa = w * f; split(A, x, y, wa, h); split(B, x + wa, y, w - wa, h); }
      else { const ha = h * f; split(A, x, y, w, ha); split(B, x, y + ha, w, h - ha); }
    })(items, 0, 0, W, L);
    // dahliz old tomonda (janub) bo'lsin — kirish eshigi va portik uchun
    const hall = out.find(r => r.type === 'hall');
    if (hall && hall.y > 0.05 && Math.abs(hall.y + hall.h - L) < 0.05) out.forEach(r => { r.y = L - r.y - r.h; });
    return snap(out, W, L);
  }

  /* ---------- devorlar, eshiklar, derazalar ---------- */
  function plan(s, li) {
    const rooms = s.levels[li].rooms, W = s.W, L = s.L;
    const segs = []; // {x1,y1,x2,y2,t,ext,ops:[{a,w,kind}]} (a — boshidan masofa)
    const edges = r => [{ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, side: 'S' }, { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h, side: 'N' }, { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h, side: 'W' }, { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, side: 'E' }];
    const onExt = e => (e.y1 === e.y2 && (Math.abs(e.y1) < EPS || Math.abs(e.y1 - L) < EPS)) || (e.x1 === e.x2 && (Math.abs(e.x1) < EPS || Math.abs(e.x1 - W) < EPS));
    // tashqi devorlar — har xona chegarasi bo'yicha
    const extOf = rooms.map(() => []);
    rooms.forEach((r, i) => edges(r).forEach(e => { if (onExt(e)) { const g = { ...e, t: s.wallT, ext: true, room: i, ops: [] }; segs.push(g); extOf[i].push(g); } }));
    // ichki devorlar — qo'shni xonalar umumiy chegarasi
    const adj = [];
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j]; let g = null;
      if (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) { const x = Math.abs(a.x + a.w - b.x) < EPS ? b.x : a.x; const y1 = Math.max(a.y, b.y), y2 = Math.min(a.y + a.h, b.y + b.h); if (y2 - y1 > 0.3) g = { x1: x, y1, x2: x, y2 }; }
      else if (Math.abs(a.y + a.h - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS) { const y = Math.abs(a.y + a.h - b.y) < EPS ? b.y : a.y; const x1 = Math.max(a.x, b.x), x2 = Math.min(a.x + a.w, b.x + b.w); if (x2 - x1 > 0.3) g = { x1, y1: y, x2, y2: y }; }
      if (g) { g.t = s.inT; g.ext = false; g.ops = []; g.a = i; g.b = j; segs.push(g); adj.push(g); }
    }
    const len = g => Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
    // eshiklar: markaziy xonadan daraxt bo'yicha
    const hub = Math.max(0, rooms.findIndex(r => r.type === 'hall')) >= 0 && rooms.some(r => r.type === 'hall') ? rooms.findIndex(r => r.type === 'hall') : rooms.reduce((m, r, i) => r.w * r.h > rooms[m].w * rooms[m].h ? i : m, 0);
    const seen = new Set([hub]); const q = [hub];
    const doorW = 0.9;
    while (q.length) { const c = q.shift(); adj.filter(g => (g.a === c || g.b === c) && len(g) >= 1.1).sort((a, b) => len(b) - len(a)).forEach(g => { const o = g.a === c ? g.b : g.a; if (seen.has(o)) return; seen.add(o); q.push(o); const l = len(g); g.ops.push({ a: clamp(l / 2 - doorW / 2, 0.15, l - doorW - 0.15), w: doorW, kind: 'door' }); }); }
    // bog'lanmay qolgan xonalar — eng uzun umumiy devor orqali
    rooms.forEach((r, i) => { if (seen.has(i)) return; const g = adj.filter(g => (g.a === i || g.b === i) && len(g) >= 1).sort((a, b) => len(b) - len(a))[0]; if (g) { seen.add(i); const l = len(g); g.ops.push({ a: clamp(l / 2 - doorW / 2, 0.1, l - doorW - 0.1), w: doorW, kind: 'door' }); } });
    // kirish eshigi: markaziy xonaning old (janub) tashqi devorida, bo'lmasa istalgan tashqi devorida
    let ent = extOf[hub].filter(g => g.side === 'S').sort((a, b) => len(b) - len(a))[0] || extOf[hub].sort((a, b) => len(b) - len(a))[0];
    if (!ent) { const any = segs.filter(g => g.ext && g.side === 'S').sort((a, b) => len(b) - len(a))[0]; ent = any; }
    if (ent) { const l = len(ent); ent.ops.push({ a: clamp(l / 2 - 0.55, 0.2, l - 1.3), w: 1.1, kind: 'entry' }); }
    // derazalar
    segs.filter(g => g.ext).forEach(g => {
      const r = rooms[g.room]; const l = len(g); if (l < 1.4 || r.type === 'store' || r.type === 'garage' && g.side !== 'S') return;
      const ww = r.type === 'bath' ? 0.6 : r.type === 'hall' ? 1.0 : 1.5; const n = r.type === 'bath' ? 1 : Math.max(1, Math.floor(l / 3.4));
      const busy = g.ops.map(o => [o.a - 0.4, o.a + o.w + 0.4]);
      for (let k = 0; k < n; k++) { const c = l * (k + 1) / (n + 1); const a = c - ww / 2; if (a < 0.4 || a + ww > l - 0.4) continue; if (busy.some(([p, q2]) => a < q2 && a + ww > p)) continue; g.ops.push({ a, w: ww, kind: 'window', small: r.type === 'bath' }); }
    });
    segs.forEach(g => g.ops.sort((a, b) => a.a - b.a));
    // bir chiziqdagi tashqi devor bo'laklarini bitta uzluksiz devorga birlashtirish (render'da choklar ko'rinmasin)
    const merged = []; const extS = segs.filter(g => g.ext); const used = new Set();
    for (const g of extS) { if (used.has(g)) continue; const horiz = g.y1 === g.y2; const line = extS.filter(h => !used.has(h) && (horiz ? h.y1 === h.y2 && Math.abs(h.y1 - g.y1) < EPS : h.x1 === h.x2 && Math.abs(h.x1 - g.x1) < EPS));
      line.sort((a, b) => horiz ? a.x1 - b.x1 : a.y1 - b.y1); line.forEach(h => used.add(h));
      const st = horiz ? line[0].x1 : line[0].y1, en = horiz ? Math.max(...line.map(h => h.x2)) : Math.max(...line.map(h => h.y2));
      const m = horiz ? { x1: st, y1: g.y1, x2: en, y2: g.y1 } : { x1: g.x1, y1: st, x2: g.x1, y2: en }; m.t = g.t; m.ext = true; m.side = g.side; m.ops = [];
      line.forEach(h => { const off = (horiz ? h.x1 : h.y1) - st; h.ops.forEach(o => m.ops.push({ ...o, a: o.a + off })); }); m.ops.sort((a, b) => a.a - b.a); merged.push(m); }
    return { rooms, segs: [...merged, ...segs.filter(g => !g.ext)] };
  }

  /* ---------- neoklassik bezaklar: pilyastrlar, deraza ramkalari, karniz, portik ---------- */
  function neoDetails(s, box, meshes, plinth) {
    const W = s.W, L = s.L, H = s.h, t = s.wallT / 2, nL = s.levels.length, Htot = nL * H + (nL - 1) * 0.25;
    // burchak pilyastrlari
    const pw = 0.5, pd = 0.12;
    [[0, 0], [W, 0], [0, L], [W, L]].forEach(([x, y]) => { const sx = x ? 1 : -1, sy = y ? 1 : -1;
      box(Math.min(x - sx * pw * 0 + (sx < 0 ? -t - pd : t), x + (sx < 0 ? -t + 0 : t + pd)), Math.min(y, y - sy * pw), plinth, Math.max(x + (sx < 0 ? -t - pd : t), x + (sx < 0 ? -t : t + pd)), Math.max(y, y - sy * pw), plinth + Htot, 'trim');
      box(Math.min(x, x - sx * pw), Math.min(y + (sy < 0 ? -t - pd : t), y + (sy < 0 ? -t : t + pd)), plinth, Math.max(x, x - sx * pw), Math.max(y + (sy < 0 ? -t - pd : t), y + (sy < 0 ? -t : t + pd)), plinth + Htot, 'trim'); });
    // qavatlararo belbog' va yuqori karniz
    const ring = (z1, z2, out) => { box(-t - out, -t - out, z1, W + t + out, -t, z2, 'trim'); box(-t - out, L + t, z1, W + t + out, L + t + out, z2, 'trim'); box(-t - out, -t, z1, -t, L + t, z2, 'trim'); box(W + t, -t, z1, W + t + out, L + t, z2, 'trim'); };
    for (let i = 1; i < nL; i++) { const z = plinth + i * H + (i - 1) * 0.25; ring(z - 0.05, z + 0.25, 0.08); }
    ring(plinth + Htot - 0.35, plinth + Htot - 0.1, 0.12); ring(plinth + Htot - 0.1, plinth + Htot + 0.15, 0.28);
    // deraza ramkalari (sandrik bilan)
    let z0 = plinth;
    s.levels.forEach((lv, li) => { plan(s, li).segs.filter(g => g.ext).forEach(g => { const horiz = g.y1 === g.y2; const out = horiz ? (g.y1 < 0.1 ? -1 : 1) : (g.x1 < 0.1 ? -1 : 1);
      g.ops.filter(o => o.kind === 'window' && !o.small).forEach(o => { const sill = z0 + 0.85, top = z0 + 2.3, fw = 0.14, fd = 0.07;
        const F = (a, b, za, zb, d) => { if (horiz) { const y = g.y1 + out * t; box(g.x1 + a, Math.min(y, y + out * d), za, g.x1 + b, Math.max(y, y + out * d), zb, 'trim'); } else { const x = g.x1 + out * t; box(Math.min(x, x + out * d), g.y1 + a, za, Math.max(x, x + out * d), g.y1 + b, zb, 'trim'); } };
        F(o.a - fw, o.a, sill - 0.08, top + 0.1, fd); F(o.a + o.w, o.a + o.w + fw, sill - 0.08, top + 0.1, fd); F(o.a - fw, o.a + o.w + fw, top + 0.1, top + 0.22, fd); F(o.a - fw - 0.1, o.a + o.w + fw + 0.1, top + 0.22, top + 0.34, fd + 0.08); F(o.a - fw - 0.05, o.a + o.w + fw + 0.05, sill - 0.14, sill - 0.04, fd + 0.06); }); }); z0 += H + 0.25; });
    // kirish portigi: ustunlar + frontoni
    const P = plan(s, 0); const g = P.segs.find(x => x.ext && x.ops.some(o => o.kind === 'entry')); if (!g || g.y1 !== g.y2 || g.y1 > 0.1) return;
    const e = g.ops.find(o => o.kind === 'entry'), cx = g.x1 + e.a + e.w / 2, half = 1.9, dep = 2.2, ch = Math.min(H, 3.2), y0 = -t;
    box(cx - half - 0.4, y0 - dep - 0.6, 0, cx + half + 0.4, y0, plinth, 'base');
    for (let k = 0; k < 3; k++) box(cx - half - 0.4 + 0.0, y0 - dep - 0.6 - (k + 1) * 0.3, 0, cx + half + 0.4, y0 - dep - 0.6 - k * 0.3, plinth * (2 - k) / 3, 'base');
    [-half, half].forEach(dx => [[y0 - dep + 0.25], [y0 - 0.35]].forEach(([yy]) => { box(cx + dx - 0.22, yy - 0.22, plinth, cx + dx + 0.22, yy + 0.22, plinth + 0.25, 'trim'); box(cx + dx - 0.16, yy - 0.16, plinth + 0.25, cx + dx + 0.16, yy + 0.16, plinth + ch - 0.3, 'column'); box(cx + dx - 0.24, yy - 0.24, plinth + ch - 0.3, cx + dx + 0.24, yy + 0.24, plinth + ch, 'trim'); }));
    const ze = plinth + ch; box(cx - half - 0.45, y0 - dep - 0.05, ze, cx + half + 0.45, y0, ze + 0.45, 'trim');
    const ph = 1.1, pz = ze + 0.45; meshes.push({ m: 'trim', v: [[cx - half - 0.5, y0 - dep - 0.08, pz], [cx + half + 0.5, y0 - dep - 0.08, pz], [cx, y0 - dep - 0.08, pz + ph], [cx - half - 0.5, y0, pz], [cx + half + 0.5, y0, pz], [cx, y0, pz + ph]], f: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [0, 2, 5, 3], [1, 4, 5, 2]] });
    meshes.push({ m: 'roof', v: [[cx - half - 0.65, y0 - dep - 0.2, pz], [cx + half + 0.65, y0 - dep - 0.2, pz], [cx, y0 - dep - 0.2, pz + ph + 0.1], [cx - half - 0.65, y0 + 0.3, pz], [cx + half + 0.65, y0 + 0.3, pz], [cx, y0 + 0.3, pz + ph + 0.1]], f: [[0, 2, 5, 3], [2, 1, 4, 5]] });
  }

  /* ---------- 3D geometriya (Three.js va Blender uchun umumiy) ---------- */
  function geometry(s) {
    const boxes = [], meshes = [], trees = [];
    const box = (x1, y1, z1, x2, y2, z2, m) => { if (x2 - x1 > 0.005 && y2 - y1 > 0.005 && z2 - z1 > 0.005) boxes.push({ p: [r2((x1 + x2) / 2), r2((y1 + y2) / 2), r2((z1 + z2) / 2)], s: [r2(x2 - x1), r2(y2 - y1), r2(z2 - z1)], m }); };
    const slabT = 0.25, plinth = 0.45;
    const W = s.W, L = s.L, H = s.h;
    box(-0.15, -0.15, 0, W + 0.15, L + 0.15, plinth, 'base');
    let z0 = plinth;
    s.levels.forEach((lv, li) => {
      const P = plan(s, li);
      box(0, 0, z0, W, L, z0 + 0.05, 'floor');
      P.segs.forEach(g => {
        const horiz = g.y1 === g.y2, t = g.t, l = Math.hypot(g.x2 - g.x1, g.y2 - g.y1), ext = g.ext && horiz ? t / 2 : 0;
        const piece = (a, b, za, zb, m) => { if (b - a < 0.01) return; if (horiz) box(g.x1 + a, g.y1 - t / 2, za, g.x1 + b, g.y1 + t / 2, zb, m); else box(g.x1 - t / 2, g.y1 + a, za, g.x1 + t / 2, g.y1 + b, zb, m); };
        const mat = g.ext ? 'wall' : 'inwall';
        let cur = -ext;
        for (const o of g.ops) {
          piece(cur, o.a, z0, z0 + H, mat);
          const top = o.kind === 'window' ? (o.small ? 2.2 : 2.3) : o.kind === 'entry' ? 2.3 : 2.1; const sill = o.kind === 'window' ? (o.small ? 1.6 : 0.85) : 0;
          if (sill > 0) piece(o.a, o.a + o.w, z0, z0 + sill, mat);
          piece(o.a, o.a + o.w, z0 + top, z0 + H, mat);
          if (o.kind === 'window') { const gt = 0.04; if (horiz) { box(g.x1 + o.a, g.y1 - gt / 2, z0 + sill, g.x1 + o.a + o.w, g.y1 + gt / 2, z0 + top, 'glass'); if (g.ext) { box(g.x1 + o.a - 0.06, g.y1 - t / 2 - 0.05, z0 + sill - 0.06, g.x1 + o.a + o.w + 0.06, g.y1 - t / 2 + 0.02, z0 + sill, 'trim'); } }
            else { box(g.x1 - gt / 2, g.y1 + o.a, z0 + sill, g.x1 + gt / 2, g.y1 + o.a + o.w, z0 + top, 'glass'); if (g.ext) { const sx = g.x1 < 0.1 ? -1 : 1; box(Math.min(g.x1 + sx * (t / 2 + 0.05), g.x1 + sx * (t / 2 - 0.02)), g.y1 + o.a - 0.06, z0 + sill - 0.06, Math.max(g.x1 + sx * (t / 2 + 0.05), g.x1 + sx * (t / 2 - 0.02)), g.y1 + o.a + o.w + 0.06, z0 + sill, 'trim'); } } }
          if (o.kind === 'entry') { const dt = 0.06; if (horiz) box(g.x1 + o.a, g.y1 - dt / 2, z0, g.x1 + o.a + o.w, g.y1 + dt / 2, z0 + top, 'door'); else box(g.x1 - dt / 2, g.y1 + o.a, z0, g.x1 + dt / 2, g.y1 + o.a + o.w, z0 + top, 'door'); }
          cur = o.a + o.w;
        }
        piece(cur, l + ext, z0, z0 + H, mat);
      });
      z0 += H;
      if (li < s.levels.length - 1) { box(-0.05, -0.05, z0, W + 0.05, L + 0.05, z0 + slabT, 'slab'); z0 += slabT; }
    });
    if (s.neo) neoDetails(s, box, meshes, plinth);
    // tom
    const ov = s.overhang, top = z0; const nb0 = boxes.length, nm0 = meshes.length;
    box(-0.05, -0.05, top, W + 0.05, L + 0.05, top + 0.2, 'slab');
    const zt = top + 0.2;
    if (s.roof === 'flat') { box(-0.1, -0.1, zt, W + 0.1, L + 0.1, zt + 0.12, 'roof'); [[-0.1, -0.1, W + 0.1, 0.15], [-0.1, L - 0.15, W + 0.1, L + 0.1], [-0.1, -0.1, 0.15, L + 0.1], [W - 0.15, -0.1, W + 0.1, L + 0.1]].forEach(([a, b, c, d]) => box(a, b, zt, c, d, zt + 0.7, 'wall')); }
    else {
      const x1 = -ov, y1 = -ov, x2 = W + ov, y2 = L + ov, alongX = W >= L, span = alongX ? (y2 - y1) : (x2 - x1), rh = span / 2 * Math.tan(s.pitch * Math.PI / 180), zr = zt + rh;
      if (s.roof === 'gable') {
        if (alongX) { const ym = (y1 + y2) / 2; meshes.push({ m: 'roof', v: [[x1, y1, zt], [x2, y1, zt], [x2, ym, zr], [x1, ym, zr], [x1, y2, zt], [x2, y2, zt]], f: [[0, 1, 2, 3], [3, 2, 5, 4]] });
          meshes.push({ m: 'wall', v: [[0, 0, zt], [0, L, zt], [0, L / 2, zt + (L / 2) * Math.tan(s.pitch * Math.PI / 180)], [W, 0, zt], [W, L, zt], [W, L / 2, zt + (L / 2) * Math.tan(s.pitch * Math.PI / 180)]], f: [[0, 2, 1], [3, 4, 5]] }); }
        else { const xm = (x1 + x2) / 2; meshes.push({ m: 'roof', v: [[x1, y1, zt], [xm, y1, zr], [xm, y2, zr], [x1, y2, zt], [x2, y1, zt], [x2, y2, zt]], f: [[0, 1, 2, 3], [1, 4, 5, 2]] });
          meshes.push({ m: 'wall', v: [[0, 0, zt], [W, 0, zt], [W / 2, 0, zt + (W / 2) * Math.tan(s.pitch * Math.PI / 180)], [0, L, zt], [W, L, zt], [W / 2, L, zt + (W / 2) * Math.tan(s.pitch * Math.PI / 180)]], f: [[0, 1, 2], [3, 5, 4]] }); }
      } else {
        const inset = span / 2; const r1 = alongX ? [[x1 + inset, (y1 + y2) / 2, zr], [x2 - inset, (y1 + y2) / 2, zr]] : [[(x1 + x2) / 2, y1 + inset, zr], [(x1 + x2) / 2, y2 - inset, zr]];
        const v = [[x1, y1, zt], [x2, y1, zt], [x2, y2, zt], [x1, y2, zt], ...r1];
        meshes.push({ m: 'roof', v, f: alongX ? [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4]] : [[0, 1, 4], [1, 2, 5, 4], [2, 3, 5], [3, 0, 4, 5]] });
      }
    }
    boxes.slice(nb0).forEach(b => b.cut = true); meshes.slice(nm0).forEach(m => m.cut = true);
    // ayvon
    if (s.porch) {
      const p = s.porch, d = p.depth, ln = Math.min(p.len, p.side === 'E' || p.side === 'W' ? L : W), hh = Math.min(s.h, 3);
      let rect; if (p.side === 'S') rect = [(W - ln) / 2, -d, (W + ln) / 2, 0]; else if (p.side === 'N') rect = [(W - ln) / 2, L, (W + ln) / 2, L + d]; else if (p.side === 'W') rect = [-d, (L - ln) / 2, 0, (L + ln) / 2]; else rect = [W, (L - ln) / 2, W + d, (L + ln) / 2];
      const [a, b, c, e] = rect; box(a, b, 0, c, e, plinth - 0.05, 'base');
      const n = Math.max(2, Math.round(Math.max(c - a, e - b) / 3) + 1); const alongx = (c - a) >= (e - b);
      for (let k = 0; k < n; k++) { const t = k / (n - 1); const cx = alongx ? a + 0.2 + t * (c - a - 0.4) : (p.side === 'W' ? a + 0.2 : c - 0.2), cy = alongx ? (p.side === 'S' ? b + 0.2 : e - 0.2) : b + 0.2 + t * (e - b - 0.4); box(cx - 0.12, cy - 0.12, plinth - 0.05, cx + 0.12, cy + 0.12, plinth + hh, 'column'); }
      box(a - 0.2, b - 0.2, plinth + hh, c + 0.2, e + 0.2, plinth + hh + 0.15, 'roof');
    }
    // daraxtlar
    if (s.trees) { const S = Math.max(W, L); [[-S * 0.35, L * 0.2], [W + S * 0.3, L * 0.7], [-S * 0.25, L + S * 0.25], [W + S * 0.4, -S * 0.15], [W * 0.5, L + S * 0.45]].forEach(([x, y], i) => trees.push({ x: r2(x), y: r2(y), h: 4 + (i % 3), r: 1.4 + (i % 2) * 0.5 })); }
    if (s.porch) { const pr = boxes[boxes.length - 1]; if (pr && pr.m === 'roof') pr.cut = true; }
    return { boxes, meshes, trees, top: zt, size: Math.max(W, L) };
  }

  /* ---------- hajm va smeta ---------- */
  const PRICES = { brick: 1300, mortar: 650000, concrete: 950000, rebar: 11500, roofing: 135000, window: 1300000, door: 1600000, entry: 4500000, plaster: 45000, paint: 25000, screed: 70000, timber: 3800000 };
  function quantities(s) {
    let extA = 0, inA = 0, extLen = 0, inLen = 0, winA = 0, nWin = 0, nDoor = 0, nEntry = 0, floorA = 0;
    s.levels.forEach((lv, li) => { const P = plan(s, li); P.segs.forEach(g => { const l = Math.hypot(g.x2 - g.x1, g.y2 - g.y1); const op = g.ops.reduce((a, o) => a + o.w * (o.kind === 'window' ? (o.small ? 0.6 : 1.45) : o.kind === 'entry' ? 2.3 : 2.1), 0);
      g.ops.forEach(o => { if (o.kind === 'window') { nWin++; winA += o.w * (o.small ? 0.6 : 1.45); } else if (o.kind === 'door') nDoor++; else nEntry++; });
      if (g.ext) { extLen += l; extA += l * s.h - op; } else { inLen += l; inA += l * s.h - op; } }); floorA += P.rooms.reduce((a, r) => a + r.w * r.h, 0); });
    const masonryV = extA * s.wallT + inA * s.inT, bricks = Math.ceil(masonryV * 394), mortar = r2(masonryV * 0.23);
    const foundV = r2(2 * (s.W + s.L) * (0.5 * 1.3 + 0.45 * 0.4) + inLen / s.levels.length * 0.3 * 0.6);
    const slabV = r2(s.W * s.L * 0.22 * s.levels.length), concrete = r2(foundV + slabV), rebar = Math.ceil(foundV * 60 + slabV * 100);
    const span = Math.min(s.W, s.L) + 2 * s.overhang, longS = Math.max(s.W, s.L) + 2 * s.overhang;
    const roofA = r2(s.roof === 'flat' ? s.W * s.L : longS * span / Math.cos(s.pitch * Math.PI / 180));
    const plaster = r2(extA * 2 + inA * 2), screed = r2(s.W * s.L * s.levels.length);
    const rows = [
      ['G\'isht (250×120×65)', 'dona', bricks, PRICES.brick], ['Qorishma (sement-qum)', 'm³', mortar, PRICES.mortar], ['Beton M200 (poydevor + yopma)', 'm³', concrete, PRICES.concrete],
      ['Armatura', 'kg', rebar, PRICES.rebar], [s.roof === 'flat' ? 'Tom gidroizolyatsiyasi' : 'Tom yopmasi (profnastil/cherepitsa)', 'm²', r2(roofA * 1.1), PRICES.roofing],
      ...(s.roof === 'flat' ? [] : [['Tom yog\'och konstruksiyasi', 'm³', r2(roofA * 0.035), PRICES.timber]]),
      ['Deraza (plastik, shisha paket)', 'm²', r2(winA), PRICES.window], ['Ichki eshik', 'dona', nDoor, PRICES.door], ['Kirish eshigi', 'dona', nEntry, PRICES.entry],
      ['Suvoq (ichki + tashqi)', 'm²', plaster, PRICES.plaster], ['Bo\'yoq', 'm²', plaster, PRICES.paint], ['Pol styajkasi', 'm²', screed, PRICES.screed]];
    return { rows, info: { floorA: r2(floorA), buildA: r2(s.W * s.L), extLen: r2(extLen), inLen: r2(inLen), extA: r2(extA), inA: r2(inA), masonryV: r2(masonryV), foundV, slabV, roofA, nWin, nDoor, nEntry, levels: s.levels.length } };
  }

  /* ---------- 2D chizma (SVG) ---------- */
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function planSVG(s, li, opt = {}) {
    const P = plan(s, li), k = opt.scale || 40, m = 70, Wp = s.W * k + 2 * m, Lp = s.L * k + 2 * m;
    const X = x => m + x * k, Y = y => m + (s.L - y) * k; // y shimolga — yuqoriga
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wp} ${Lp}" width="${Wp}" height="${Lp}" font-family="Segoe UI,Arial,sans-serif"><rect width="100%" height="100%" fill="#fff"/>`;
    const fills = { living: '#fff4e0', bed: '#eaf3ff', kitchen: '#fdecec', bath: '#e6f7f4', hall: '#f3f3f3', store: '#f1eee8', garage: '#eeeeee', room: '#f7f7ff' };
    P.rooms.forEach(r => { o += `<rect x="${X(r.x)}" y="${Y(r.y + r.h)}" width="${r.w * k}" height="${r.h * k}" fill="${fills[r.type] || '#f7f7ff'}"/>`; });
    // devorlar
    P.segs.forEach(g => { const horiz = g.y1 === g.y2, t = g.t * k, l = Math.hypot(g.x2 - g.x1, g.y2 - g.y1), ext = g.ext && horiz ? g.t / 2 : 0; let cur = -ext;
      const rect = (a, b) => { if (b - a < 0.01) return; o += horiz ? `<rect x="${X(g.x1 + a)}" y="${Y(g.y1) - t / 2}" width="${(b - a) * k}" height="${t}" fill="#222"/>` : `<rect x="${X(g.x1) - t / 2}" y="${Y(g.y1 + b)}" width="${t}" height="${(b - a) * k}" fill="#222"/>`; };
      g.ops.forEach(op => { rect(cur, op.a); cur = op.a + op.w;
        if (op.kind === 'window') { o += horiz ? `<rect x="${X(g.x1 + op.a)}" y="${Y(g.y1) - t / 2}" width="${op.w * k}" height="${t}" fill="#fff" stroke="#1e6fd9" stroke-width="1.2"/><line x1="${X(g.x1 + op.a)}" y1="${Y(g.y1)}" x2="${X(g.x1 + op.a + op.w)}" y2="${Y(g.y1)}" stroke="#1e6fd9" stroke-width="1.2"/>`
          : `<rect x="${X(g.x1) - t / 2}" y="${Y(g.y1 + op.a + op.w)}" width="${t}" height="${op.w * k}" fill="#fff" stroke="#1e6fd9" stroke-width="1.2"/><line x1="${X(g.x1)}" y1="${Y(g.y1 + op.a)}" x2="${X(g.x1)}" y2="${Y(g.y1 + op.a + op.w)}" stroke="#1e6fd9" stroke-width="1.2"/>`; }
        else { const w = op.w * k; if (horiz) { const x0 = X(g.x1 + op.a), y0 = Y(g.y1); o += `<path d="M${x0} ${y0} L${x0} ${y0 - w} A${w} ${w} 0 0 1 ${x0 + w} ${y0}" fill="none" stroke="#c0392b" stroke-width="1"/>`; } else { const x0 = X(g.x1), y0 = Y(g.y1 + op.a); o += `<path d="M${x0} ${y0} L${x0 + w} ${y0} A${w} ${w} 0 0 0 ${x0} ${y0 - w}" fill="none" stroke="#c0392b" stroke-width="1"/>`; } } });
      rect(cur, l + ext); });
    // yozuvlar
    P.rooms.forEach(r => { const cx = X(r.x + r.w / 2), cy = Y(r.y + r.h / 2), fs = Math.max(9, Math.min(15, r.w * k / 8));
      o += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="#333">${esc(r.name)}</text><text x="${cx}" y="${cy + fs}" text-anchor="middle" font-size="${fs * 0.85}" fill="#666">${r2(r.w * r.h).toFixed(1)} m² · ${r.w.toFixed(1)}×${r.h.toFixed(1)}</text>`; });
    // o'lcham chiziqlari
    const dim = (x1, y1, x2, y2, txt, vert) => { o += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#555" stroke-width="1"/><line x1="${x1 - (vert ? 6 : 0)}" y1="${y1 - (vert ? 0 : 6)}" x2="${x1 + (vert ? 6 : 0)}" y2="${y1 + (vert ? 0 : 6)}" stroke="#555"/><line x1="${x2 - (vert ? 6 : 0)}" y1="${y2 - (vert ? 0 : 6)}" x2="${x2 + (vert ? 6 : 0)}" y2="${y2 + (vert ? 0 : 6)}" stroke="#555"/>` + (vert ? `<text x="${x1 - 10}" y="${(y1 + y2) / 2}" font-size="13" fill="#333" text-anchor="middle" transform="rotate(-90 ${x1 - 10} ${(y1 + y2) / 2})">${txt}</text>` : `<text x="${(x1 + x2) / 2}" y="${y1 - 8}" font-size="13" fill="#333" text-anchor="middle">${txt}</text>`); };
    dim(X(0), m - 34, X(s.W), m - 34, s.W.toFixed(2) + ' m'); dim(m - 34, Y(s.L), m - 34, Y(0), s.L.toFixed(2) + ' m', true);
    o += `<text x="${Wp - 14}" y="${Lp - 14}" font-size="12" text-anchor="end" fill="#888">${esc(s.name)} · ${li + 1}-qavat · M 1:${Math.round(100 / k * 100) / 1}</text>`;
    o += `<g transform="translate(${Wp - 40},40)"><circle r="16" fill="none" stroke="#999"/><path d="M0 -14 L5 4 L0 0 L-5 4Z" fill="#c0392b"/><text y="-20" font-size="11" text-anchor="middle" fill="#666">Sh</text></g>`;
    return o + '</svg>';
  }

  /* ---------- DXF (AutoCAD) ---------- */
  function dxf(s) {
    const L = []; const add = (...a) => L.push(...a.map(String));
    add(0, 'SECTION', 2, 'ENTITIES');
    const line = (x1, y1, x2, y2, layer) => add(0, 'LINE', 8, layer, 10, r2(x1 * 1000), 20, r2(y1 * 1000), 30, 0, 11, r2(x2 * 1000), 21, r2(y2 * 1000), 31, 0);
    const text = (x, y, h, t, layer) => add(0, 'TEXT', 8, layer, 10, r2(x * 1000), 20, r2(y * 1000), 30, 0, 40, h, 1, t);
    s.levels.forEach((lv, li) => { const P = plan(s, li); const dx = li * (s.W + 4);
      P.segs.forEach(g => { const horiz = g.y1 === g.y2, t = g.t, l = Math.hypot(g.x2 - g.x1, g.y2 - g.y1), ext = g.ext && horiz ? t / 2 : 0; let cur = -ext; const lay = g.ext ? 'DEVOR_TASHQI' : 'DEVOR_ICHKI';
        const rect = (a, b) => { if (b - a < 0.01) return; let x1, y1, x2, y2; if (horiz) { x1 = g.x1 + a; x2 = g.x1 + b; y1 = g.y1 - t / 2; y2 = g.y1 + t / 2; } else { y1 = g.y1 + a; y2 = g.y1 + b; x1 = g.x1 - t / 2; x2 = g.x1 + t / 2; } x1 += dx; x2 += dx; line(x1, y1, x2, y1, lay); line(x2, y1, x2, y2, lay); line(x2, y2, x1, y2, lay); line(x1, y2, x1, y1, lay); };
        g.ops.forEach(op => { rect(cur, op.a); cur = op.a + op.w; const lay2 = op.kind === 'window' ? 'DERAZA' : 'ESHIK'; if (horiz) line(dx + g.x1 + op.a, g.y1, dx + g.x1 + op.a + op.w, g.y1, lay2); else line(dx + g.x1, g.y1 + op.a, dx + g.x1, g.y1 + op.a + op.w, lay2); }); rect(cur, l + ext); });
      P.rooms.forEach(r => text(dx + r.x + 0.3, r.y + r.h / 2, 250, `${r.name} ${r2(r.w * r.h)} m2`, 'MATN')); text(dx, -1.2, 350, `${s.name} - ${li + 1}-qavat`, 'MATN'); });
    add(0, 'ENDSEC', 0, 'EOF'); return L.join('\r\n');
  }

  /* ---------- Blender skripti (Cycles bilan fotoreal render) ---------- */
  /* ---------- Blender: tayyor kutubxona (HDRI, PBR teksturalar, daraxt/buta/gul/chiroq/mebel modellari), mashina va odamlar ---------- */
  function assetPy(s, G3, o) {
    const C = s.colors, W = s.W, L = s.L, cx = W / 2, S = G3.size, fy = o.fy, st = s.style || '';
    const ex = o.ex; const pro = G3.boxes.filter(b => (b.m === 'base' || b.m === 'column') && b.p[1] - b.s[1] / 2 < -0.3 && b.p[2] - b.s[2] / 2 < 1.5); const px1 = pro.length ? Math.min(...pro.map(b => b.p[0] - b.s[0] / 2)) : ex - 1.2, px2 = pro.length ? Math.max(...pro.map(b => b.p[0] + b.s[0] / 2)) : ex + 1.2;
    const wallTex = o.isRed(C.wall) ? `pbr('wall', 'red_brick_03') or pbr('wall', 'brick_wall_02')` : `pbr('wall', 'white_stucco', ${o.tint(C.wall)}) or pbr('wall', 'plastered_wall', ${o.tint(C.wall)})`;
    const roofTex = o.isRed(C.roof) ? `pbr('roof', 'clay_roof_tiles') or pbr('roof', 'roof_tiles_14', ${o.tint(C.roof, 1.6)})` : `pbr('roof', 'grey_roof_tiles_02', ${o.tint(C.roof, 2.2)}) or pbr('roof', 'grey_roof_tiles', ${o.tint(C.roof, 2.2)})`;
    const trimTex = st === 'neoklassik' ? `pbr('trim', 'marble_01'); pbr('column', 'marble_01'); pbr('slab', 'marble_01')` : `pbr('trim', 'plastered_wall', ${o.tint(C.trim)})`;
    return `# ===== KUTUBXONA (Jarvis resurslari + foydalanuvchi papkasi) =====
ASSETS = ${JSON.stringify(o.assets)}
ULIB = ${JSON.stringify(o.lib)}
SKY = ${JSON.stringify(o.sky)}
VIEW = ${JSON.stringify(o.view)}
STYLE = ${JSON.stringify(st)}
W, L, CX, S, FY, TOP = ${W}, ${L}, ${cx}, ${S}, ${fy.toFixed(2)}, ${G3.top.toFixed(2)}
PX1, PX2, EX = ${Math.max(0, px1).toFixed(2)}, ${Math.min(W, px2).toFixed(2)}, ${ex}
CAMXY = (${o.cam[0].toFixed(2)}, ${o.cam[1].toFixed(2)})
def nearcam(x, y, r=2.6): return (x - CAMXY[0]) ** 2 + (y - CAMXY[1]) ** 2 < r * r
ROOMS = ${JSON.stringify(o.rooms0)}
TREES = ${JSON.stringify(G3.trees.map(t => [t.x, t.y, t.h, t.r]))}
EXPO = -0.35
def log(*a): print('JARVIS_ASSET', *a)
def AP(*a):
    if not ASSETS: return None
    p = os.path.join(ASSETS, *a); return p if os.path.exists(p) else None
def mixmul(nt):
    try:
        n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = 'MULTIPLY'; n.inputs[0].default_value = 1.0; return n.inputs[6], n.inputs[7], n.outputs[2]
    except Exception:
        n = nt.nodes.new('ShaderNodeMixRGB'); n.blend_type = 'MULTIPLY'; n.inputs[0].default_value = 1.0; return n.inputs[1], n.inputs[2], n.outputs[0]
def pbr(key, tex, tint=None):
    d = AP('tex', tex)
    if not d or key not in M: return False
    try:
        tile = 2.0
        try: tile = float(json.load(open(os.path.join(d, 'info.json'))).get('tile', 2.0))
        except Exception: pass
        m = M[key]; nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
        geo = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1 / tile); nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
        def img(fn, data=False):
            p = os.path.join(d, fn)
            if not os.path.exists(p): return None
            n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(p, check_existing=True); n.projection = 'BOX'; n.projection_blend = 0.3
            if data: n.image.colorspace_settings.name = 'Non-Color'
            nt.links.new(mp.outputs[0], n.inputs[0]); return n
        dn = img('diff.jpg')
        if not dn: return False
        if tint:
            ia, ib, out = mixmul(nt); nt.links.new(dn.outputs[0], ia); ib.default_value = tint; nt.links.new(out, b.inputs['Base Color'])
        else: nt.links.new(dn.outputs[0], b.inputs['Base Color'])
        rn = img('rough.jpg', True)
        if rn: nt.links.new(rn.outputs[0], b.inputs['Roughness'])
        nn = img('nor.jpg', True)
        if nn:
            nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.7; nt.links.new(nn.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
        return True
    except Exception as e:
        log('pbr', tex, e); return False
# --- teksturalar ---
try:
    ${wallTex}
    ${roofTex}
    ${trimTex}
    pbr('base', 'rectangular_facade_tiles', (0.35, 0.35, 0.36, 1)) or pbr('base', 'plaster_stone_wall_01')
    pbr('path', 'herringbone_pavement_02') or pbr('path', 'brick_pavement')
    pbr('drive', 'concrete_pavers_02') or pbr('drive', 'concrete_pavement')
    pbr('floor', 'laminate_floor_02') or pbr('floor', 'diagonal_parquet')
    pbr('ground', 'aerial_grass_rock', (0.42, 0.72, 0.28, 1)) or pbr('ground', 'forest_floor')
except Exception as e: log('tex', e)
# --- Jarvis kutubxonasi (.blend ichida kolleksiyalar) ---
LIBC = {}
try:
    p = AP('kutubxona.blend')
    if p:
        with bpy.data.libraries.load(p, link=False) as (src, dst): dst.collections = [c for c in src.collections if c.startswith('PH_')]
        for c in dst.collections:
            if c: LIBC[c.name[3:]] = c
        log('kutubxona', len(LIBC))
except Exception as e: log('kutubxona', e)
def pick(*names):
    ok = [LIBC[n] for n in names if n in LIBC]
    return random.choice(ok) if ok else None
def variants(*names):
    out = []
    for n in names:
        v = [LIBC[k] for k in sorted(LIBC) if k.startswith(n + '#')]
        out += v or ([LIBC[n]] if n in LIBC else [])
    return out
def dims(col):
    try: return float(col.get('h', 1.0)) or 1.0, float(col.get('l', 1.0)) or 1.0
    except Exception: return 1.0, 1.0
def inst(col, x, y, z=0.0, rot=0.0, sc_=1.0):
    e = bpy.data.objects.new('i_' + col.name, None); e.instance_type = 'COLLECTION'; e.instance_collection = col
    e.location = (x, y, z); e.rotation_euler = (0, 0, rot); e.scale = (sc_, sc_, sc_); sc.collection.objects.link(e); return e
def put(col, x, y, z=0.0, rot=0.0, h=None, l=None, jit=0.0):
    hh, ll = dims(col); j = 1 + random.uniform(-jit, jit)
    if h and l:
        e = inst(col, x, y, z, rot, 1.0); e.scale = (l / ll * j, l / ll * j, h / hh * j); return e
    k = h / hh if h else l / ll if l else 1.0
    return inst(col, x, y, z, rot, k * j)
# --- foydalanuvchi kutubxonasi: Hujjatlar/Jarvis/Kutubxona/{mashina,odam,daraxt,mebel} ---
def uimport(path):
    ext = os.path.splitext(path)[1].lower(); before = set(bpy.data.objects)
    try:
        if ext == '.blend':
            with bpy.data.libraries.load(path, link=False) as (src, dst): dst.objects = list(src.objects)
            for ob in dst.objects:
                if ob: sc.collection.objects.link(ob)
        elif ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=path)
        elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=path)
        elif ext == '.obj':
            try: bpy.ops.wm.obj_import(filepath=path)
            except Exception: bpy.ops.import_scene.obj(filepath=path)
        else: return None
    except Exception as e:
        log('import', os.path.basename(path), e); return None
    new = [ob for ob in bpy.data.objects if ob not in before]
    for ob in list(new):
        if ob.type in ('CAMERA', 'LIGHT'): new.remove(ob); bpy.data.objects.remove(ob)
    bpy.context.view_layer.update()
    pts = [ob.matrix_world @ mathutils.Vector(c) for ob in new if ob.type == 'MESH' for c in ob.bound_box]
    if not pts: return None
    col = bpy.data.collections.new('U_' + os.path.basename(path)[:40])
    for ob in new:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob)
    mn = [min(p_[i] for p_ in pts) for i in range(3)]; mx = [max(p_[i] for p_ in pts) for i in range(3)]
    col.instance_offset = ((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2])
    col['h'] = max(0.01, mx[2] - mn[2]); col['l'] = max(0.01, mx[0] - mn[0], mx[1] - mn[1])
    log('user', os.path.basename(path), round(col['h'], 2), round(col['l'], 2)); return col
USER = {}
if ULIB and os.path.isdir(ULIB):
    for k in ('mashina', 'odam', 'daraxt', 'mebel'):
        d = os.path.join(ULIB, k); USER[k] = []
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d))[:6]:
            if os.path.splitext(f)[1].lower() in ('.blend', '.glb', '.gltf', '.fbx', '.obj'):
                c = uimport(os.path.join(d, f))
                if c: USER[k].append(c)
def ucol(k): return random.choice(USER[k]) if USER.get(k) else None
# --- yordamchi: oddiy shakllar ---
def pmat(name, col, rough=0.5, metal=0.0, coat=0.0, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    for k in ('Coat Weight', 'Clearcoat'):
        if k in b.inputs: b.inputs[k].default_value = coat; break
    if emit:
        for k in ('Emission Color', 'Emission'):
            if k in b.inputs: b.inputs[k].default_value = col; break
        if 'Emission Strength' in b.inputs: b.inputs['Emission Strength'].default_value = emit
    return m
def prim(kind, loc, scl, m, coll, rot=(0, 0, 0), bevel=0.0, smooth=False, **kw):
    if kind == 'cube': bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == 'cyl': bpy.ops.mesh.primitive_cylinder_add(vertices=kw.get('v', 24), radius=1, depth=1, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.scale = scl; ob.data.materials.append(m)
    if bevel:
        md = ob.modifiers.new('Fask', 'BEVEL'); md.width = bevel; md.segments = 3
        try: md.affect = 'EDGES'
        except Exception: pass
    if smooth or bevel:
        try: bpy.ops.object.shade_smooth()
        except Exception: pass
    for c in list(ob.users_collection): c.objects.unlink(ob)
    coll.objects.link(ob); return ob
# --- mashina (kutubxonada bo'lmasa — stilize model) ---
CARS = []
def mkcar(i, paint):
    coll = bpy.data.collections.new('Mashina_%d' % i)
    pm = pmat('Kuzov', paint, 0.18, 0.55, 1.0); gl = pmat('Oyna_m', (0.02, 0.025, 0.03, 1), 0.04, 0.0, 1.0); rb = pmat('Rezina', (0.02, 0.02, 0.02, 1), 0.85)
    ch = pmat('Xrom', (0.8, 0.8, 0.82, 1), 0.15, 1.0); hl = pmat('Fara', (1, 0.95, 0.85, 1), 0.1, 0, 0, 2.0 if SKY == 'kech' else 0.3); tl = pmat('Stop', (0.8, 0.02, 0.02, 1), 0.3, 0, 0, 1.0)
    prim('cube', (0, 0, 0.62), (4.7, 1.86, 0.62), pm, coll, bevel=0.16)
    cab = prim('cube', (-0.25, 0, 1.17), (2.55, 1.62, 0.56), gl, coll, bevel=0.14)
    for v in cab.data.vertices:
        if v.co.z > 0: v.co.x *= 0.72; v.co.y *= 0.86
    prim('cube', (-0.25, 0, 1.46), (1.75, 1.36, 0.04), pm, coll, bevel=0.02)
    for x in (1.48, -1.5):
        for y in (0.83, -0.83):
            prim('cyl', (x, y, 0.36), (0.36, 0.36, 0.24), rb, coll, rot=(math.radians(90), 0, 0), smooth=True, v=32)
            prim('cyl', (x, y + (0.125 if y > 0 else -0.125), 0.36), (0.24, 0.24, 0.02), ch, coll, rot=(math.radians(90), 0, 0), smooth=True)
    for y in (0.62, -0.62):
        prim('cube', (2.34, y, 0.74), (0.04, 0.38, 0.1), hl, coll, bevel=0.02); prim('cube', (-2.34, y, 0.78), (0.04, 0.36, 0.08), tl, coll, bevel=0.02)
    coll['h'] = 1.5; coll['l'] = 4.7; return coll
def car_col():
    u = ucol('mashina')
    if u: return u, 4.7
    if not CARS:
        for i, c in enumerate(((0.01, 0.012, 0.015, 1), (0.85, 0.86, 0.87, 1), (0.25, 0.27, 0.3, 1))): CARS.append(mkcar(i, c))
    return random.choice(CARS), None
# --- odamlar (kutubxonada bo'lmasa — arxitektura maketidagi kabi stilize figuralar) ---
PEOPLE = []
def mkperson(i, cloth, pants):
    coll = bpy.data.collections.new('Odam_%d' % i); sk = pmat('Teri', (0.62, 0.45, 0.35, 1), 0.6); cm = pmat('Kiyim', cloth, 0.8); pm_ = pmat('Shim', pants, 0.85); sh = pmat('Poyabzal', (0.05, 0.04, 0.04, 1), 0.5)
    for y in (0.1, -0.1):
        prim('cyl', (0, y, 0.47), (0.075, 0.075, 0.86), pm_, coll, smooth=True, v=16); prim('cube', (0.05, y, 0.04), (0.26, 0.1, 0.08), sh, coll, bevel=0.03)
    prim('cyl', (0, 0, 1.18), (0.13, 0.2, 0.62), cm, coll, smooth=True, v=20)
    prim('sph', (0, 0, 1.5), (0.16, 0.22, 0.09), cm, coll, smooth=True)
    for y, a in ((0.26, 8), (-0.26, -8)): prim('cyl', (0, y, 1.13), (0.05, 0.05, 0.62), cm, coll, rot=(math.radians(a), 0, 0), smooth=True, v=12)
    prim('cyl', (0, 0, 1.6), (0.05, 0.05, 0.1), sk, coll, smooth=True, v=12); prim('sph', (0.01, 0, 1.73), (0.1, 0.085, 0.12), sk, coll, smooth=True)
    coll['h'] = 1.84; coll['l'] = 0.55; return coll
def person_col():
    u = ucol('odam')
    if u: return u, 1.75
    if not PEOPLE:
        pal = (((0.75, 0.75, 0.72, 1), (0.08, 0.1, 0.16, 1)), ((0.12, 0.2, 0.32, 1), (0.25, 0.22, 0.2, 1)), ((0.55, 0.12, 0.1, 1), (0.05, 0.05, 0.06, 1)), ((0.9, 0.88, 0.82, 1), (0.6, 0.55, 0.45, 1)))
        for i, (a, b_) in enumerate(pal): PEOPLE.append(mkperson(i, a, b_))
    return random.choice(PEOPLE), None
# --- sochish (geometry nodes): maysa va gullar ---
def scatter(col, pts, smin=0.8, smax=1.2):
    if not col or not pts: return
    try:
        me = bpy.data.meshes.new('nuqtalar'); me.from_pydata(pts, [], []); me.update(); ob = bpy.data.objects.new('Sochish_' + col.name, me); sc.collection.objects.link(ob)
        ng = bpy.data.node_groups.new('Sochish', 'GeometryNodeTree')
        try: ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry'); ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        except Exception: ng.inputs.new('NodeSocketGeometry', 'Geometry'); ng.outputs.new('NodeSocketGeometry', 'Geometry')
        n = ng.nodes; gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput'); io = n.new('GeometryNodeInstanceOnPoints'); ci = n.new('GeometryNodeCollectionInfo')
        ci.inputs['Collection'].default_value = col; ci.transform_space = 'ORIGINAL'
        rr = n.new('FunctionNodeRandomValue'); rr.data_type = 'FLOAT_VECTOR'; rr.inputs['Max'].default_value = (0, 0, 6.283); rr.inputs['Min'].default_value = (0, 0, 0)
        rs = n.new('FunctionNodeRandomValue'); rs.data_type = 'FLOAT'; fv = [i_ for i_ in rs.inputs if i_.type == 'VALUE' and i_.name in ('Min', 'Max')]; fv[0].default_value = smin; fv[1].default_value = smax
        ng.links.new(gi.outputs[0], io.inputs['Points']); ng.links.new(ci.outputs[0], io.inputs['Instance'])
        ng.links.new(rr.outputs[0], io.inputs['Rotation']); ng.links.new([o_ for o_ in rs.outputs if o_.type == 'VALUE'][0], io.inputs['Scale'])
        ng.links.new(io.outputs[0], go.inputs[0])
        md = ob.modifiers.new('Sochish', 'NODES'); md.node_group = ng
    except Exception as e: log('scatter', e)
def inside(x, y, rects):
    for a, b_, c, d in rects:
        if a <= x <= c and b_ <= y <= d: return True
    return False
# ===== joylashtirish =====
try:
    DX = W * 0.84 if EX < W / 2 else W * 0.16
    BLOCK = [(-0.6, -0.6, W + 0.6, L + 0.6), (PX1 - 0.4, FY - 0.6, PX2 + 0.4, 0), (EX - 1.1, FY - S * 1.25, EX + 1.1, FY), (DX - 2.0, FY - S * 1.25, DX + 2.0, 0)]
    # daraxtlar
    for x, y, h, r in TREES:
        u = ucol('daraxt'); c = u or pick('island_tree_01', 'island_tree_02', 'tree_small_02', 'island_tree_03')
        if nearcam(x, y, 4): continue
        if c: put(c, x, y, 0, random.uniform(0, 6.28), h=h * 1.3, jit=0.12)
        else:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=h * 0.45, location=(x, y, h * 0.22)); bpy.context.active_object.data.materials.append(M['trunk'])
            for dx, dy, dz, k in ((0, 0, 0.62, 1.0), (0.45, 0.2, 0.5, 0.7), (-0.4, -0.25, 0.52, 0.72), (0.1, -0.4, 0.78, 0.65), (-0.2, 0.35, 0.8, 0.6)):
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r * k, location=(x + dx * r, y + dy * r, h * dz)); o_ = bpy.context.active_object; o_.data.materials.append(M['leaf']); bpy.ops.object.shade_smooth()
    if VIEW != 'cut' and STYLE == 'neoklassik':
        cyp = bpy.data.collections.new('Sarv'); lm = pmat('Sarv_barg', (0.05, 0.16, 0.05, 1), 0.85)
        for i in range(9):
            z = 0.5 + i * 0.42; r = 0.55 * (1 - i / 10.5) + 0.12
            prim('sph', (random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), z), (r, r, 0.42), lm, cyp, smooth=True)
        prim('cyl', (0, 0, 0.3), (0.08, 0.08, 0.6), M['trunk'], cyp, v=8); cyp['h'] = 4.3; cyp['l'] = 1.3
        for x in (-1.3, W + 1.3): put(cyp, x, FY - 0.8, 0, random.uniform(0, 6.28), h=min(TOP * 0.85, 6.5), jit=0.04)
    # qirqilgan to'siq (shamshod) va topiari — fasad bo'ylab
    hm = bpy.data.materials.new('Shamshod'); hm.use_nodes = True; hn = hm.node_tree; hb = hn.nodes.get('Principled BSDF')
    nz = hn.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 38.0; nz.inputs['Detail'].default_value = 6.0
    cr = hn.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.015, 0.055, 0.012, 1); cr.color_ramp.elements[1].color = (0.11, 0.26, 0.05, 1)
    hn.links.new(nz.outputs['Fac'], cr.inputs[0]); hn.links.new(cr.outputs[0], hb.inputs['Base Color']); hb.inputs['Roughness'].default_value = 0.75
    bu = hn.nodes.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = 0.9; hn.links.new(nz.outputs['Fac'], bu.inputs['Height']); hn.links.new(bu.outputs[0], hb.inputs['Normal'])
    hc = bpy.data.collections.new('Toshiq'); sc.collection.children.link(hc)
    def hedge(x1, y1, x2, y2, h):
        if x2 - x1 < 0.5 and y2 - y1 < 0.5: return
        prim('cube', ((x1 + x2) / 2, (y1 + y2) / 2, h / 2), (x2 - x1, y2 - y1, h), hm, hc, bevel=0.14)
    def ball(x, y, r):
        prim('sph', (x, y, r * 0.95), (r, r, r), hm, hc, smooth=True); prim('cyl', (x, y, 0.12), (r * 0.9, r * 0.9, 0.24), M['base'], hc, v=24)
    HY, HH = -0.85, 0.75 if STYLE == 'neoklassik' else 0.6
    segs = [(0.25, PX1 - 0.55), (PX2 + 0.55, W - 0.25)]
    for a_, b_ in segs:
        if abs(((a_ + b_) / 2) - DX) < 2.2 or (a_ < DX - 2.1 < b_) or (a_ < DX + 2.1 < b_):
            for c_, d_ in ((a_, min(b_, DX - 2.1)), (max(a_, DX + 2.1), b_)):
                if d_ - c_ > 0.5: hedge(c_, HY - 0.35, d_, HY + 0.35, HH)
        else: hedge(a_, HY - 0.35, b_, HY + 0.35, HH)
    for x in (-0.95, W + 0.95): hedge(x - 0.35, 0.3, x + 0.35, L - 0.3, HH + 0.2)
    if VIEW != 'cut':
        for x in (PX1 - 0.25, PX2 + 0.25): ball(x, FY - 0.15, 0.42)
    # gullar (to'siq oldida tasma)
    fl = pick('flower_gazania', 'periwinkle_plant', 'flower_ursinia')
    if fl:
        fl_l = dims(fl)[1]; pts = [(random.uniform(0.3, W - 0.3), random.uniform(HY - 0.85, HY - 0.5), 0) for _ in range(int(W * 0.4 * 3 / max(0.15, fl_l * fl_l)) + 4)]
        scatter(fl, [p_ for p_ in pts if not (PX1 - 0.6 < p_[0] < PX2 + 0.6) and abs(p_[0] - DX) > 2.1], 0.5, 0.8)
    # maysa
    gr = LIBC.get('grass_medium_01') or LIBC.get('grass_medium_02')
    if gr:
        pts = []
        x0, x1, y0, y1 = -S * 0.9, W + S * 0.9, FY - S * 1.2, L + S * 0.6
        gl_ = max(0.3, dims(gr)[1] * 0.7); n = min(7000, int((x1 - x0) * (y1 - y0) * 1.6 / (gl_ * gl_)))
        for _ in range(n):
            x, y = random.uniform(x0, x1), random.uniform(y0, y1)
            if not inside(x, y, BLOCK) and not (-1.75 < y < 0 and -1.4 < x < W + 1.4) and not (-1.4 < x < -0.5 or W + 0.5 < x < W + 1.4): pts.append((x, y, 0))
        scatter(gr, pts, 0.7, 1.0)
    # kirish oldida guldonlar
    pp = pick('potted_plant_01', 'potted_plant_02', 'planter_pot_clay')
    if pp and VIEW != 'cut':
        for x in (EX - 1.35, EX + 1.35): put(pp, x, FY - 0.45, 0, random.uniform(0, 6.28), h=1.2)
    # yo'lak chiroqlari
    LAMPS = []
    lp = pick('street_lamp_02', 'street_lamp_01'); lh = 1.7 if lp and lp.name.endswith('street_lamp_02') else 3.0
    if lp and VIEW != 'cut':
        y = FY - 2.6
        while y > FY - S * 1.15:
            for x in (EX - 1.35, EX + 1.35):
                if not nearcam(x, y): put(lp, x, y, 0, 0, h=lh); LAMPS.append((x, y, lh * 0.92))
            y -= 6.5
    # bog' mebeli
    bn = pick('outdoor_table_chair_set_01', 'painted_wooden_bench', 'wooden_picnic_table')
    if bn and VIEW != 'cut': put(bn, -S * 0.35, FY - S * 0.35, 0, math.radians(20))
    # mashina va odamlar
    if VIEW != 'cut':
        cc, ln = car_col(); put(cc, DX, FY - min(S * 0.42, 6.5), 0, math.radians(90 + random.uniform(-6, 6)), l=ln)
        for x, y, r_ in ((EX + 0.9, FY - 1.9, -100), (EX + 1.5, FY - 2.2, 120), (EX - 0.2, FY - S * 0.55, 90), (DX + (-2.3 if DX > EX else 2.3), FY - min(S * 0.42, 6.5) + 0.6, 200)):
            if nearcam(x, y): continue
            pc, hh = person_col(); put(pc, x, y, 0, math.radians(r_ + random.uniform(-15, 15)), h=hh and hh * random.uniform(0.93, 1.05))
    # interyer (kesma ko'rinish)
    if VIEW == 'cut':
        Z = 0.5
        wd = pmat('Yogoch', (0.32, 0.2, 0.12, 1), 0.45); tx = pmat('Mato', (0.85, 0.83, 0.78, 1), 0.9); ce = pmat('Chinni', (0.95, 0.95, 0.95, 1), 0.15); ct = pmat('Stoleshnitsa', (0.12, 0.12, 0.13, 1), 0.3)
        icoll = bpy.data.collections.new('Interyer'); sc.collection.children.link(icoll)
        for x, y, w, h, t in ROOMS:
            mx, my = x + w / 2, y + h / 2
            if t == 'living':
                c = ucol('mebel') or pick('sofa_02', 'Sofa_01', 'sofa_03')
                if c: put(c, mx, y + h - 0.75, Z, 0)
                c = pick('modern_coffee_table_01', 'modern_coffee_table_02', 'CoffeeTable_01')
                if c: put(c, mx, my + 0.1, Z, 0)
                c = pick('modern_arm_chair_01', 'ArmChair_01')
                if c and w > 3.2: put(c, x + 0.75, my, Z, math.radians(-90))
                c = pick('potted_plant_02', 'potted_plant_01')
                if c: put(c, x + w - 0.45, y + h - 0.45, Z, 0, h=1.2)
            elif t == 'bed':
                bw = min(1.8, w - 0.9)
                prim('cube', (mx, y + h - 1.15, Z + 0.22), (bw + 0.1, 2.1, 0.3), wd, icoll, bevel=0.03)
                prim('cube', (mx, y + h - 1.12, Z + 0.45), (bw, 1.95, 0.22), tx, icoll, bevel=0.08)
                prim('cube', (mx, y + h - 0.12, Z + 0.6), (bw + 0.2, 0.08, 1.2), wd, icoll, bevel=0.02)
                for k in (-0.25, 0.25): prim('cube', (mx + k * bw, y + h - 0.45, Z + 0.62), (bw * 0.42, 0.42, 0.14), tx, icoll, bevel=0.06)
                c = pick('side_table_01', 'painted_wooden_nightstand', 'ClassicNightstand_01')
                if c: put(c, mx + bw / 2 + 0.45, y + h - 0.4, Z, 0)
            elif t == 'kitchen':
                prim('cube', (mx, y + h - 0.35, Z + 0.45), (w - 0.5, 0.6, 0.9), wd, icoll, bevel=0.01); prim('cube', (mx, y + h - 0.35, Z + 0.92), (w - 0.45, 0.64, 0.04), ct, icoll)
                c = pick('dining_table', 'round_wooden_table_01', 'WoodenTable_01')
                if c:
                    put(c, mx, my - 0.2, Z, 0)
                    ch = pick('dining_chair_02', 'WoodenChair_01')
                    if ch:
                        for dx, dy, a in ((0, -0.75, 0), (0, 0.75, 180), (-0.9, 0, -90), (0.9, 0, 90)): put(ch, mx + dx, my - 0.2 + dy, Z, math.radians(a))
            elif t == 'bath':
                prim('cube', (x + 0.45, my, Z + 0.3), (0.75, min(1.7, h - 0.4), 0.6), ce, icoll, bevel=0.08)
            elif t == 'hall':
                c = pick('potted_plant_04', 'potted_plant_01')
                if c: put(c, x + 0.4, y + 0.4, Z, 0, h=1.0)
            # xonani yoritish
            ld = bpy.data.lights.new('Xona', 'POINT'); ld.energy = 120; ld.color = (1, 0.85, 0.65); ld.shadow_soft_size = 0.6
            lo = bpy.data.objects.new('Xona', ld); lo.location = (mx, my, Z + 2.2); sc.collection.objects.link(lo)
    # kechki yoritish
    if SKY == 'kech' and VIEW != 'cut':
        try:
            gb = M['glass'].node_tree.nodes.get('Principled BSDF')
            for k in ('Emission Color', 'Emission'):
                if k in gb.inputs: gb.inputs[k].default_value = (1, 0.62, 0.3, 1); break
            if 'Emission Strength' in gb.inputs: gb.inputs['Emission Strength'].default_value = 1.6
        except Exception as e: log('oyna', e)
        for x, y, w, h, t in ROOMS:
            ld = bpy.data.lights.new('Deraza', 'POINT'); ld.energy = 450; ld.color = (1, 0.72, 0.42); lo = bpy.data.objects.new('Deraza', ld); lo.location = (x + w / 2, y + h / 2, 1.9); sc.collection.objects.link(lo)
        for x, y, z in LAMPS:
            ld = bpy.data.lights.new('Chiroq', 'POINT'); ld.energy = 60; ld.color = (1, 0.75, 0.45); ld.shadow_soft_size = 0.15; lo = bpy.data.objects.new('Chiroq', ld); lo.location = (x, y, z); sc.collection.objects.link(lo)
        for x in (PX1 - 0.3, PX2 + 0.3, 0.4, W - 0.4):
            ld = bpy.data.lights.new('Fasad', 'SPOT'); ld.energy = 120; ld.spot_size = math.radians(70); ld.color = (1, 0.78, 0.5); lo = bpy.data.objects.new('Fasad', ld); lo.location = (x, FY - 0.35, 0.3); lo.rotation_euler = (math.radians(-12), 0, 0); sc.collection.objects.link(lo)
except Exception as e:
    import traceback; traceback.print_exc(); log('joylash', e)
# ===== osmon =====
w = bpy.data.worlds.new('Osmon'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes.get('Background')
HDR = AP('hdri', 'kech.hdr' if SKY == 'kech' else 'kun.hdr')
SUNE = 3.2
if HDR:
    try:
        env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDR); tc_ = nt.nodes.new('ShaderNodeTexCoord'); mp_ = nt.nodes.new('ShaderNodeMapping')
        mp_.inputs['Rotation'].default_value = (0, 0, math.radians(${(+o.hdriRot || 0)}))
        nt.links.new(tc_.outputs['Generated'], mp_.inputs['Vector']); nt.links.new(mp_.outputs[0], env.inputs[0]); nt.links.new(env.outputs[0], bg.inputs[0])
        bg.inputs[1].default_value = 0.7 if SKY == 'kech' else 1.0; EXPO = 0.45 if SKY == 'kech' else -0.15; SUNE = 2.6 if SKY == 'kech' else 1.2
        log('hdri', os.path.basename(HDR))
    except Exception as e: log('hdri', e); HDR = None
if not HDR:
    try:
        sky = nt.nodes.new('ShaderNodeTexSky')
        for t in ('NISHITA', 'MULTIPLE_SCATTERING', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
            try: sky.sky_type = t; break
            except Exception: pass
        try: sky.sun_elevation = math.radians(6 if SKY == 'kech' else 32); sky.sun_rotation = math.radians(215)
        except Exception: pass
        nt.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.22
    except Exception:
        bg.inputs[0].default_value = (0.55, 0.72, 0.95, 1); bg.inputs[1].default_value = 1.0
    if SKY == 'kech': SUNE = 1.2; EXPO = 0.4
if SUNE > 0:
    sd = bpy.data.lights.new('Quyosh', 'SUN'); sd.energy = SUNE; sd.angle = math.radians(1.5)
    if SKY == 'kech': sd.color = (1, 0.5, 0.22)
    so = bpy.data.objects.new('Quyosh', sd); sc.collection.objects.link(so); so.rotation_euler = (math.radians(78 if SKY == 'kech' else 55), 0, math.radians(235 if SKY == 'kech' else 215))`;
  }

  function blenderScript(s, opt = {}) {
    const G3 = geometry(s), q = opt.quality === 'high' ? { spp: 256, rx: 1920, ry: 1080 } : opt.quality === 'draft' ? { spp: 24, rx: 960, ry: 540 } : { spp: 96, rx: 1600, ry: 900 };
    const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return '(' + c.map(v => v.toFixed(4)).join(', ') + ', 1)'; };
    const C = s.colors; const S = G3.size, cx = s.W / 2, cy = s.L / 2;
    const view = opt.view || 'front';
    if (view === 'cut') { const zc = 0.45 + Math.min(s.h, 3) * 0.55; G3.boxes = G3.boxes.filter(b => !b.cut && b.p[2] - b.s[2] / 2 < zc - 0.05).map(b => { const z1 = b.p[2] - b.s[2] / 2, z2 = Math.min(zc, b.p[2] + b.s[2] / 2); return { ...b, p: [b.p[0], b.p[1], r2((z1 + z2) / 2)], s: [b.s[0], b.s[1], r2(z2 - z1)] }; }); G3.meshes = []; G3.top = zc; }
    const fy = Math.min(0, ...G3.boxes.filter(b => b.p[2] - b.s[2] / 2 < 1).map(b => b.p[1] - b.s[1] / 2));
    const lin = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); };
    const tint = (h, k = 1.25) => '(' + lin(h).map(v => Math.min(1, v * k).toFixed(4)).join(', ') + ', 1)';
    const isRed = h => { const c = lin(h); return c[0] > c[1] * 1.6 && c[0] > 0.12; };
    const fd = G3.boxes.filter(b => b.m === 'door' && b.p[2] < 2.5 && b.p[1] < 0.5).sort((a, b) => a.p[1] - b.p[1])[0]; const ex = fd ? fd.p[0] : cx;
    const rooms0 = plan(s, 0).rooms.map(r => [r.x, r.y, r.w, r.h, r.type || 'room']);
    const cam = view === 'cut' ? [cx - S * 0.75, -S * 0.95, S * 1.25] : view === 'eye' ? [cx - S * 0.42, fy - S * 1.05, 1.65] : view === 'back' ? [cx + S * 1.15, s.L + S * 1.55, S * 0.55] : view === 'top' ? [cx - S * 0.9, cy - S * 1.1, S * 1.9] : view === 'side' ? [s.W + S * 1.7, cy - S * 0.6, S * 0.45] : [cx - S * 1.05, -S * 1.55, S * 0.55];
    return `# JARVIS LOYIHA — avtomatik yaratilgan Blender skripti (${s.name})
import bpy, math, sys, os, json, random, mathutils
random.seed(${(s.W * 13 + s.L * 7) | 0})
OUT = ${JSON.stringify(opt.out || '//render.png')}
BLEND = ${JSON.stringify(opt.blend || '')}
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def mat(name, col, rough=0.7, metal=0.0, glass=False, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = col
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if glass:
        for k in ('Transmission Weight', 'Transmission'):
            if k in b.inputs: b.inputs[k].default_value = 1.0
        b.inputs['Roughness'].default_value = 0.03
        if 'IOR' in b.inputs: b.inputs['IOR'].default_value = 1.45
    return m
M = {
 'wall': mat('Devor', ${hex(C.wall)}, 0.85), 'inwall': mat('Ichki devor', (0.9, 0.9, 0.88, 1), 0.9),
 'roof': mat('Tom', ${hex(C.roof)}, 0.55, 0.15), 'slab': mat('Karniz', ${hex(C.trim)}, 0.6), 'trim': mat('Bezak', ${hex(C.trim)}, 0.5),
 'base': mat('Sokol', ${hex(C.base)}, 0.9), 'floor': mat('Pol', (0.55, 0.42, 0.3, 1), 0.5), 'glass': mat('Oyna', (0.75, 0.85, 0.95, 1), glass=True),
 'door': mat('Eshik', ${hex(C.door)}, 0.45), 'column': mat('Ustun', ${hex(C.trim)}, 0.5),
 'ground': mat('Maysa', ${hex(C.ground)}, 0.95), 'trunk': mat('Tana', (0.18, 0.11, 0.06, 1), 0.9), 'leaf': mat('Barg', (0.09, 0.28, 0.06, 1), 0.8),
 'path': mat('Yo\\'lak', (0.55, 0.53, 0.5, 1), 0.85), 'drive': mat('Avtoyo\\'l', (0.42, 0.42, 0.4, 1), 0.85)}
def box(p, s, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p); o = bpy.context.active_object; o.scale = s; o.data.materials.append(M[m]); return o
def mesh(v, f, m, name='Tom'):
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.data.materials.append(M[m])
    if m == 'roof':
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        md = o.modifiers.new('Qalinlik', 'SOLIDIFY'); md.thickness = 0.12
    return o
B = ${JSON.stringify(G3.boxes.map(b => [b.p, b.s, b.m]))}
for p, s_, m in B: box(p, s_, m)
for ms in ${JSON.stringify(G3.meshes.map(x => [x.v, x.f, x.m]))}: mesh(ms[0], ms[1], ms[2])
# yer va yo'lak
bpy.ops.mesh.primitive_plane_add(size=${(S * 300).toFixed(1)}, location=(${cx}, ${cy}, 0)); g = bpy.context.active_object; g.data.materials.append(M['ground'])
box((${ex}, ${(fy - S * 0.6).toFixed(2)}, 0.02), (1.6, ${(S * 1.2).toFixed(2)}, 0.04), 'path')
box((${(ex < s.W / 2 ? s.W * 0.84 : s.W * 0.16).toFixed(2)}, ${(fy - 0.1 - S * 0.6).toFixed(2)}, 0.021), (3.6, ${(S * 1.2).toFixed(2)}, 0.04), 'drive')
${assetPy(s, G3, { view, fy, ex, cam, tint, isRed, rooms0, assets: opt.assets || '', lib: opt.lib || '', sky: opt.sky || 'kun' })}
# kamera
tgt = bpy.data.objects.new('Nishon', None); sc.collection.objects.link(tgt); tgt.location = (${cx}, ${view === 'eye' ? (s.L * 0.25).toFixed(2) : cy}, ${(view === 'eye' ? G3.top * 0.5 : view === 'cut' ? 0.6 : G3.top * 0.45).toFixed(2)})
cd = bpy.data.cameras.new('Kamera'); cd.lens = ${view === 'top' ? 30 : view === 'eye' ? 22 : 35}; co = bpy.data.objects.new('Kamera', cd); sc.collection.objects.link(co); co.location = (${cam.map(v => v.toFixed(2)).join(', ')})
tc = co.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'; sc.camera = co
# render sozlamalari
sc.render.engine = 'CYCLES'; sc.cycles.samples = ${q.spp}
try: sc.cycles.use_denoising = True
except Exception: pass
sc.render.resolution_x = ${q.rx}; sc.render.resolution_y = ${q.ry}; sc.render.resolution_percentage = 100
try:
    sc.view_settings.view_transform = 'AgX'
    for lk in ('AgX - Punchy', 'Punchy', 'AgX - Medium High Contrast'):
        try: sc.view_settings.look = lk; break
        except Exception: pass
    sc.view_settings.exposure = EXPO
except Exception:
    try: sc.view_settings.view_transform = 'Filmic'
    except Exception: pass
dev = 'CPU'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
        try:
            pr.compute_device_type = t; pr.get_devices()
            ds = [d for d in pr.devices if d.type == t]
            if ds:
                for d in pr.devices: d.use = (d.type == t)
                dev = 'GPU'; break
        except Exception: pass
except Exception: pass
sc.cycles.device = dev
print('JARVIS_DEVICE', dev)
sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = OUT
if BLEND:
    try: bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    except Exception as e: print('JARVIS_BLEND_ERR', e)
bpy.ops.render.render(write_still=True)
print('JARVIS_DONE', OUT)
`;
  }

  /* ---------- me'yoriy tekshiruv (taxminiy, ShNQ talablari asosida) ---------- */
  function norms(s) {
    const out = []; const add = (lv, t, fix) => out.push({ lv, t, fix: fix || '' });
    if (s.h < 2.5) add('bad', `Xona balandligi ${s.h} m — juda past (kamida 2,5 m)`, 'Qavat balandligini 2,8–3,0 m qiling');
    else if (s.h < 2.7) add('warn', `Xona balandligi ${s.h} m — issiq iqlim uchun 2,7–3,0 m tavsiya etiladi`, 'Qavat balandligini 2,8 m+ qiling'); else add('ok', `Xona balandligi ${s.h} m — me'yorda`);
    if (s.wallT < 0.38) add('warn', `Tashqi devor ${Math.round(s.wallT * 100)} sm — issiqlik saqlash uchun kamida 38 sm (yoki isitgich qatlami)`, 'Devor qalinligini 0,38–0,51 m qiling');
    if (s.levels.length > 3) add('bad', `${s.levels.length} qavat — seysmik hududda g'isht bino uchun ko'p`, '3 qavatgacha yoki karkas tizim');
    add('info', 'Sirdaryo viloyati seysmik hudud (7–8 ball): har qavat yopmasi ostida antiseysmik belbog\' (armopoyas), burchaklarda vertikal armatura, poydevor — monolit lenta. Konstruktiv hisob loyihachi tomonidan bajarilishi shart.');
    const MIN = { living: [16, 3.2], bed: [9, 2.4], kitchen: [8, 2.2], bath: [3, 1.5], hall: [3, 1.2], store: [1.5, 0.9], garage: [15, 3], room: [9, 2.4] };
    s.levels.forEach((lv, li) => { const P = plan(s, li);
      P.rooms.forEach((r, i) => { const a = r.w * r.h, m = MIN[r.type] || MIN.room, wmin = Math.min(r.w, r.h); const nm = `${s.levels.length > 1 ? (li + 1) + '-qavat, ' : ''}${r.name}`;
        if (a < m[0]) add('warn', `${nm}: ${a.toFixed(1)} m² — kamida ${m[0]} m² tavsiya etiladi`, `${r.name} maydonini oshiring`);
        if (wmin < m[1]) add('warn', `${nm}: eni ${wmin.toFixed(1)} m — kamida ${m[1]} m`, `${r.name} enini ${m[1]} m dan oshiring`);
        if (['living', 'bed', 'kitchen'].includes(r.type)) { const wa = P.segs.filter(g => g.ext).reduce((acc, g) => acc + g.ops.filter(o => o.kind === 'window' && winInRoom(g, o, r)).reduce((x, o) => x + o.w * 1.45, 0), 0);
          if (wa === 0) add('bad', `${nm}: derazasiz — yashash xonasida tabiiy yorug'lik bo'lishi shart`, `${r.name}ni tashqi devorga chiqaring`);
          else if (wa < a / 8) add('warn', `${nm}: deraza ${wa.toFixed(1)} m² — xona maydonining 1/8 qismidan kam`, 'Derazani kattalashtiring'); } }); });
    const fa = s.levels.reduce((a, lv) => a + lv.rooms.reduce((x, r) => x + r.w * r.h, 0), 0);
    add('info', `Joylashuv (shaharsozlik): uy ko'cha chizig'idan kamida 3–5 m ichkarida, qo'shni yer chegarasidan ≥ 3 m, qo'shni uydan (yong'in xavfsizligi) ≥ 6 m bo'lishi kerak; aniq talablar mahalliy arxitektura bo'limidan olinadi.`);
    const ratio = Math.max(s.W, s.L) / Math.min(s.W, s.L); if (ratio > 2.2) add('warn', `Fasad nisbati ${ratio.toFixed(1)}:1 — juda cho'ziq, estetik jihatdan bo'laklash tavsiya etiladi`, 'Ayvon yoki portik bilan fasadni bo\'ling');
    if (s.roof !== 'flat' && (s.pitch < 18 || s.pitch > 40)) add('warn', `Tom qiyaligi ${s.pitch}° — 20–35° oralig'i qor va yomg'ir uchun qulay`, 'Qiyalikni 25–30° qiling');
    if (!out.some(o => o.lv === 'bad' || o.lv === 'warn')) add('ok', 'Asosiy me\'yoriy talablar bajarilgan');
    const score = Math.max(0, 100 - out.filter(o => o.lv === 'bad').length * 20 - out.filter(o => o.lv === 'warn').length * 7);
    return { items: out, score, floorA: r2(fa) };
  }
  function winInRoom(g, o, r) { const horiz = g.y1 === g.y2; const c = (horiz ? g.x1 : g.y1) + o.a + o.w / 2; return horiz ? (Math.abs(g.y1 - r.y) < EPS || Math.abs(g.y1 - r.y - r.h) < EPS) && c > r.x && c < r.x + r.w : (Math.abs(g.x1 - r.x) < EPS || Math.abs(g.x1 - r.x - r.w) < EPS) && c > r.y && c < r.y + r.h; }
  // tayyor uslublar (AI ishlamasa ham variantlar chiqadi)
  const STYLES = {
    neoklassik: { label: 'Neoklassik hovli', patch: { style: 'neoklassik', roof: 'hip', pitch: 24, porch: null, colors: { wall: '#f3efe7', roof: '#2f343b', trim: '#ffffff', base: '#3d3d3f', door: '#26282c' } },
      ai: 'O\'zbekistondagi hashamatli neoklassik hovli uyi: oppoq silliq fasad, ionik kapitelli ustunlar va pilyastrlar, profilli karnizlar, deraza atrofida sandriklar va bezakli ramkalar, to\'q kulrang/qora metall cherepitsa tom, kirishda portik va frontoni, oq marmar zinapoyalar, kechqurun issiq yoritish (fasad chiroqlari, yo\'lak chiroqlari), sarv daraxtlari va kesilgan butalar, maysazor, toshli hovli, qimmat qora avtomobil' },
    zamonaviy: { label: 'Zamonaviy minimal', patch: { style: 'zamonaviy', roof: 'flat', porch: null, colors: { wall: '#e9e9e6', roof: '#3a3d42', trim: '#2b2b2b', base: '#5a5a5a', door: '#3b2a1e' } },
      ai: 'Zamonaviy minimalistik villa: tekis tom, katta panoram derazalar, oq va antrasit kulrang fasad, issiq yog\'och (lamel) panellar bilan bezak, yashirin LED yoritish, kanopi, beton yo\'laklar, zamonaviy landshaft dizayni, oltin soat yorug\'ligi' },
    milliy: { label: 'Milliy ayvonli', patch: { style: 'milliy', roof: 'gable', pitch: 26, porch: { side: 'S', depth: 2.6 }, colors: { wall: '#efe4d2', roof: '#9b3b2b', trim: '#ffffff', base: '#8c8378', door: '#6b4423' } },
      ai: 'O\'zbek milliy uslubidagi uy: keng ayvon, o\'ymakor yog\'och ustunlar va shiftlar, ganch naqshlar, iliq qum rangli g\'isht/suvoq fasad, qizil-jigarrang cherepitsa tom, hovlida so\'ri, uzumzor (tok), gulzor va mevali daraxtlar, quyoshli kun' },
    klassik: { label: 'Klassik qizil g\'isht', patch: { style: 'klassik', roof: 'gable', pitch: 32, porch: null, colors: { wall: '#9a4a36', roof: '#2e3a46', trim: '#f2efe9', base: '#4a4a4a', door: '#2c2c2c' } },
      ai: 'Klassik Yevropa uslubidagi uy: qizil pishiq g\'isht fasad, oq deraza ramkalari va karniz, to\'q ko\'k-kulrang cherepitsa tom, mo\'ri, kichik kirish soyaboni, toza maysazor va butalar, bulutli yumshoq yorug\'lik' }
  };

  /* ---------- AI uchun ko'rsatma ---------- */
  const AI_RULES = `Sen tajribali arxitektor-loyihachisan. Foydalanuvchi tavsifi bo'yicha uy rejasini JSON qilib qaytar. FAQAT JSON, boshqa matn yo'q.
Format: {"name":"loyiha nomi","W":uzunlik_m(sharq-g'arb),"L":kenglik_m(shimol-janub),"h":qavat_balandligi_m,"wallT":0.38,"inT":0.12,"roof":"gable|hip|flat","pitch":25,"style":"zamonaviy|milliy|neoklassik",
"colors":{"wall":"#hex","roof":"#hex","trim":"#hex","base":"#hex","door":"#hex"},"porch":null yoki {"side":"S","depth":2.5,"len":metr},
"levels":[{"rooms":[{"name":"Mehmonxona","x":0,"y":0,"w":5,"h":4.5}, ...]}, ...]}
QOIDALAR: koordinatalar metrda, (0,0) — old-chap burchak, y orqaga oshadi; old tomon (y=0) — janub, kirish shu yerda. Har qavatdagi xonalar W×L to'rtburchakni TO'LIQ, ustma-ust tushmasdan qoplasin (yig'indi maydoni = W*L). Xona o'lchamlari real: mehmonxona 18-30 m², yotoqxona 12-16, oshxona 10-15, hammom 4-6, dahliz/yo'lak 6-12. Dahliz yoki yo'lak boshqa xonalar bilan tutashsin. Xona nomlari o'zbekcha. Milliy uslubda — ayvon (porch) qo'sh. Oq fasad, ustunlar, karniz, qora tom, "hashamatli hovli" kabi so'rovlarda style = "neoklassik" (porch: null, roof: "hip"). Ikki qavatli bo'lsa levels ikkita.`;

  G.LOYIHA = { normalize, plan, geometry, quantities, planSVG, dxf, blenderScript, AI_RULES, PRICES, typeOf, autoLayout, norms, STYLES };
})(typeof window !== 'undefined' ? window : globalThis);
