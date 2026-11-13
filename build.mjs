// www/ papkasini yig'adi: kompyuter versiyasidagi Jarvis sahifasi + Android ko'prigi
import fs from 'fs'; import path from 'path';
const W = 'www', S = 'src';
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W + '/lib', { recursive: true });
fs.cpSync(S + '/app/vendor', W + '/vendor', { recursive: true });
fs.copyFileSync('node_modules/@capacitor/core/dist/capacitor.js', W + '/lib/capacitor.js');
fs.copyFileSync('node_modules/scrypt-js/scrypt.js', W + '/lib/scrypt.js');
for (const f of ['native.js', 'tts-polyfill.js', 'mobile.css', 'mobile.js']) fs.copyFileSync(S + '/' + f, W + '/' + f);
fs.copyFileSync(S + '/app/notiq.html', W + '/notiq.html');

let shim = fs.readFileSync(S + '/app/shim.js', 'utf8');
const pcA = shim.indexOf("description:'Foydalanuvchining kompyuterida ishlash (Windows)."), pcB = shim.indexOf("required:['action']}", pcA);
if (pcA < 0 || pcB < 0) throw new Error('pc tool anchor topilmadi');
shim = shim.slice(0, pcA) +
  "description:'Telefonda ishlash (Android). action: open_app (name: telegram, youtube, xarita, gmail, drive, kalendar, whatsapp, instagram, sozlamalar, telefon raqami yoki istalgan URL — ochadi), call (name: telefon raqami — qo\\'ng\\'iroq oynasini ochadi), sms (name: raqam, text: matn — SMS oynasini ochadi), system_info (batareya, qurilma).',\n      inputSchema:{type:'object',properties:{action:{type:'string',enum:['open_app','call','sms','system_info']},name:{type:'string'},text:{type:'string'}}," +
  shim.slice(pcB);
shim = shim.replace(/Windows/g, 'telefon').replace(/kompyuter(ingizda|da|ni|ga|dagi)?/g, (m, e) => 'telefon' + (e || ''));
{ const a = shim.indexOf("addMsg('j','👋 Jarvis\\'ga xush kelibsiz"); const b = shim.indexOf("');window.openModelSettings()", a);
  if (a < 0 || b < 0) throw new Error('xush kelibsiz matni topilmadi');
  shim = shim.slice(0, a) + "addMsg('j','👋 Xush kelibsiz, ser! Boshlash uchun **⚙ Sozlash**da Google bilan kiring — kompyuterdagi kalitlar o\\'zi yuklanadi. Yoki bepul **Gemini** / **Groq** kalitini kiriting." + shim.slice(b); }
{ const A = '<div class="t" style="font-size:13px;color:var(--mut);margin:6px 0">1) '; const B = "(bu o'zingizning ilovangiz).</div>";
  const i = shim.indexOf(A), j = shim.indexOf(B, i); if (i < 0 || j < 0) throw new Error('Google ko\'rsatmasi topilmadi');
  shim = shim.slice(0, i) + '<div class="t" style="font-size:14px;margin:6px 0">Eng osoni: <b>kompyuterdagi Jarvis</b> → ⚙ Modellar → GOOGLE → <b>📱 Telefon uchun kod</b> ni bosing. Kod Telegram\'ingizga ham keladi — uni pastdagi maydonga joylang → <b>Saqlash</b> → <b>Google bilan kirish</b>. Shundan keyin barcha kalitlar va xotira o\'zi yuklanadi.</div>' + shim.slice(j + B.length); }
fs.writeFileSync(W + '/shim.js', shim);

let html = fs.readFileSync(S + '/app/index.html', 'utf8');
const tag = '<script src="shim.js">';
if (!html.includes(tag)) throw new Error('shim tegi topilmadi');
html = html.replace(tag, '<script src="lib/capacitor.js"></script><script src="lib/scrypt.js"></script><script src="tts-polyfill.js"></script><script src="native.js"></script><link rel="stylesheet" href="mobile.css">' + tag);
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">');
html = html.replace(/Windows'dagi ovozlar/g, 'Telefondagi ovozlar').replace(/Sozlamalar → Vaqt va til → Nutq → Ovoz qo\\'shish/g, 'Sozlamalar → Til → Matnni nutqqa aylantirish');
html = html.replace(/shu kompyuterda/g, 'shu telefonda');
html = html.replace("JARVIS tizimlari ishga tushdi. Savol bering, eslatma qo'ydiring yoki ish bo'yicha hisob-kitob topshiring — yordam berishga tayyorman.", 'Buyuring — nima qilamiz?');
html = html.replace("'Gemini / Windows'", "'Gemini / telefon'");
if (!html.includes('</body>')) throw new Error('body yopilishi topilmadi');
html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, '<script src="mobile.js"></script></body>');
fs.writeFileSync(W + '/index.html', html);
console.log('www tayyor:', fs.readdirSync(W).join(', '));
