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
  function blenderScript(s, opt = {}) {
    const G3 = geometry(s), q = opt.quality === 'high' ? { spp: 256, rx: 1920, ry: 1080 } : opt.quality === 'draft' ? { spp: 24, rx: 960, ry: 540 } : { spp: 96, rx: 1600, ry: 900 };
    const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return '(' + c.map(v => v.toFixed(4)).join(', ') + ', 1)'; };
    const C = s.colors; const S = G3.size, cx = s.W / 2, cy = s.L / 2;
    const view = opt.view || 'front';
    const cam = view === 'back' ? [cx + S * 1.15, s.L + S * 1.55, S * 0.55] : view === 'top' ? [cx - S * 0.9, cy - S * 1.1, S * 1.9] : view === 'side' ? [s.W + S * 1.7, cy - S * 0.6, S * 0.45] : [cx - S * 1.05, -S * 1.55, S * 0.55];
    return `# JARVIS LOYIHA — avtomatik yaratilgan Blender skripti (${s.name})
import bpy, math, sys, os
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
 'path': mat('Yo\\'lak', (0.55, 0.53, 0.5, 1), 0.85)}
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
box((${cx}, ${-S * 0.6}, 0.02), (1.6, ${(S * 1.2).toFixed(2)}, 0.04), 'path')
for t in ${JSON.stringify(G3.trees.map(t => [t.x, t.y, t.h, t.r]))}:
    x, y, h, r = t
    bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=h * 0.45, location=(x, y, h * 0.22)); bpy.context.active_object.data.materials.append(M['trunk'])
    for dx, dy, dz, k in ((0, 0, 0.62, 1.0), (0.45, 0.2, 0.5, 0.7), (-0.4, -0.25, 0.52, 0.72), (0.1, -0.4, 0.78, 0.65), (-0.2, 0.35, 0.8, 0.6)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r * k, location=(x + dx * r, y + dy * r, h * dz)); o = bpy.context.active_object; o.data.materials.append(M['leaf']); bpy.ops.object.shade_smooth()
# osmon va quyosh
w = bpy.data.worlds.new('Osmon'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes.get('Background')
try:
    sky = nt.nodes.new('ShaderNodeTexSky')
    for t in ('NISHITA', 'MULTIPLE_SCATTERING', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
        try: sky.sky_type = t; break
        except Exception: pass
    try: sky.sun_elevation = math.radians(32); sky.sun_rotation = math.radians(215)
    except Exception: pass
    nt.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.22
except Exception:
    bg.inputs[0].default_value = (0.55, 0.72, 0.95, 1); bg.inputs[1].default_value = 1.0
sd = bpy.data.lights.new('Quyosh', 'SUN'); sd.energy = 3.2; sd.angle = math.radians(1.5); so = bpy.data.objects.new('Quyosh', sd); sc.collection.objects.link(so); so.rotation_euler = (math.radians(55), 0, math.radians(215))
# kamera
tgt = bpy.data.objects.new('Nishon', None); sc.collection.objects.link(tgt); tgt.location = (${cx}, ${cy}, ${(G3.top * 0.45).toFixed(2)})
cd = bpy.data.cameras.new('Kamera'); cd.lens = ${view === 'top' ? 30 : 35}; co = bpy.data.objects.new('Kamera', cd); sc.collection.objects.link(co); co.location = (${cam.map(v => v.toFixed(2)).join(', ')})
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
    sc.view_settings.exposure = -0.35
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
