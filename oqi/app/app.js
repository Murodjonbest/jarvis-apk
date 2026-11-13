'use strict';
/* O'QI — hujjatni asl ko'rinishida ko'rsatib, ovoz chiqarib o'qiydi */
const EMBED = window.parent !== window;
const PAR = (() => { try { return EMBED && window.parent.JARVIS_MOBILE ? window.parent : null; } catch (e) { return null; } })();
const SS = PAR && PAR.speechSynthesis ? PAR.speechSynthesis : window.speechSynthesis;
const SU = PAR && PAR.SpeechSynthesisUtterance ? PAR.SpeechSynthesisUtterance : window.SpeechSynthesisUtterance;
const AUTO = new URLSearchParams(location.search).get('auto') === '1';
const VIEW = new URLSearchParams(location.search).get('view') === '1'; // Jarvis ichidagi ko'rinish (faqat asl ko'rinishni ko'rsatadi)
if (VIEW) document.documentElement.classList.add('view');
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let toastT; function toast(t, ms) { if (VIEW) return; const m = $('toast'); m.textContent = t; m.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => m.style.display = 'none', ms || 3000); }
const ST = { get(k, d) { try { const v = localStorage.getItem('oqi_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('oqi_' + k, JSON.stringify(v)); } catch (e) {} } };
const loading = on => $('loading').style.display = on ? 'grid' : 'none';

/* ============ EXE (mahalliy server) bilan aloqa ============ */
const K = new URLSearchParams(location.search).get('k') || '';
const NATIVE = { on: false,
  async init() { if (location.protocol !== 'http:') return; try { const r = await fetch('/api/ping?k=' + K); this.on = r.ok; } catch (e) {} if (!this.on) return;
    setInterval(() => fetch('/api/ping?k=' + K).catch(() => {}), 5000); this.poll(); },
  async poll() { for (;;) { try { const r = await fetch('/api/next?k=' + K); const j = await r.json(); if (j.path) await openPath(j.path); } catch (e) { await sleep(3000); } } },
  async pick() { const r = await fetch('/api/pick?k=' + K); const j = await r.json(); return j.path || ''; },
  async file(p) { const r = await fetch('/api/file?k=' + K + '&path=' + encodeURIComponent(p)); if (!r.ok) throw new Error(r.status === 404 ? 'Fayl topilmadi: ' + p : 'Faylni o\'qib bo\'lmadi'); return await r.blob(); }
};
async function openPath(p) { try { loading(true); const b = await NATIVE.file(p); await openFile(new File([b], p.split(/[\\/]/).pop()), p); if (AUTO && DOC && DOC.paras.length) setTimeout(() => play(), 400); } catch (e) { loading(false); toast('✕ ' + e.message, 6000); } }
async function pickFile() { if (NATIVE.on) { try { const p = await NATIVE.pick(); if (p) openPath(p); } catch (e) { $('fin').click(); } } else $('fin').click(); }

/* ============ JUMLALARGA AJRATISH ============ */
function splitBounds(t) {
  const cuts = [0]; const re = /[.!?…]+["»”')\]]*\s+(?=["«“(\-–—•]?[\p{Lu}\d])/gu; let m;
  while ((m = re.exec(t))) { const pre = t.slice(Math.max(0, m.index - 3), m.index);
    if (m[0].trim() === '.' && /(^|[\s.])\p{L}{1,2}$/u.test(pre) && !/^\d/.test(t.slice(m.index + m[0].length))) continue; // M.Y., t.y. kabi qisqartmalar
    cuts.push(m.index + m[0].length); }
  cuts.push(t.length);
  let seg = []; for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] > cuts[i]) seg.push([cuts[i], cuts[i + 1]]);
  const merged = []; for (const s of seg) { if (merged.length && t.slice(...merged[merged.length - 1]).trim().length < 22) merged[merged.length - 1][1] = s[1]; else merged.push(s.slice()); }
  const out = []; for (const [a, b] of merged) { let x = a; while (b - x > 320) { let k = t.lastIndexOf(', ', x + 280); if (k <= x + 80) k = t.lastIndexOf(' ', x + 280); if (k <= x + 40) k = x + 280; out.push([x, k + 1]); x = k + 1; } if (b > x) out.push([x, b]); }
  return out.filter(([a, b]) => t.slice(a, b).trim());
}
const BLOCKSEL = 'td,th,p,li,h1,h2,h3,h4,h5,h6,div';
function wrapBlock(block) {
  const nodes = []; const tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest('style,script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n, t = '', lastCell = null;
  while ((n = tw.nextNode())) { const cell = n.parentElement.closest(BLOCKSEL); if (lastCell && cell !== lastCell && t && !/\s$/.test(t)) t += ', '; lastCell = cell; nodes.push({ n, a: t.length }); t += n.nodeValue; }
  if (!t.trim()) return null;
  const segs = splitBounds(t); if (!segs.length) return null;
  const sents = segs.map(([a, b]) => ({ t: t.slice(a, b), els: [] }));
  for (const { n, a } of nodes) { const v = n.nodeValue, b = a + v.length; if (!v) continue; const fr = document.createDocumentFragment(); let any = false, pos = a;
    segs.forEach(([sa, sb], k) => { const x = Math.max(sa, a), y = Math.min(sb, b); if (y <= x) return; if (x > pos) fr.appendChild(document.createTextNode(v.slice(pos - a, x - a)));
      const sp = document.createElement('span'); sp.className = 's'; sp.textContent = v.slice(x - a, y - a); sp.dataset.k = k; sents[k].els.push(sp); fr.appendChild(sp); pos = y; any = true; });
    if (!any) continue; if (pos < b) fr.appendChild(document.createTextNode(v.slice(pos - a))); n.parentNode.replaceChild(fr, n); }
  return { t, sents };
}

/* ============ HUJJAT MODELI ============ */
let DOC = null; // {name,key,type,paras:[{t,el,sents,h,page}],pages:[{el,p,label}],marks:[]}
function newDoc(name, type, key) { DOC = { name, type, key, paras: [], pages: [], marks: [] }; }
function addBlock(el, o = {}) { const r = wrapBlock(el); if (!r) return; addPara(r.t, r.sents, el, o); }
function addPara(t, sents, el, o = {}) { const i = DOC.paras.length; sents.forEach((s, k) => s.els.forEach(e => { e.dataset.p = i; e.dataset.k = k; }));
  DOC.paras.push({ t, sents, el, h: !!o.h, page: o.page ?? (DOC.pages.length - 1), notes: !!o.notes }); }
function newPage(el, label) { DOC.pages.push({ el, p: DOC.paras.length, label }); }

/* ============ ZIP ============ */
async function unzip(bytes) {
  const z = await JSZip.loadAsync(bytes); const out = {};
  z.forEach((p, f) => { if (!f.dir) out[p] = { text: () => f.async('string'), bytes: () => f.async('uint8array') }; });
  return out;
}
const XP = s => new DOMParser().parseFromString(s, 'application/xml');
const kid = (el, n) => el ? [...el.children].find(c => c.nodeName === n) : null;
const kids = (el, n) => el ? [...el.children].filter(c => c.nodeName === n) : [];
const desc = (el, n) => el ? el.getElementsByTagName(n)[0] : null;
function joinPath(base, rel) { if (rel.startsWith('/')) return rel.slice(1); const p = base.split('/'); p.pop(); for (const s of rel.split('/')) { if (s === '..') p.pop(); else if (s !== '.') p.push(s); } return p.join('/'); }
async function rels(z, file) { const rp = joinPath(file, '_rels/' + file.split('/').pop() + '.rels'); const o = {}; if (!z[rp]) return o; const d = XP(await z[rp].text());
  for (const r of d.getElementsByTagName('Relationship')) o[r.getAttribute('Id')] = { t: r.getAttribute('TargetMode') === 'External' ? null : joinPath(file, r.getAttribute('Target')), type: r.getAttribute('Type') || '' }; return o; }

/* ============ PDF ============ */
let pdfLib = null;
function pdfjs() { if (!pdfLib) { pdfLib = window.pdfjsLib; pdfLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', location.href).href; } return pdfLib; }
async function buildPdf(bytes, host, unit = 'sahifa', notes = null) {
  const lib = pdfjs(); const pdf = await lib.getDocument({ data: bytes }).promise; const W = 880;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !e.target._done) { e.target._done = 1; e.target._render(); } }), { rootMargin: '600px' });
  let anyText = false;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 1 }); const H = W * vp.height / vp.width;
    const pg = document.createElement('div'); pg.className = 'pg'; pg.style.width = W + 'px'; pg.style.height = H + 'px';
    const cv = document.createElement('canvas'); const ov = document.createElement('div'); ov.className = 'ov'; pg.append(cv, ov); host.appendChild(pg);
    pg._render = async () => { const sc = W * Math.min(2.5, (devicePixelRatio || 1) * 1.6) / vp.width; const v2 = page.getViewport({ scale: sc }); cv.width = v2.width; cv.height = v2.height; await page.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise; };
    io.observe(pg); newPage(pg, i + '-' + unit);
    const tc = await page.getTextContent(); const U = lib.Util;
    const items = tc.items.filter(it => it.str !== undefined).map(it => { const tx = U.transform(vp.transform, it.transform); const h = Math.hypot(tx[2], tx[3]) || 10; const w = it.width * (vp.scale || 1); return { s: it.str, x: tx[4], y: tx[5] - h * 0.9, w, h: h * 1.15, eol: it.hasEOL, base: tx[5] }; });
    // qatorlar
    const lines = []; let cur = null;
    for (const it of items) { if (!it.s.trim() && !it.eol) { if (cur) cur.items.push(it); continue; }
      if (!cur || Math.abs(it.base - cur.base) > Math.max(2, it.h * 0.35)) { cur = { base: it.base, items: [], h: it.h }; lines.push(cur); }
      cur.items.push(it); if (it.eol) cur.eol = true; }
    lines.forEach(l => { l.items = l.items.filter(x => x.s); l.x0 = Math.min(...l.items.map(x => x.x)); l.x1 = Math.max(...l.items.map(x => x.x + x.w)); l.text = l.items.map(x => x.s).join('').trim(); });
    const ls = lines.filter(l => l.text); if (!ls.length) continue; anyText = true;
    const maxW = Math.max(...ls.map(l => l.x1 - l.x0));
    // xatboshilar
    let para = [];
    const flush = () => { if (!para.length) return; const pieces = []; let t = '';
      para.forEach((l, li) => { if (li && !/\s$/.test(t)) t += ' '; l.items.forEach((it, ii) => { if (ii && !/\s$/.test(t) && !/^\s/.test(it.s)) { const prev = l.items[ii - 1]; if (it.x - (prev.x + prev.w) > it.h * 0.18) t += ' '; } const a = t.length; t += it.s; pieces.push({ a, b: t.length, it }); }); });
      const segs = splitBounds(t); const sents = segs.map(([sa, sb]) => { const els = [];
        for (const pc of pieces) { const x = Math.max(sa, pc.a), y = Math.min(sb, pc.b); if (y <= x) continue; const L = pc.b - pc.a || 1, f0 = (x - pc.a) / L, f1 = (y - pc.a) / L;
          const d = document.createElement('div'); d.className = 'hb s'; const it = pc.it;
          d.style.cssText = `left:${(it.x + it.w * f0) / vp.width * 100}%;top:${it.y / vp.height * 100}%;width:${Math.max(0.3, it.w * (f1 - f0) / vp.width * 100)}%;height:${it.h / vp.height * 100}%`; ov.appendChild(d); els.push(d); }
        return { t: t.slice(sa, sb), els }; });
      addPara(t, sents, pg, { h: para[0].h > 1.35 * medH }); para = []; };
    const hs = ls.map(l => l.h).sort((a, b) => a - b); const medH = hs[hs.length >> 1];
    ls.forEach((l, k) => { const prev = ls[k - 1];
      if (prev) { const gap = l.base - prev.base; const pw = prev.x1 - prev.x0;
        if (gap > prev.h * 1.75 || gap < -2 || Math.abs(l.h - prev.h) > prev.h * 0.25 || (/[.!?:;]$/.test(prev.text) && pw < maxW * 0.9) || pw < maxW * 0.55 || /^([•\-–▪●○■◦►✓]|\d{1,2}[.)]\s)/.test(l.text)) flush(); }
      para.push(l); });
    flush();
    if (notes && notes[i - 1] && notes[i - 1].length) { const nb = document.createElement('div'); nb.className = 'notes'; nb.style.width = W + 'px'; nb.innerHTML = '<b>📝 Ma\'ruzachi izohlari</b>'; host.insertBefore(nb, pg.nextSibling); for (const t of notes[i - 1]) { const p = document.createElement('p'); p.textContent = t; nb.appendChild(p); addBlock(p, { notes: true }); } }
  }
  if (!anyText) toast('⚠ Bu PDF skaner qilingan (ichida matn yo\'q) — sahifalar ko\'rinadi, lekin o\'qib bo\'lmaydi', 9000);
}

