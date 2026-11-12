/* Android WebView'da speechSynthesis yo'q — telefonning o'z ovozi (Google TTS) orqali to'ldiramiz */
(function () {
  const CE = window.capacitorExports || {};
  if (!(CE.Capacitor && CE.Capacitor.isNativePlatform && CE.Capacitor.isNativePlatform())) return;
  const TTS = CE.registerPlugin('TextToSpeech');
  let voices = [], queue = [], busy = false, gen = 0;
  class Utt { constructor(t) { this.text = t || ''; this.lang = 'ru-RU'; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.onend = null; this.onerror = null; this.onstart = null; } }
  async function loadVoices() {
    try { const r = await TTS.getSupportedVoices(); voices = (r.voices || []).map((v, i) => ({ name: v.name || v.voiceURI || ('Ovoz ' + i), lang: (v.lang || '').replace('_', '-'), voiceURI: v.voiceURI || v.name, localService: true, default: !!v.default, _i: i })); }
    catch (e) { voices = []; }
    try { S.onvoiceschanged && S.onvoiceschanged(); } catch (e) {}
  }
  async function pump() {
    if (busy) return; const u = queue.shift(); if (!u) { S.speaking = false; return; }
    busy = true; S.speaking = true; const g = gen;
    try { u.onstart && u.onstart(); } catch (e) {}
    try {
      const lang = (u.voice && u.voice.lang) || u.lang || 'ru-RU';
      await TTS.speak({ text: u.text, lang, rate: Math.max(0.1, Math.min(2, u.rate || 1)), pitch: u.pitch || 1, volume: u.volume == null ? 1 : u.volume, voice: u.voice ? u.voice._i : undefined, category: 'playback' });
      if (g === gen) try { u.onend && u.onend({}); } catch (e) {}
    } catch (e) { try { (u.onerror || u.onend) && (u.onerror || u.onend)({ error: e.message }); } catch (er) {} }
    busy = false; if (g === gen) pump();
  }
  const S = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => voices,
    speak(u) { queue.push(u); pump(); },
    cancel() { gen++; const q = queue; queue = []; busy = false; S.speaking = false; TTS.stop().catch(() => {}); q.forEach(u => { try { u.onend && u.onend({}); } catch (e) {} }); },
    pause() {}, resume() {},
    addEventListener(n, f) { if (n === 'voiceschanged') S.onvoiceschanged = f; }
  };
  try { Object.defineProperty(window, 'speechSynthesis', { value: S, configurable: true }); } catch (e) { window.speechSynthesis = S; }
  window.SpeechSynthesisUtterance = Utt;
  loadVoices(); setTimeout(loadVoices, 2500);
})();
