// CI: sinov loyihasi uchun Blender skriptlari
const fs = require('fs'); global.window = global; eval(fs.readFileSync(__dirname + '/../desktop/app/loyiha-core.js', 'utf8'));
const L = global.LOYIHA, [, , A, OUTD] = process.argv;
fs.mkdirSync(OUTD + '/lib/mashina', { recursive: true });
const mk = st => { let s = L.normalize({ name: 'Sinov', W: 16, L: 12, h: 3.2, levels: [{ rooms: [] }, { rooms: [] }] }); const p = L.STYLES[st].patch; return L.normalize({ ...s, ...p, colors: { ...s.colors, ...p.colors } }); };
[['neoklassik', 'front', 'kun'], ['neoklassik', 'eye', 'kech'], ['zamonaviy', 'eye', 'kun'], ['milliy', 'cut', 'kun']].forEach(([st, v, sky]) => {
  const n = `${st}-${v}-${sky}`;
  fs.writeFileSync(`${OUTD}/${n}.py`, L.blenderScript(mk(st), { view: v, sky, quality: 'draft', assets: A, lib: OUTD + '/lib', out: `${OUTD}/${n}.png` }));
  console.log(n);
});