/* ============ DOCX (asl ko'rinishda) ============ */
async function buildDocx(bytes, host) {
  const box = document.createElement('div'); host.appendChild(box);
  await docx.renderAsync(bytes, box, box, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, experimental: true, useBase64URL: true, ignoreWidth: false, ignoreHeight: false });
  const secs = [...box.querySelectorAll('section.docx')];
  secs.forEach((sec, i) => { newPage(sec, (i + 1) + '-sahifa');
    const blocks = [...sec.querySelectorAll('p,h1,h2,h3,h4,h5,h6,tr')].filter(p => !p.closest('header,footer') && !p.parentElement.closest('p') && !(p.nodeName === 'TR' ? p.parentElement.closest('tr') : p.closest('tr')));
    for (const b of blocks) { const cls = (b.className || '') + ' ' + (b.parentElement.className || ''); addBlock(b, { h: /heading|title|zagolov|sarlavha/i.test(cls) || /^H\d/.test(b.nodeName) }); } });
}

/* ============ PPTX (asl joylashuvda) ============ */
const EMU_PT = 12700;
async function buildPptx(z, host) {
  const presF = 'ppt/presentation.xml'; const pres = XP(await z[presF].text()); const pr = await rels(z, presF);
  const sz = desc(pres, 'p:sldSz'); const CX = +(sz?.getAttribute('cx') || 12192000), CY = +(sz?.getAttribute('cy') || 6858000); const S = 960 / CX; // px/EMU
  let order = [...pres.getElementsByTagName('p:sldId')].map(e => pr[e.getAttribute('r:id')]?.t).filter(f => f && z[f]);
  if (!order.length) order = Object.keys(z).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  // mavzu ranglari va shriftlari
  const theme = { clr: { dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6', accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47', hlink: '#0563c1' }, major: 'Calibri Light', minor: 'Calibri' };
  const thF = Object.keys(z).find(k => /^ppt\/theme\/theme\d+\.xml$/.test(k));
  if (thF) { const th = XP(await z[thF].text()); const cs = desc(th, 'a:clrScheme'); if (cs) for (const c of cs.children) { const n = c.nodeName.replace('a:', ''); const s = desc(c, 'a:srgbClr'), y = desc(c, 'a:sysClr'); theme.clr[n] = '#' + (s ? s.getAttribute('val') : y ? (y.getAttribute('lastClr') || '000000') : '000000'); }
    const mj = desc(desc(th, 'a:majorFont'), 'a:latin'), mn = desc(desc(th, 'a:minorFont'), 'a:latin'); if (mj) theme.major = mj.getAttribute('typeface'); if (mn) theme.minor = mn.getAttribute('typeface'); }
  const MAPC = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
  const color = el => { if (!el) return null; const s = desc(el, 'a:srgbClr'); if (s) return '#' + s.getAttribute('val'); const sc = desc(el, 'a:schemeClr'); if (sc) { const n = sc.getAttribute('val'); return theme.clr[MAPC[n] || n] || null; } const y = desc(el, 'a:sysClr'); if (y) return '#' + (y.getAttribute('lastClr') || '000000'); return null; };
  const fillOf = spPr => { if (!spPr) return null; const sf = kid(spPr, 'a:solidFill'); if (sf) return color(sf); const gf = kid(spPr, 'a:gradFill'); if (gf) { const gs = [...gf.getElementsByTagName('a:gs')].map(g => color(g)).filter(Boolean); if (gs.length > 1) return `linear-gradient(180deg,${gs.join(',')})`; return gs[0] || null; } return null; };
  const media = {}; const mediaUrl = async p => { if (!p || !z[p]) return null; if (!media[p]) { const ext = p.split('.').pop().toLowerCase(); media[p] = URL.createObjectURL(new Blob([await z[p].bytes()], { type: ext === 'svg' ? 'image/svg+xml' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext) })); } return media[p]; };
  const cache = {}; const load = async f => cache[f] || (cache[f] = { f, d: XP(await z[f].text()), r: await rels(z, f) });
  const phOf = sp => { const ph = desc(kid(sp, 'p:nvSpPr') || kid(sp, 'p:nvPicPr') || kid(sp, 'p:nvGraphicFramePr'), 'p:ph'); if (!ph) return null; return { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') }; };
  const same = (a, b) => { const g = t => ({ ctrTitle: 'title', subTitle: 'body', obj: 'body' }[t] || t); return g(a) === g(b); };
  const findPh = (doc, ph) => { if (!doc) return null; const sps = [...doc.d.getElementsByTagName('p:sp')]; return (ph.idx != null && sps.find(s => { const p = phOf(s); return p && p.idx === ph.idx; })) || sps.find(s => { const p = phOf(s); return p && same(p.type, ph.type); }) || null; };
  const xfrm = el => { const x = desc(kid(el, 'p:spPr') || kid(el, 'p:grpSpPr'), 'a:xfrm') || kid(el, 'p:xfrm'); if (!x) return null; const o = kid(x, 'a:off'), e = kid(x, 'a:ext'); if (!o || !e) return null; return { x: +o.getAttribute('x'), y: +o.getAttribute('y'), w: +e.getAttribute('cx'), h: +e.getAttribute('cy'), rot: +(x.getAttribute('rot') || 0) / 60000, chOff: kid(x, 'a:chOff'), chExt: kid(x, 'a:chExt') }; };
  const lvlProp = (lst, lvl, attr) => { if (!lst) return null; const l = kid(lst, `a:lvl${lvl + 1}pPr`); if (!l) return null; if (attr === 'algn') return l.getAttribute('algn'); const d = kid(l, 'a:defRPr'); if (!d) return null; if (attr === 'clr') return color(kid(d, 'a:solidFill')); if (attr === 'bu') return !kid(l, 'a:buNone') && (kid(l, 'a:buChar') || kid(l, 'a:buAutoNum')) ? 1 : (kid(l, 'a:buNone') ? 0 : null); return d.getAttribute(attr); };

  for (let si = 0; si < order.length; si++) {
    const sf = order[si]; const sl = await load(sf);
    const layF = Object.values(sl.r).find(r => /slideLayout/.test(r.type))?.t; const lay = layF && z[layF] ? await load(layF) : null;
    const masF = lay && Object.values(lay.r).find(r => /slideMaster/.test(r.type))?.t; const mas = masF && z[masF] ? await load(masF) : null;
    const lab = document.createElement('div'); lab.className = 'slnum'; lab.textContent = (si + 1) + '-SLAYD'; host.appendChild(lab);
    const box = document.createElement('div'); box.className = 'sl'; box.style.height = (CY * S) + 'px'; host.appendChild(box);
    newPage(box, (si + 1) + '-slayd');
    // fon
    for (const d of [sl, lay, mas]) { if (!d) continue; const bg = desc(d.d, 'p:bgPr'); if (!bg) continue; const f = fillOf(bg); if (f) { box.style.background = f; break; } const bl = desc(bg, 'a:blip'); if (bl) { const u = await mediaUrl(d.r[bl.getAttribute('r:embed')]?.t); if (u) { box.style.background = `url(${u}) center/100% 100%`; break; } } }
    const txStyles = mas && desc(mas.d, 'p:txStyles');
    const groups = []; // o'qish tartibi uchun
    const render = async (tree, doc, map, readable) => {
      for (const el of tree.children) {
        const n = el.nodeName;
        if (n === 'p:grpSp') { const g = xfrm(el); let m2 = map; if (g && g.chOff && g.chExt) { const cox = +g.chOff.getAttribute('x'), coy = +g.chOff.getAttribute('y'), cex = +g.chExt.getAttribute('cx') || 1, cey = +g.chExt.getAttribute('cy') || 1; const sx = g.w / cex, sy = g.h / cey; m2 = r => map({ x: g.x + (r.x - cox) * sx, y: g.y + (r.y - coy) * sy, w: r.w * sx, h: r.h * sy, rot: r.rot }); } await render(el, doc, m2, readable); continue; }
        if (!['p:sp', 'p:pic', 'p:graphicFrame', 'p:cxnSp'].includes(n)) continue;
        const ph = phOf(el); if (!readable && ph) continue; // maket/master joy-ushlagichlari ko'rsatilmaydi
        let r = xfrm(el); const lsp = ph ? findPh(lay, ph) : null, msp = ph ? findPh(mas, ph) : null;
        if (!r && lsp) r = xfrm(lsp); if (!r && msp) r = xfrm(msp); if (!r) continue; r = map(r);
        const pos = `left:${r.x * S}px;top:${r.y * S}px;width:${r.w * S}px;height:${r.h * S}px;${r.rot ? `transform:rotate(${r.rot}deg);` : ''}`;
        if (n === 'p:pic') { const bl = desc(el, 'a:blip'); const u = bl && await mediaUrl(doc.r[bl.getAttribute('r:embed')]?.t); if (u) { const im = document.createElement('img'); im.src = u; im.style.cssText = pos; box.appendChild(im); } continue; }
        if (n === 'p:cxnSp') { const ln = desc(kid(el, 'p:spPr'), 'a:ln'); const c = ln && color(kid(ln, 'a:solidFill')); if (c) { const d = document.createElement('div'); d.style.cssText = `position:absolute;${pos}border-top:${Math.max(1, (+ln.getAttribute('w') || 12700) * S)}px solid ${c};height:0`; box.appendChild(d); } continue; }
        const sh = document.createElement('div'); sh.className = 'sh'; sh.style.cssText = pos;
        const isTitle = ph && /title|ctrTitle/i.test(ph.type);
        const blocks = [];
        if (n === 'p:graphicFrame') { const tbl = desc(el, 'a:tbl'); if (!tbl) continue; const t = document.createElement('table'); const tcol = desc(desc(tbl, 'a:tblPr'), 'a:solidFill');
          for (const tr of kids(tbl, 'a:tr')) { const row = t.insertRow(); for (const tc of kids(tr, 'a:tc')) { if (tc.getAttribute('hMerge') || tc.getAttribute('vMerge')) continue; const td = row.insertCell(); if (tc.getAttribute('gridSpan')) td.colSpan = +tc.getAttribute('gridSpan'); if (tc.getAttribute('rowSpan')) td.rowSpan = +tc.getAttribute('rowSpan'); const f = fillOf(kid(tc, 'a:tcPr')); if (f) td.style.background = f;
            for (const ap of desc(tc, 'a:txBody') ? kids(desc(tc, 'a:txBody'), 'a:p') : []) { const p = paraEl(ap, null, [], 0, 1400); td.appendChild(p); blocks.push(p); } } }
          sh.appendChild(t); box.appendChild(sh); if (readable) groups.push({ y: r.y, x: r.x, title: false, blocks }); continue; }
        const spPr = kid(el, 'p:spPr'); const f = fillOf(spPr); if (f) sh.style.background = f;
        const ln = desc(spPr, 'a:ln'); if (ln && !kid(ln, 'a:noFill')) { const c = color(kid(ln, 'a:solidFill')); if (c) sh.style.border = `${Math.max(1, (+ln.getAttribute('w') || 12700) * S)}px solid ${c}`; }
        const geo = desc(spPr, 'a:prstGeom')?.getAttribute('prst'); if (geo === 'ellipse') sh.style.borderRadius = '50%'; else if (/roundRect/.test(geo || '')) sh.style.borderRadius = '10px';
        const bfill = desc(spPr, 'a:blip'); if (bfill) { const u = await mediaUrl(doc.r[bfill.getAttribute('r:embed')]?.t); if (u) sh.style.background = `url(${u}) center/cover`; }
        const tb = kid(el, 'p:txBody');
        if (tb) { const bp = kid(tb, 'a:bodyPr'); const anc = bp?.getAttribute('anchor') || (isTitle ? 'ctr' : 't'); sh.style.justifyContent = { t: 'flex-start', ctr: 'center', b: 'flex-end' }[anc] || 'flex-start';
          const ins = k => bp && bp.getAttribute(k) != null ? +bp.getAttribute(k) * S : (k === 'lIns' || k === 'rIns' ? 91440 : 45720) * S;
          sh.style.padding = `${ins('tIns')}px ${ins('rIns')}px ${ins('bIns')}px ${ins('lIns')}px`;
          if (bp?.getAttribute('vert') === 'vert270') sh.style.writingMode = 'sideways-lr';
          const fs = +(desc(bp, 'a:normAutofit')?.getAttribute('fontScale') || 100000) / 100000;
          const chain = [kid(tb, 'a:lstStyle'), lsp && desc(lsp, 'a:lstStyle'), msp && desc(msp, 'a:lstStyle'), txStyles && (isTitle ? kid(txStyles, 'p:titleStyle') : ph ? kid(txStyles, 'p:bodyStyle') : kid(txStyles, 'p:otherStyle'))].filter(Boolean);
          for (const ap of kids(tb, 'a:p')) { const p = paraEl(ap, ph, chain, isTitle, isTitle ? 4400 : ph ? 2800 : 1800, fs); sh.appendChild(p); if (p.textContent.trim()) blocks.push(p); } }
        box.appendChild(sh);
        if (readable && blocks.length) groups.push({ y: r.y, x: r.x, title: isTitle, blocks });
      }
    };
    function paraEl(ap, ph, chain, isTitle, defSz, fs = 1) {
      const p = document.createElement('p'); const pPr = kid(ap, 'a:pPr'); const lvl = +(pPr?.getAttribute('lvl') || 0);
      const inh = a => { for (const l of chain) { const v = lvlProp(l, lvl, a); if (v != null) return v; } return null; };
      const algn = pPr?.getAttribute('algn') || inh('algn'); if (algn) p.style.textAlign = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left';
      let bu = pPr && (kid(pPr, 'a:buNone') ? 0 : (kid(pPr, 'a:buChar') || kid(pPr, 'a:buAutoNum')) ? 1 : null); if (bu == null) bu = ph && !isTitle && /body|obj/.test(ph.type) ? inh('bu') ?? 1 : 0; if (bu) p.className = 'bul';
      if (lvl) p.style.marginLeft = (lvl * 28) + 'px';
      const sp = desc(pPr, 'a:spcBef'); const spv = sp && desc(sp, 'a:spcPts'); if (spv) p.style.marginTop = (+spv.getAttribute('val') / 100 * EMU_PT * S) + 'px'; else if (bu) p.style.marginTop = '0.25em';
      const lnS = desc(desc(pPr, 'a:lnSpc'), 'a:spcPct'); p.style.lineHeight = lnS ? (+lnS.getAttribute('val') / 100000 * 1.2) : 1.2;
      const dSz = +(inh('sz') || defSz); const dClr = inh('clr'); const dB = inh('b');
      let maxSz = 0;
      for (const r of ap.children) {
        if (r.nodeName === 'a:br') { p.appendChild(document.createElement('br')); continue; }
        if (r.nodeName !== 'a:r' && r.nodeName !== 'a:fld') continue; const t = kid(r, 'a:t'); if (!t) continue;
        const rp = kid(r, 'a:rPr'); const s = document.createElement('span'); s.textContent = t.textContent;
        const szv = +(rp?.getAttribute('sz') || dSz) * fs; maxSz = Math.max(maxSz, szv); s.style.fontSize = (szv / 100 * EMU_PT * S) + 'px';
        if ((rp?.getAttribute('b') ?? dB) === '1') s.style.fontWeight = '700'; if (rp?.getAttribute('i') === '1') s.style.fontStyle = 'italic'; if (rp?.getAttribute('u') && rp.getAttribute('u') !== 'none') s.style.textDecoration = 'underline';
        const c = color(kid(rp, 'a:solidFill')) || dClr || theme.clr.dk1; s.style.color = c;
        const lt = desc(rp, 'a:latin')?.getAttribute('typeface'); const fam = lt && !lt.startsWith('+') ? lt : (isTitle || lt === '+mj-lt' ? theme.major : theme.minor); s.style.fontFamily = `"${fam}","Segoe UI",Arial,sans-serif`;
        p.appendChild(s);
      }
      if (!maxSz) { const e = kid(ap, 'a:endParaRPr'); p.style.fontSize = ((+(e?.getAttribute('sz') || dSz) * fs) / 100 * EMU_PT * S) + 'px'; p.innerHTML = '&nbsp;'; }
      return p;
    }
    const id = r => r;
    if (mas && kid(sl.d.documentElement, 'p:cSld') && sl.d.documentElement.getAttribute('showMasterSp') !== '0') { const t = desc(mas.d, 'p:spTree'); if (t) await render(t, mas, id, false); }
    if (lay && sl.d.documentElement.getAttribute('showMasterSp') !== '0') { const t = desc(lay.d, 'p:spTree'); if (t) await render(t, lay, id, false); }
    await render(desc(sl.d, 'p:spTree'), sl, id, true);
    groups.sort((a, b) => (b.title - a.title) || (Math.round(a.y / (CY * 0.04)) - Math.round(b.y / (CY * 0.04))) || (a.x - b.x));
    for (const g of groups) for (const b of g.blocks) addBlock(b, { h: g.title });
    // izohlar
    const nf = Object.values(sl.r).find(r => /notesSlide/.test(r.type))?.t;
    if (nf && z[nf]) { const nd = XP(await z[nf].text()); const body = [...nd.getElementsByTagName('p:sp')].find(s => { const p = phOf(s); return p && p.type === 'body'; });
      const ps = body ? kids(kid(body, 'p:txBody'), 'a:p').map(a => [...a.getElementsByTagName('a:t')].map(t => t.textContent).join('')).filter(t => t.trim()) : [];
      if (ps.length) { const nb = document.createElement('div'); nb.className = 'notes'; nb.innerHTML = '<b>📝 Ma\'ruzachi izohlari</b>'; host.appendChild(nb); for (const t of ps) { const p = document.createElement('p'); p.textContent = t; nb.appendChild(p); addBlock(p, { notes: true }); } } }
    else lab.nextSibling.style.marginBottom = '30px';
  }
}

/* ============ XLSX / TXT ============ */
async function buildXlsx(z, host) {
  const ss = z['xl/sharedStrings.xml'] ? [...XP(await z['xl/sharedStrings.xml'].text()).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const wb = XP(await z['xl/workbook.xml'].text()); const wr = await rels(z, 'xl/workbook.xml');
  for (const sh of wb.getElementsByTagName('sheet')) { const f = wr[sh.getAttribute('r:id')]?.t; if (!f || !z[f]) continue; const d = XP(await z[f].text());
    const card = document.createElement('div'); card.className = 'sheet'; card.innerHTML = `<h3>📄 ${esc(sh.getAttribute('name'))}</h3>`; const t = document.createElement('table'); card.appendChild(t); host.appendChild(card); newPage(card, sh.getAttribute('name'));
    const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    for (const row of d.getElementsByTagName('row')) { const cells = []; for (const c of row.getElementsByTagName('c')) { const ty = c.getAttribute('t'); let v = desc(c, 'v')?.textContent ?? ''; if (ty === 's') v = ss[+v] ?? ''; else if (ty === 'inlineStr') v = [...c.getElementsByTagName('t')].map(x => x.textContent).join(''); else if (v && !isNaN(v) && v.includes('.')) v = String(Math.round(+v * 1e6) / 1e6).replace('.', ','); cells[col(c.getAttribute('r') || 'A1')] = v; }
      if (!cells.some(v => v)) continue; const tr = t.insertRow(); for (let i = 0; i < cells.length; i++) tr.insertCell().textContent = cells[i] ?? ''; addBlock(tr); } }
}
// Zaxira: chizib bo'lmasa — matnni oddiy ko'rinishda chiqarish
async function plainZip(z, host, kind) {
  const files = kind === 'docx' ? ['word/document.xml'] : Object.keys(z).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  for (let i = 0; i < files.length; i++) { if (!z[files[i]]) continue; const d = XP(await z[files[i]].text()); const card = document.createElement('div'); card.className = 'txt'; card.style.marginBottom = '22px'; host.appendChild(card); newPage(card, kind === 'pptx' ? (i + 1) + '-slayd' : 'Matn');
    for (const p of d.getElementsByTagName(kind === 'docx' ? 'w:p' : 'a:p')) { const t = [...p.getElementsByTagName(kind === 'docx' ? 'w:t' : 'a:t')].map(x => x.textContent).join(''); if (!t.trim()) continue; const el = document.createElement('p'); el.textContent = t; card.appendChild(el); addBlock(el); } }
  toast('⚠ Asl ko\'rinishda chizib bo\'lmadi — matn oddiy ko\'rinishda ochildi', 6000);
}
function buildText(text, host) { const card = document.createElement('div'); card.className = 'txt'; host.appendChild(card); newPage(card, 'Matn');
  text.split(/\r?\n\s*\r?\n|\r?\n/).map(s => s.trim()).filter(Boolean).forEach(s => { const p = document.createElement('p'); p.textContent = s; card.appendChild(p); addBlock(p); }); }

/* ============ ASL KO'RINISH: Word/PowerPoint orqali PDF ============ */
async function nativePdf(bytes, ext) {
  try { const JN = EMBED && window.parent.jarvisNative; if (JN && JN.docToPdf) { let b = ''; for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); const r = await JN.docToPdf({ b64: btoa(b), ext }); if (r && r.b64) { const bin = atob(r.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; } return null; } } catch (e) {}
  if (!NATIVE.on) return null;
  try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000); const r = await fetch('/api/topdf?k=' + K + '&ext=' + ext, { method: 'POST', body: bytes, signal: ctl.signal }); clearTimeout(t); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch (e) { return null; }
}
async function pptxNotes(z) { const out = []; try { const pres = XP(await z['ppt/presentation.xml'].text()); const pr = await rels(z, 'ppt/presentation.xml');
  for (const e of pres.getElementsByTagName('p:sldId')) { const f = pr[e.getAttribute('r:id')]?.t; if (!f || !z[f]) { out.push([]); continue; } const r = await rels(z, f); const nf = Object.values(r).find(x => /notesSlide/.test(x.type))?.t; if (!nf || !z[nf]) { out.push([]); continue; }
    const nd = XP(await z[nf].text()); const body = [...nd.getElementsByTagName('p:sp')].find(sp => { const ph = sp.getElementsByTagName('p:ph')[0]; return ph && ph.getAttribute('type') === 'body'; });
    out.push(body ? [...body.getElementsByTagName('a:p')].map(a => [...a.getElementsByTagName('a:t')].map(t => t.textContent).join('')).filter(t => t.trim()) : []); } } catch (e) {} return out; }
const canNative = () => NATIVE.on || (EMBED && (() => { try { return !!(window.parent.jarvisNative && window.parent.jarvisNative.docToPdf); } catch (e) { return false; } })());

/* ============ FAYL OCHISH ============ */
async function openFile(f, path) {
  const ext = f.name.split('.').pop().toLowerCase();
  if (['doc', 'ppt', 'xls'].includes(ext) && !(ext !== 'xls' && canNative())) { loading(false); toast(`Eski .${ext} formati. Faylni Word/PowerPoint'da ochib "Сохранить как" → .${ext}x qilib saqlang`, 9000); return; }
  stop(); loading(true);
  try {
    const host = $('doc'); host.innerHTML = ''; host.style.zoom = ZOOM; $('empty').style.display = 'none';
    newDoc(f.name, ext, f.name + ':' + f.size);
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (ext === 'pdf') await buildPdf(bytes, host);
    else if (/^(docx|doc|rtf|pptx|ppt)$/.test(ext) && canNative() && ST.get('exact', true) && await (async () => {
      $('loading').firstChild.textContent = '⏳ Asl ko\'rinish tayyorlanmoqda (' + (/^pp/.test(ext) ? 'PowerPoint' : 'Word') + ' orqali)…';
      const pdf = await nativePdf(bytes, ext); $('loading').firstChild.textContent = '⏳ Ochilmoqda…'; if (!pdf) return false;
      const notes = /^pp/.test(ext) ? await pptxNotes(await unzip(bytes)) : null; await buildPdf(pdf, host, /^pp/.test(ext) ? 'slayd' : 'sahifa', notes); return true; })()) { /* aniq ko'rinish */ }
    else if (ext === 'docx') { try { await buildDocx(bytes, host); } catch (e) { console.warn('docx-preview', e); host.innerHTML = ''; newDoc(f.name, ext, f.name + ':' + f.size); await plainZip(await unzip(bytes), host, 'docx'); } }
    else if (ext === 'pptx') { try { await buildPptx(await unzip(bytes), host); } catch (e) { console.warn('pptx', e); host.innerHTML = ''; newDoc(f.name, ext, f.name + ':' + f.size); await plainZip(await unzip(bytes), host, 'pptx'); } }
    else if (ext === 'xlsx') await buildXlsx(await unzip(bytes), host);
    else buildText(new TextDecoder().decode(bytes), host);
    $('fname').innerHTML = `<b>${esc(f.name)}</b><small>${DOC.pages.length} ${ext === 'pptx' ? 'slayd' : 'sahifa'} · ${DOC.paras.length} xatboshi</small>`;
    document.title = f.name + ' — O\'QI'; buildOutline();
    if (innerWidth < 900) { const w = host.scrollWidth / (ZOOM || 1) || 900; ZOOM = Math.max(0.3, Math.min(1, (innerWidth - 20) / w)); host.style.zoom = ZOOM; $('zv').textContent = Math.round(ZOOM * 100) + '%'; }
    if (path && !path.startsWith('mem:')) { const rc = ST.get('recent', []).filter(r => r.path !== path); rc.unshift({ path, name: f.name, t: Date.now() }); ST.set('recent', rc.slice(0, 8)); }
    const sp = ST.get('pos:' + DOC.key, null); POS.p = sp && sp.p < DOC.paras.length ? sp.p : 0; POS.s = sp ? sp.s || 0 : 0; skipNotes(1); mark(false); updProg();
    loading(false);
    if (!DOC.paras.length) toast('⚠ Hujjatda o\'qiladigan matn topilmadi', 6000);
    else if (POS.p > 0) { toast('↺ Oxirgi to\'xtagan joyingiz belgilandi — ▶ ni bosing', 4000); setTimeout(() => cur()?.sents[POS.s]?.els[0]?.scrollIntoView({ block: 'center' }), 300); }
    else toast('✓ ' + f.name + ' ochildi — ▶ ni bosing yoki "o\'qi" deng', 3500);
  } catch (e) { console.error(e); loading(false); toast('✕ Faylni ochib bo\'lmadi: ' + (e.message || e), 8000); }
}
function buildOutline() { const o = $('outline'); o.innerHTML = ''; if (!DOC) return;
  DOC.pages.forEach((pg, i) => { const a = document.createElement('a'); const first = DOC.paras.slice(pg.p).find(p => p.page === i && !p.notes);
    a.textContent = pg.label + (first && DOC.type === 'pptx' ? ' · ' + first.t.slice(0, 40) : ''); a.onclick = () => { pg.el.scrollIntoView({ block: 'start' }); if (first) { POS.p = DOC.paras.indexOf(first); POS.s = 0; if (PLAY.on) play(); else { mark(false); updProg(); } } }; a.dataset.pg = i; o.appendChild(a);
    if (DOC.type !== 'pptx') DOC.paras.filter(p => p.page === i && p.h && p.t.length < 90).slice(0, 12).forEach(p => { const b = document.createElement('a'); b.className = 'sub'; b.textContent = p.t; b.onclick = () => { const k = DOC.paras.indexOf(p); if (PLAY.on) play(k, 0); else { POS.p = k; POS.s = 0; mark(); updProg(); } }; o.appendChild(b); }); });
  if (DOC.pages.length > 1) $('side').classList.remove('hide'); }
function renderRecent() { const rc = ST.get('recent', []); const el = $('recent'); if (!NATIVE.on || !rc.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<h4>Oxirgi fayllar</h4>' + rc.map((r, i) => `<a data-i="${i}"><span>${/\.pdf$/i.test(r.name) ? '📕' : /\.pptx$/i.test(r.name) ? '📙' : /\.xlsx$/i.test(r.name) ? '📗' : '📘'}</span><span>${esc(r.name)}</span><small>${new Date(r.t).toLocaleDateString('uz')}</small></a>`).join('');
  el.querySelectorAll('a').forEach(a => a.onclick = () => openPath(rc[+a.dataset.i].path)); }

/* ============ O'ZBEKCHA TALAFFUZ ============ */
const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'gʻ', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'oʻ', ф: 'f', х: 'x', ҳ: 'h', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: 'ʼ', ь: '', ы: 'i', э: 'e', ю: 'yu', я: 'ya' };
function cyr2lat(t) { return t.replace(/[Ѐ-ӿ]+/g, w => { let o = ''; for (let i = 0; i < w.length; i++) { const c = w[i], lo = c.toLowerCase(), up = c !== lo; let r = CYR[lo]; if (r == null) { o += c; continue; }
  if (lo === 'е' && (i === 0 || /[аеёиоуўэюяъь]/i.test(w[i - 1]))) r = 'ye'; if (lo === 'ц' && i > 0 && /[аеиоуўэ]/i.test(w[i - 1])) r = 'ts';
  if (up) r = (w.length > 1 && w === w.toUpperCase()) ? r.toUpperCase() : r.charAt(0).toUpperCase() + r.slice(1); o += r; } return o; }); }
function isRuText(t) { if (!/[Ѐ-ӿ]/.test(t) || /[ўқғҳЎҚҒҲ]/.test(t)) return false; const w = t.toLowerCase().match(/[а-яё]+/g) || []; let uz = 0, ru = 0;
  for (const x of w) { if (/^(ва|билан|учун|бўйича|буйича|ушбу|бу|шу|ҳам|хам|йил|йилда|сони|тумани|вилояти|бўлган|булган|қилиш|килиш|этиш|тўғрисида|тугрисида|мумкин|керак|эмас|бор|йўқ|йук|туман|вилоят|шаҳар|шахар|бўйича|оид|асосан|асосида|кўра|кура)$/.test(x)) uz += 2;
    else if (x.length > 3 && /(лар|ларни|ларга|ларда|нинг|ни|га|да|дан|ган|иш|лик|чи|ди|миз|сиз|мокда|ади|ини|ига|ида|идан|ланган|лаш)$/.test(x)) uz++;
    if (/^(и|в|на|по|с|для|что|это|не|от|к|из|за|при|как|или|также|года|был|была|были|его|её|их|они|мы|вы|он|она)$/.test(x)) ru += 2; else if (/(ого|ому|ыми|ость|ция|ние|ться|ется|ются|ая|ый|ий|ое|ые|ых|ует|ями|ами)$/.test(x)) ru++; if (/[ыщ]/.test(x)) ru++; }
  return ru > uz; }
// Kirillcha "қ,ў,ғ,ҳ" o'rniga "к,у,г,х" bilan yozilgan so'zlarni tuzatish (kurilish → qurilish)
const FIX_PRE = [['kuril', 'quril'], ['kishlok', 'qishloq'], ['kishlog', 'qishlogʻ'], ['kushimch', 'qoʻshimch'], ['kushil', 'qoʻshil'], ['kushni', 'qoʻshni'], ['xujjat', 'hujjat'], ['xisob', 'hisob'], ['xakid', 'haqid'], ['xakikat', 'haqiqat'], ['xokim', 'hokim'], ['xudud', 'hudud'], ['xozir', 'hozir'], ['xamma', 'hamma'], ['xolat', 'holat'], ['xajm', 'hajm'], ['xukumat', 'hukumat'], ['xukuk', 'huquq'], ['xuquq', 'huquq'], ['buyich', 'boʻyich'], ['bulga', 'boʻlga'], ['bulib', 'boʻlib'], ['bulsa', 'boʻlsa'], ['bulad', 'boʻlad'], ['bulma', 'boʻlma'], ['bulish', 'boʻlish'], ['bulim', 'boʻlim'], ['urnat', 'oʻrnat'], ['uzbek', 'oʻzbek'], ['kursat', 'koʻrsat'], ['kurib', 'koʻrib'], ['kurik', 'koʻrik'], ['tugri', 'toʻgʻri'], ['tulov', 'toʻlov'], ['tuxtat', 'toʻxtat'], ['uzgar', 'oʻzgar'], ['ukuv', 'oʻquv'], ['ukit', 'oʻqit'], ['kiymat', 'qiymat'], ['kabul', 'qabul'], ['karor', 'qaror'], ['kism', 'qism'], ['kator', 'qator'], ['kayta', 'qayta'], ['kanday', 'qanday'], ['kancha', 'qancha'], ['kaysi', 'qaysi'], ['kuprik', 'koʻprik'], ['gisht', 'gʻisht'], ['ogir', 'ogʻir'], ['malumot', 'maʼlumot'], ['talim', 'taʼlim'], ['yukori', 'yuqori'], ['kuyidagi', 'quyidagi'], ['kuyil', 'qoʻyil'], ['kurulish', 'qurilish'], ['kurulma', 'qurilma'], ['tekshir', 'tekshir'], ['shartnom', 'shartnom'], ['kushimcha', 'qoʻshimcha'], ['xarajat', 'xarajat'], ['xizmat', 'xizmat'], ['mablag', 'mablagʻ'], ['bogcha', 'bogʻcha'], ['tugris', 'toʻgʻris'], ['kilin', 'qilin'], ['kilish', 'qilish'], ['kilgan', 'qilgan'], ['kilib', 'qilib'], ['kilsin', 'qilsin'], ['kilmoq', 'qilmoq'], ['kiling', 'qiling']];
const FIX_WORD = { xam: 'ham', xar: 'har', kup: 'koʻp', yul: 'yoʻl', kildi: 'qildi', kiyin: 'keyin', yuk: 'yoʻq', xa: 'ha', kul: 'qoʻl', kum: 'qum', tuman: 'tuman', bulsa: 'boʻlsa' };
const ABBR = { 'MFY': 'mahalla fuqarolar yigʻini', 'MTT': 'maktabgacha taʼlim tashkiloti', 'QQS': 'qoʻshilgan qiymat soligʻi', 'VMQ': 'Vazirlar Mahkamasining qarori', 'VM': 'Vazirlar Mahkamasi', 'PQ': 'Prezident qarori', 'PF': 'Prezident farmoni', 'OʻRQ': 'Oʻzbekiston Respublikasi qonuni', 'MChJ': 'masʼuliyati cheklangan jamiyat', 'MCHJ': 'masʼuliyati cheklangan jamiyat', 'AJ': 'aksiyadorlik jamiyati', 'XK': 'xususiy korxona', 'OShP': 'oilaviy shifokorlik punkti', 'OSHP': 'oilaviy shifokorlik punkti', 'DMNI': 'davlat moliyaviy nazorati inspeksiyasi', 'mln': 'million', 'mlrd': 'milliard', 'tum.': 'tumani', 'vil.': 'viloyati', 'sh.': 'shahri', 'h.k.': 'hokazo', 'b.': 'band', 'm.': 'modda' };
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
let USERDICT = [];
function loadDict() { USERDICT = ($('dict').value || '').split('\n').map(l => l.split('=')).filter(a => a.length >= 2 && a[0].trim()).map(([a, ...b]) => [a.trim(), b.join('=').trim()]); }
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function applyDict(t, list) { for (const [a, b] of list) t = t.replace(new RegExp('(^|[^\\p{L}])' + reEsc(a) + '(?![\\p{L}])', 'gu'), '$1' + b); return t; }
function normUz(t) {
  t = t.replace(/[•▪●○■◦►✓✔]/g, ' ').replace(/\u00AD/g, '').replace(/(\p{L})-\s+(\p{Ll})/gu, '$1$2');
  t = applyDict(t, USERDICT);
  t = t.replace(/([oOgG])['`’‘ʼ´]/g, '$1ʻ').replace(/(\p{L})['`’‘´](\p{L})/gu, '$1ʼ$2');
  if (/[Ѐ-ӿ]/.test(t) && $('cTr').checked) t = cyr2lat(t);
  // so'zlarni tuzatish
  t = t.replace(/[\p{L}ʻʼ]+/gu, w => { const lo = w.toLowerCase(); let r = FIX_WORD[lo]; if (!r) { const f = FIX_PRE.find(([a]) => lo.startsWith(a)); if (f) r = f[1] + lo.slice(f[0].length); } if (!r || r === lo) return w; return w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? r[0].toUpperCase() + r.slice(1) : r; });
  // sanalar, sonlar, birliklar
  t = t.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})(\s*-?\s*y(?:il)?\.?(?![\p{L}]))?/gu, (m, d, mo, y) => +mo >= 1 && +mo <= 12 ? `${y}-yil ${+d}-${MONTHS[+mo - 1]}` : m);
  t = t.replace(/(\d{4})\s*-?\s*y\.(?=\s|,|$)/g, '$1-yil').replace(/(\d{4})\s+yil/g, '$1-yil');
  t = t.replace(/\d{1,3}(?:[   ]\d{3})+(?!\d)/g, m => m.replace(/[   ]/g, ''));
  t = t.replace(/(\d)[,.](\d)/g, '$1 butun $2');
  t = t.replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 dan $2 gacha').replace(/\bMPa\b/g, 'megapaskal').replace(/\bkVt\b/g, 'kilovatt').replace(/\bkW\b/g, 'kilovatt');
  t = t.replace(/kg\s*\/\s*m[³3]/g, 'kilogramm kub metr').replace(/\bm[²2](?![\p{L}\d])/gu, 'kvadrat metr').replace(/\bm[³3](?![\p{L}\d])/gu, 'kub metr').replace(/(\d)\s*km\b/g, '$1 kilometr').replace(/(\d)\s*sm\b/g, '$1 santimetr').replace(/(\d)\s*mm\b/g, '$1 millimetr').replace(/(\d)\s*kg\b/g, '$1 kilogramm').replace(/(\d)\s*m\b/g, '$1 metr').replace(/(\d)\s*t\b/g, '$1 tonna');
  t = t.replace(/\s*%/g, ' foiz').replace(/№\s*/g, 'raqam ').replace(/(\d)\s*-\s*son/g, '$1-son').replace(/\s[–—-]\s/g, ', ');
  if ($('cAbbr').checked) t = applyDict(t, Object.entries(ABBR));
  return t.replace(/\s+/g, ' ').trim();
}

/* ============ OVOZLAR ============ */
let VOICES = [];
const isNat = v => /natural|online|neural/i.test(v.name);
function uzVoices() { return VOICES.filter(v => /^uz/i.test(v.lang)).sort((a, b) => isNat(b) - isNat(a)); }
function pickVoices() {
  VOICES = SS.getVoices(); const sel = $('sVoice'); const saved = ST.get('voice', '');
  const score = v => (/^uz/i.test(v.lang) ? 100 : /^ru/i.test(v.lang) ? 40 : /^en/i.test(v.lang) ? 10 : 0) + (isNat(v) ? 50 : 0);
  const list = [...VOICES].sort((a, b) => score(b) - score(a));
  sel.innerHTML = list.map(v => `<option value="${esc(v.name)}">${esc(v.name.replace(/^Microsoft /, '').replace(/ - .*/, ''))} (${v.lang})${isNat(v) ? ' ★' : ''}</option>`).join('') || '<option>(ovoz topilmadi)</option>';
  if (saved && list.some(v => v.name === saved)) sel.value = saved; else if (list[0]) sel.value = list[0].name;
  const uz = uzVoices();
  $('vchips').innerHTML = uz.filter(isNat).slice(0, 4).map(v => { const nm = (v.name.match(/Microsoft (\w+)/) || [, v.name])[1]; return `<button data-v="${esc(v.name)}" class="${sel.value === v.name ? 'on' : ''}">${/sardor/i.test(nm) ? '👨' : '👩'} ${esc(nm)}<small>tabiiy o'zbek ovozi</small></button>`; }).join('') || '<div class="hint">Tabiiy o\'zbek ovozlari topilmadi</div>';
  $('vchips').querySelectorAll('button').forEach(b => b.onclick = () => setVoice(b.dataset.v));
  $('vwarn').innerHTML = uz.some(isNat) ? '' : `<div class="warn">⚠ <b>Tabiiy o'zbek ovozi (Madina, Sardor) topilmadi.</b> Ular Microsoft Edge orqali bepul ishlaydi va <b>internet</b> kerak. Internetni tekshiring va dasturni qayta oching.${VOICES.length ? '' : ' Hozir umuman ovoz yo\'q.'}</div>`;
}
function setVoice(name) { $('sVoice').value = name; ST.set('voice', name); pickVoices(); if (PLAY.on) play(POS.p, POS.s); }
function mainVoice() { return VOICES.find(v => v.name === $('sVoice').value) || uzVoices()[0] || VOICES[0]; }
function voiceFor(text) { const m = mainVoice(); if ($('cRu').checked && isRuText(text) && !/^ru/i.test(m?.lang || '')) { const ru = VOICES.filter(v => /^ru/i.test(v.lang)).sort((a, b) => isNat(b) - isNat(a))[0]; if (ru) return ru; } return m; }
function lat2cyrRu(t) { // o'zbek ovozi bo'lmasa — rus ovozi o'zbekchani to'g'ri talaffuz qilishi uchun
  const M = [["oʻ", 'у'], ["gʻ", 'г'], ['sh', 'ш'], ['ch', 'ч'], ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'], ['ye', 'е'], ['ts', 'ц'], ['a', 'а'], ['b', 'б'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'ж'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['x', 'х'], ['y', 'й'], ['z', 'з'], ['ʼ', '']];
  return t.replace(/[A-Za-zʻʼ]+/g, w => { const lo = w.toLowerCase(); let o = '', i = 0; while (i < lo.length) { if (i === 0 && lo[0] === 'e') { o += 'э'; i++; continue; } const m = M.find(([a]) => lo.startsWith(a, i)); if (m) { o += m[1]; i += m[0].length; } else { o += lo[i]; i++; } }
    return w[0] !== w[0].toLowerCase() ? (w.length > 1 && w === w.toUpperCase() ? o.toUpperCase() : o[0].toUpperCase() + o.slice(1)) : o; }); }
function prep(text, v) { if (v && /^ru/i.test(v.lang)) { if (isRuText(text) || !/[A-Za-z]/.test(text)) return applyDict(text, USERDICT).replace(/\s+/g, ' ').trim(); return lat2cyrRu(normUz(text)); }
  if (v && !/^uz/i.test(v.lang) && /^(kk|ky|tg|uk|be|bg)/i.test(v.lang)) return lat2cyrRu(normUz(text)); return normUz(text); }

/* ============ O'QISH ============ */
const POS = { p: 0, s: 0 }; const PLAY = { on: false, paused: false }; let GEN = 0; let RATE = ST.get('rate', 1), VOL = ST.get('vol', 1);
const cur = () => DOC && DOC.paras[POS.p];
function readable(i) { const p = DOC.paras[i]; return p && p.sents.length && (!p.notes || $('cNotes').checked); }
function skipNotes(dir) { if (!DOC) return; while (POS.p >= 0 && POS.p < DOC.paras.length && !readable(POS.p)) { POS.p += dir; POS.s = 0; } POS.p = Math.max(0, Math.min(DOC.paras.length - 1, POS.p)); }
function mark(scroll = true) { document.querySelectorAll('.s.cur').forEach(x => x.classList.remove('cur')); const p = cur(); if (!p) return; const s = p.sents[POS.s] || p.sents[0]; if (!s) return; s.els.forEach(e => e.classList.add('cur'));
  $('now').textContent = s.t.trim(); $('now').classList.remove('mut');
  if (scroll && s.els[0]) { const r = s.els[0].getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight - 200) s.els[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  document.querySelectorAll('#outline a.on').forEach(a => a.classList.remove('on')); const oa = document.querySelector(`#outline a[data-pg="${p.page}"]`); if (oa) oa.classList.add('on'); }
function updProg() { if (!DOC) return; const n = DOC.paras.length; $('prog').firstChild.style.width = (n > 1 ? POS.p / (n - 1) * 100 : 0) + '%'; const p = cur(); const pg = p ? p.page + 1 : 1;
  $('ptxt').textContent = `${pg}/${DOC.pages.length} ${DOC.type === 'pptx' ? 'slayd' : 'sahifa'}`; }
function setBtn() { $('bPlay').textContent = PLAY.on && !PLAY.paused ? '⏸' : '▶'; }
function savePos() { if (DOC) ST.set('pos:' + DOC.key, { p: POS.p, s: POS.s }); }
function nextPos(pi, s) { while (DOC && pi < DOC.paras.length) { if (readable(pi) && s < DOC.paras[pi].sents.length) return [pi, s]; pi++; s = 0; } return null; }
function makeUtt(g, pi, s0) {
  const para = DOC.paras[pi]; const v = voiceFor(para.t); let txt = ''; const offs = []; let k = s0;
  for (; k < para.sents.length; k++) { if (txt.length > 700 && k > s0) break; offs.push([txt.length, k]); const pt = prep(para.sents[k].t, v); txt += pt + (/[.!?…:;]$/.test(pt) ? ' ' : (k === para.sents.length - 1 ? '. ' : ' ')); }
  const u = new SU(txt.trim() || '.'); if (v) { u.voice = v; u.lang = v.lang; } u.rate = RATE; u.volume = VOL; u._next = null;
  u.onstart = () => { if (g !== GEN) return; POS.p = pi; POS.s = s0; mark(); updProg(); savePos(); if (!u._next) u._next = queue(g, nextPos(pi, k)); };
  u.onboundary = e => { if (g !== GEN || e.name === 'sentence' && false) return; let kk = s0; for (const [o, x] of offs) if (e.charIndex >= o) kk = x; if (kk !== POS.s || POS.p !== pi) { POS.p = pi; POS.s = kk; mark(); savePos(); } };
  u.onend = () => { if (g !== GEN) return; if (!u._next) finish(); };
  u.onerror = e => { if (g !== GEN || /interrupted|canceled/.test(e.error)) return; console.warn('tts', e.error); if (!u._next) { u._next = queue(g, nextPos(pi, k)); if (!u._next) finish(); } };
  return u;
}
function queue(g, pos) { if (!pos || g !== GEN) return null; const u = makeUtt(g, pos[0], pos[1]); SS.speak(u); return u; }
function play(pi, s) {
  if (!DOC || !DOC.paras.length) { pickFile(); return; } loadDict();
  SS.cancel(); const g = ++GEN; PLAY.on = true; PLAY.paused = false; setBtn(); lastSpeak = Date.now();
  if (pi != null) { POS.p = pi; POS.s = s || 0; } const np = nextPos(POS.p, POS.s); if (!np) { finish(); return; }
  [POS.p, POS.s] = np; mark(); updProg();
  setTimeout(() => { if (g === GEN) queue(g, np); }, 60);
}
function finish() { PLAY.on = false; PLAY.paused = false; setBtn(); if (DOC && !nextPos(POS.p + 1, 0)) { toast('✓ Hujjat oxirigacha o\'qildi'); ST.set('pos:' + DOC.key, { p: 0, s: 0 }); } }
function pause() { if (!PLAY.on) return; PLAY.paused = true; SS.pause(); setBtn(); }
function resume() { if (!PLAY.on) return play(); PLAY.paused = false; setBtn(); SS.resume(); const g = GEN; setTimeout(() => { if (g === GEN && PLAY.on && !PLAY.paused && !SS.speaking) play(POS.p, POS.s); }, 600); }
function stop() { GEN++; PLAY.on = false; PLAY.paused = false; try { SS.cancel(); } catch (e) {} setBtn(); }
function toggle() { if (!PLAY.on) play(); else if (PLAY.paused) resume(); else pause(); }
let lastSpeak = 0; setInterval(() => { if (PLAY.on && !PLAY.paused) { if (SS.speaking || SS.pending) lastSpeak = Date.now(); else if (Date.now() - lastSpeak > 4000) { lastSpeak = Date.now(); play(POS.p, POS.s); } } }, 1000);
function jump(d) { if (!DOC) return; let p = POS.p + d; while (p >= 0 && p < DOC.paras.length && !readable(p)) p += d; p = Math.max(0, Math.min(DOC.paras.length - 1, p)); if (PLAY.on) play(p, 0); else { POS.p = p; POS.s = 0; mark(); updProg(); } }
function gotoPage(n) { if (!DOC) return false; const pg = DOC.pages[n - 1]; if (!pg) return false; pg.el.scrollIntoView({ block: 'start' }); const np = nextPos(pg.p, 0); if (np) { if (PLAY.on) play(np[0], 0); else { [POS.p, POS.s] = np; mark(false); updProg(); } } return true; }
function pageJump(d) { const p = cur(); if (!p) return; gotoPage(p.page + 1 + d); }
function setRate(r) { RATE = Math.max(0.5, Math.min(2, Math.round(r * 20) / 20)); ST.set('rate', RATE); $('sRate').value = RATE; $('vRate').textContent = RATE.toFixed(2).replace(/0$/, '') + '×';
  document.querySelectorAll('#rateChips button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.r - RATE) < 0.03)); if (PLAY.on && !PLAY.paused) play(POS.p, POS.s); }
function setVol(v) { VOL = Math.max(0.1, Math.min(1, v)); ST.set('vol', VOL); $('sVol').value = VOL; if (PLAY.on && !PLAY.paused) play(POS.p, POS.s); }
function say(t) { if (PLAY.on && !PLAY.paused) { toast(t); return; } toast(t); const v = uzVoices()[0] || mainVoice(); const u = new SU(normUz(t)); if (v) { u.voice = v; u.lang = v.lang; } u.rate = Math.max(1, RATE); u.volume = VOL; if (!PLAY.on) SS.cancel(); SS.speak(u); }

/* ============ OVOZLI BUYRUQLAR ============ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let REC = null, LISTEN = false, recLang = ST.get('recLang', 'uz-UZ');
const NUMW = { bir: 1, ikki: 2, uch: 3, tort: 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, toqqiz: 9, on: 10, yigirma: 20, ottiz: 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, toqson: 90, yuz: 100 };
function wordsNum(s) { const m = s.match(/(\d+)/); if (m) return +m[1]; let n = 0, got = false; for (const w of s.split(/\s+/)) { const b = w.replace(/(i?nchi|chi|ta)$/, ''); if (NUMW[b] != null) { n = NUMW[b] === 100 ? (n || 1) * 100 : n + NUMW[b]; got = true; } } return got ? n : null; }
function normCmd(t) { return cyr2lat(t).toLowerCase().replace(/[ʻʼ'`’‘]/g, '').replace(/[.,!?;:«»"]/g, ' ').replace(/\s+/g, ' ').trim(); }
const CMDS = [
  [/(tinglashni|eshitishni|mikrofonni?)\s*(toxtat|ochir|bas)/, () => { micOff(); say('Tinglash oʻchirildi'); }],
  [/(yopil|dasturni yop|yopish|chiqib ket|vikhod|vyhod|zakroy)/, () => { say('Xayr'); setTimeout(() => window.close(), 900); }],
  [/(yordam|nima qila olasan|buyruqlar|pomosh)/, () => { $('set').classList.add('open'); say('Oʻqi, toʻxta, tezroq, sekinroq, keyingi, oldingi, beshinchi sahifaga oʻt, biror soʻzni top deb ayting.'); }],
  [/(qayerda|qaysi (sahifa|slayd|bet)|nechanchi)/, () => { const p = cur(); say(p ? `Hozir ${p.page + 1}-${DOC.type === 'pptx' ? 'slayd' : 'sahifa'}, jami ${DOC.pages.length} ta` : 'Hujjat ochilmagan'); }],
  [/(fayl|hujjat|dokument|fail).*(och|tanla|top)|^och(ish)?$|otkroy/, () => pickFile()],
  [/(top|qidir|izla|nayd|topib ber)/, t => { const q = t.replace(/(ni|ga|dan)?\s*(topib ber|top|qidir|izla|naydi|nayti)\s*(chi|ib ber)?/g, ' ').replace(/\b(soz|sozini|joyini|qismini|matnda|matndan)\b/g, ' ').trim(); if (!q) return say('Nimani topay?'); findText(q); }],
  [/(boshidan|qaytadan|birinchi sahifadan|snachala)/, () => { play(0, 0); }],
  [/(\d+|bir|ikki|uch|tort|besh|olti|yetti|sakkiz|toqqiz|on|yigirma|ottiz|qirq|ellik)\S*\s*-?\s*(sahifa|slayd|bet|list|stranits|slayt)/, t => { const n = wordsNum(t); if (!n || !gotoPage(n)) say('Bunday sahifa yoʻq'); else if (!PLAY.on) play(); }],
  [/(keyingi|keyinga|keyin|oldinga|dalshe|sleduyush|next)\s*(sahifa|slayd|bet|stranits)/, () => pageJump(1)],
  [/(oldingi|orqaga|nazad|predydush)\s*(sahifa|slayd|bet|stranits)/, () => pageJump(-1)],
  [/^(keyingi|keyinga|oldinga|dalshe|sleduyush|otkazib yubor|otkaz)/, () => jump(1)],
  [/^(oldingi|orqaga|nazad|qaytar|predydush)/, () => jump(-1)],
  [/(juda tez|eng tez)/, () => { setRate(1.6); toast('⚡ Tezlik 1.6×'); }],
  [/(juda sekin|eng sekin)/, () => { setRate(0.7); toast('🐢 Tezlik 0.7×'); }],
  [/(oddiy|normal|odatiy|ortacha) (tezlik|tezlikda|ovoz)/, () => { setRate(1); toast('Tezlik 1×'); }],
  [/(tez|bystree|bistree|bystrey|uskor)/, () => { setRate(RATE + 0.15); toast('Tezlik ' + RATE.toFixed(2) + '×'); }],
  [/(sekin|asta|medlen|medlenn)/, () => { setRate(RATE - 0.15); toast('Tezlik ' + RATE.toFixed(2) + '×'); }],
  [/(baland|kuchliroq|ovozni kotar|gromche|qattiqroq)/, () => { setVol(VOL + 0.2); toast('🔊 ' + Math.round(VOL * 100) + '%'); }],
  [/(pastroq|ovozni pasaytir|tishe|ohista)/, () => { setVol(VOL - 0.2); toast('🔉 ' + Math.round(VOL * 100) + '%'); }],
  [/(sardor|erkak ovoz)/, () => { const v = uzVoices().find(v => /sardor/i.test(v.name)); v ? setVoice(v.name) : say('Sardor ovozi topilmadi'); }],
  [/(madina|ayol ovoz)/, () => { const v = uzVoices().find(v => /madina/i.test(v.name)); v ? setVoice(v.name) : say('Madina ovozi topilmadi'); }],
  [/(kattalashtir|katta|yaqinlashtir|uvelich)/, () => setZoom(ZOOM + 0.15)],
  [/(kichraytir|kichik|uzoqlashtir|umensh)/, () => setZoom(ZOOM - 0.15)],
  [/(tungi|qorongi|tyomn|temn)/, () => setDark(true)],
  [/(kunduzgi|yorug|svetl)/, () => setDark(false)],
  [/^(toxta|tuxta|toxtat|tuxtat|stop|pauza|pauz|jim|bas|tinch|hop|ostanov)/, () => pause()],
  [/(toxta|tuxta|stop|pauza|jim bol)/, () => pause()],
  [/(davom|davay|prodolzh|kettik)/, () => PLAY.on ? resume() : play()],
  [/(oqi|uqi|oqib ber|boshla|chitay|chitai|ishga tush|play|gapir|eshittir)/, () => PLAY.on ? (PLAY.paused ? resume() : null) : play()],
  [/^(oqi|labbay|hey oqi|salom)$/, () => say('Labbay')],
];
function handleCmd(raw) {
  const t = normCmd(raw); if (!t) return; const words = t.split(' ').length;
  if (PLAY.on && !PLAY.paused) { if (words > 5) return; const s = cur()?.sents[POS.s]; if (s && normCmd(s.t).includes(t) && words > 1) return; }
  showHeard('«' + raw.trim() + '»');
  for (const [re, fn] of CMDS) if (re.test(t)) { fn(t); return; }
  if (!PLAY.on || PLAY.paused) say('Tushunmadim. Yordam deb ayting');
}
function findText(q) { if (!DOC) return say('Avval fayl oching'); const nq = normCmd(q); const from = POS.p + 1;
  const all = DOC.paras.map((p, i) => [i, normCmd(p.t)]); const hit = [...all.slice(from), ...all.slice(0, from)].find(([, t]) => t.includes(nq)) || [...all.slice(from), ...all.slice(0, from)].find(([, t]) => nq.split(' ').filter(w => w.length > 2).every(w => t.includes(w)));
  if (!hit) return say(`«${q}» topilmadi`); const [i] = hit; const k = Math.max(0, DOC.paras[i].sents.findIndex(s => normCmd(s.t).includes(nq.split(' ')[0]))); play(i, k); }
/* --- O'zbek nutqini tanish: 1) oflayn Vosk o'zbek modeli  2) Edge onlayn tanish (zaxira) --- */
const VOSK = { model: null, rec: null, ctx: null, src: null, node: null, stream: null, loading: null,
  async avail() { try { const r = await fetch('vendor/vosk-uz.tar.gz', { method: 'HEAD' }); return r.ok; } catch (e) { return false; } },
  loadLib() { return window.Vosk ? Promise.resolve() : new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'vendor/vosk.js'; sc.onload = ok; sc.onerror = () => no(new Error('vosk.js yuklanmadi')); document.head.appendChild(sc); }); },
  async start() {
    if (!this.model) { if (!this.loading) this.loading = (async () => { await this.loadLib(); toast('🎙 O\'zbek nutq modeli yuklanmoqda… (birinchi marta 10–20 soniya)', 20000); const m = await Vosk.createModel(new URL('vendor/vosk-uz.tar.gz', location.href).href); this.model = m; })(); await this.loading; }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.ctx = new AudioContext(); const rec = new this.model.KaldiRecognizer(this.ctx.sampleRate); this.rec = rec;
    rec.on('result', m => { const t = m && m.result && m.result.text; if (t && t.trim()) handleCmd(t); });
    rec.on('partialresult', m => { const t = m && m.result && m.result.partial; if (t) showHeard(t + '…'); });
    this.src = this.ctx.createMediaStreamSource(this.stream); this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = e => { try { rec.acceptWaveform(e.inputBuffer); } catch (err) {} };
    this.src.connect(this.node); this.node.connect(this.ctx.destination);
  },
  stop() { try { this.node && this.node.disconnect(); this.src && this.src.disconnect(); } catch (e) {} try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch (e) {} try { this.ctx && this.ctx.close(); } catch (e) {} try { this.rec && this.rec.remove(); } catch (e) {} this.node = this.src = this.stream = this.ctx = this.rec = null; }
};
let ENGINE = '';
function showHeard(t) { const h = $('heard'); h.textContent = '🎙 ' + t; h.style.opacity = 1; clearTimeout(h._t); h._t = setTimeout(() => h.style.opacity = 0, 3000); }
async function micOn() {
  LISTEN = true; $('bMic').classList.add('on');
  const pref = ST.get('engine', 'auto');
  if (pref !== 'edge' && await VOSK.avail()) {
    try { await VOSK.start(); ENGINE = 'vosk'; toast('🎙 Tinglayapman (o\'zbekcha, oflayn) — buyruq ayting'); setEngineLbl(); return; }
    catch (e) { console.warn(e); VOSK.stop(); if (e && /NotAllowed|Permission/i.test(e.name + e.message)) { micOff(); toast('🎙 Mikrofonga ruxsat bering (manzil satridagi 🔒 belgisi)', 7000); return; } toast('Oflayn model ishlamadi, onlayn tanishga o\'tdim', 4000); }
  }
  if (!SR) { micOff(); toast('Ovozni tanish imkoni yo\'q', 6000); return; }
  ENGINE = 'edge'; startRec(); setEngineLbl(); toast('🎙 Tinglayapman — buyruq ayting');
}
function micOff() { LISTEN = false; $('bMic').classList.remove('on'); VOSK.stop(); try { REC && REC.abort(); } catch (e) {} REC = null; ENGINE = ''; setEngineLbl(); }
function setEngineLbl() { const l = $('engLbl'); if (l) l.textContent = ENGINE === 'vosk' ? 'oflayn' : ENGINE === 'edge' ? 'onlayn' : ''; }
function startRec() { if (!LISTEN || ENGINE !== 'edge') return; const r = new SR(); REC = r; r.lang = recLang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
  r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) { let best = res[0].transcript; for (let a = 0; a < res.length; a++) if (CMDS.some(([re]) => re.test(normCmd(res[a].transcript)))) { best = res[a].transcript; break; } handleCmd(best); } else showHeard(res[0].transcript + '…'); } };
  r.onerror = e => { if (e.error === 'language-not-supported' && recLang !== 'ru-RU') { recLang = recLang === 'uz-UZ' ? 'tr-TR' : 'ru-RU'; ST.set('recLang', recLang); } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micOff(); toast('🎙 Mikrofonga ruxsat bering (manzil satridagi 🔒 belgisi)', 7000); } };
  r.onend = () => { if (LISTEN && REC === r) setTimeout(startRec, 250); };
  try { r.start(); } catch (e) { setTimeout(startRec, 1000); } }

/* ============ UI ============ */
let ZOOM = ST.get('zoom', 1);
function setZoom(z) { ZOOM = Math.max(0.3, Math.min(2.2, Math.round(z * 20) / 20)); ST.set('zoom', ZOOM); $('doc').style.zoom = ZOOM; $('zv').textContent = Math.round(ZOOM * 100) + '%'; }
function setDark(on) { document.body.classList.toggle('dark', on); ST.set('dark', on); }
$('bZi').onclick = () => setZoom(ZOOM + 0.1); $('bZo').onclick = () => setZoom(ZOOM - 0.1); setZoom(ZOOM);
$('bDark').onclick = () => setDark(!document.body.classList.contains('dark')); setDark(ST.get('dark', false));
$('bSide').onclick = () => $('side').classList.toggle('hide');
$('bSet').onclick = e => { e.stopPropagation(); $('set').classList.toggle('open'); };
document.addEventListener('click', e => { if (!e.target.closest('#set,#bSet')) $('set').classList.remove('open'); });
$('bOpen').onclick = pickFile; $('fin').onchange = () => { const f = $('fin').files[0]; if (f) openFile(f); $('fin').value = ''; };
$('bPlay').onclick = toggle; $('bStop').onclick = () => { stop(); }; $('bPrev').onclick = () => jump(-1); $('bNext').onclick = () => jump(1);
$('bMic').onclick = () => LISTEN ? micOff() : micOn();
$('prog').onclick = e => { if (!DOC) return; const r = $('prog').getBoundingClientRect(); const p = Math.round((e.clientX - r.left) / r.width * (DOC.paras.length - 1)); const np = nextPos(p, 0); if (!np) return; if (PLAY.on) play(np[0], 0); else { [POS.p, POS.s] = np; mark(); updProg(); } };
$('doc').addEventListener('click', e => { if (VIEW) return; const el = e.target.closest('[data-p]'); if (!el || !DOC) return; play(+el.dataset.p, +el.dataset.k || 0); });
$('sRate').oninput = () => { RATE = +$('sRate').value; $('vRate').textContent = RATE.toFixed(2).replace(/0$/, '') + '×'; document.querySelectorAll('#rateChips button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.r - RATE) < 0.03)); };
$('sRate').onchange = () => setRate(+$('sRate').value);
document.querySelectorAll('#rateChips button').forEach(b => b.onclick = () => setRate(+b.dataset.r)); setRate(RATE);
$('sVol').value = VOL; $('sVol').onchange = () => setVol(+$('sVol').value);
$('sVoice').onchange = () => setVoice($('sVoice').value);
for (const [id, def] of [['cTr', true], ['cRu', true], ['cNotes', true], ['cAbbr', true]]) { $(id).checked = ST.get(id, def); $(id).onchange = () => { ST.set(id, $(id).checked); if (PLAY.on && !PLAY.paused) play(POS.p, POS.s); }; }
$('sEng').value = ST.get('engine', 'auto'); $('sEng').onchange = () => { ST.set('engine', $('sEng').value); if (LISTEN) { micOff(); micOn(); } };
$('dict').value = ST.get('dict', ''); $('dict').oninput = () => { ST.set('dict', $('dict').value); loadDict(); }; loadDict();
document.addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); } else if (e.key === 'ArrowRight') jump(1); else if (e.key === 'ArrowLeft') jump(-1); else if (e.key === 'PageDown') { e.preventDefault(); pageJump(1); } else if (e.key === 'PageUp') { e.preventDefault(); pageJump(-1); }
  else if (e.key === 'Escape') stop(); else if (e.key === '+' || e.key === '=') setRate(RATE + 0.1); else if (e.key === '-') setRate(RATE - 0.1); else if (e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'ь') LISTEN ? micOff() : micOn();
  else if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFile(); } });
document.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drag'); }); document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drag'); });
document.addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) openFile(f); });
if (!PAR) SS.onvoiceschanged = pickVoices; pickVoices(); setTimeout(pickVoices, 1500); setTimeout(pickVoices, 4000);
window.addEventListener('beforeunload', () => { savePos(); SS.cancel(); });
if (EMBED && !VIEW) { const b = document.createElement('button'); b.className = 'ib'; b.textContent = '✕'; b.title = 'Yopish'; b.onclick = () => { stop(); window.parent.postMessage({ oqi: 'close' }, '*'); }; $('top').appendChild(b);
  window.addEventListener('message', async e => { const d = e.data && e.data.oqiOpen; if (!d) return; await openFile(new File([d.bytes], d.name || 'hujjat'), null); if (d.auto !== false && DOC && DOC.paras.length) setTimeout(() => play(), 300); });
  try { window.parent.postMessage({ oqi: 'ready' }, '*'); } catch (e) {} }
if (EMBED && VIEW) { window.addEventListener('message', async e => { const d = e.data && e.data.oqiOpen; if (!d) return; await openFile(new File([d.bytes], d.name || 'hujjat'), null); $('side').classList.add('hide'); }); try { window.parent.postMessage({ oqi: 'ready' }, '*'); } catch (e) {} }
NATIVE.init().then(() => { renderRecent(); if (NATIVE.on && ST.get('micAuto', false)) micOn(); });
