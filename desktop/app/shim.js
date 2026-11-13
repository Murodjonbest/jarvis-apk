/* Jarvis Desktop: replaces claude.ai runtime with free-model router */
(function(){
  if(!window.jarvisNative)return;
  window.JARVIS_DESKTOP=true;
  const N=window.jarvisNative;
  const err=(code,message,extra)=>Object.assign(new Error(message),{code},extra||{});

  /* ---- sample: OpenAI-style tool loop ---- */
  async function sample(input,opts={}){
    const msgs=typeof input==='string'?[{role:'user',content:input}]:input.map(m=>({role:m.role,content:String(m.content)}));
    let vision=false;
    if(opts.images&&opts.images.length){const urls=await Promise.all(opts.images.slice(0,4).map(b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)})));
      for(let i=msgs.length-1;i>=0;i--)if(msgs[i].role==='user'){msgs[i]={role:'user',content:[{type:'text',text:msgs[i].content},...urls.map(u=>({type:'image_url',image_url:{url:u}}))]};break}vision=true}
    const scrub=s=>{if(Array.isArray(s))return s.map(scrub);if(!s||typeof s!=='object')return s;const o={};for(const k in s){if(['additionalProperties','$schema','default','examples','format','minLength','maxLength','pattern','minimum','maximum','minItems','maxItems'].includes(k))continue;o[k]=scrub(s[k])}
      if(o.type==='array'&&!o.items)o.items={type:'string'};if(o.type==='object'&&o.properties&&!Object.keys(o.properties).length){delete o.properties;delete o.required}
      if(o.type==='object'&&!o.properties&&o!==null){/* bo'sh obyekt */}return o};
    const tools=(opts.tools||[]).map(t=>{const sc=scrub(t.inputSchema&&t.inputSchema.type?t.inputSchema:{type:'object'});const fn={name:t.name,description:String(t.description||'').slice(0,1024)};
      if(sc.properties)fn.parameters=sc;else fn.parameters={type:'object',properties:{_:{type:'string',description:'ishlatilmaydi'}}};return{type:'function',function:fn}});
    const byName=Object.fromEntries((opts.tools||[]).map(t=>[t.name,t]));
    const id=Math.random().toString(36).slice(2);let onAbort=null;
    if(opts.signal){if(opts.signal.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});onAbort=()=>N.abort(id);opts.signal.addEventListener('abort',onAbort,{once:true})}
    try{
      for(let step=0;step<20;step++){
        if(opts.signal&&opts.signal.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});
        if(opts.onText&&step===0)opts.onText({text:'…',delta:''});
        const r=await N.chat({id,messages:msgs,tools:step<11?tools:[],tier:opts.modelTier,vision});
        if(opts.signal&&opts.signal.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});
        if(r.error)throw err(r.error.code,r.error.message);
        try{const el=document.getElementById('sTier');if(el)el.textContent=r.provider+' · '+r.model.split('/').pop();
          const ai=document.getElementById('sAi');if(ai)ai.textContent=r.provider}catch(e){}
        const m=r.message;
        if(m.tool_calls&&m.tool_calls.length&&tools.length){
          msgs.push({role:'assistant',content:m.content||'',tool_calls:m.tool_calls});
          for(const tc of m.tool_calls){let out;
            try{const t=byName[tc.function.name];if(!t)throw new Error('Bunday vosita yo\'q: '+tc.function.name);
              let args={};try{args=tc.function.arguments?JSON.parse(tc.function.arguments):{}}catch(e){throw new Error('argumentlar to\'g\'ri JSON emas — vositani qayta, to\'g\'ri JSON bilan chaqir')}
              const v=await t.execute(args);out=typeof v==='string'?v:JSON.stringify(v===undefined?{ok:true}:v)}
            catch(e){out='XATO: '+(e&&e.message||e);try{(window.__jerr=window.__jerr||[]).push({t:Date.now(),tool:tc.function.name,msg:String(e&&e.message||e).slice(0,200)});if(window.__jerr.length>50)window.__jerr.shift()}catch(er){}}
            msgs.push({role:'tool',tool_call_id:tc.id,content:String(out).slice(0,12000)})}
          continue}
        const text=(m.content||'').trim();
        if(!text&&!opts.__retried){opts.__retried=true;msgs.push({role:'user',content:'(Tizim: javob bo\'sh qoldi. Iltimos, foydalanuvchiga to\'liq javob yoz.)'});continue}
        if(opts.onText)opts.onText({text,delta:text});
        return{text,truncated:false,modelApplied:r.model}}
      throw err('upstream_error','Vositalar zanjiri juda uzun bo\'ldi')
    }finally{if(onAbort&&opts.signal)opts.signal.removeEventListener('abort',onAbort)}}
  sample.limits=async()=>({images:true});

  /* ---- tejamkor "Jarvis" aniqlash (Vosk, internetsiz) ---- */
  let VK=null,VKp=null;
  const voskOn=()=>{try{return localStorage.getItem('jarvis_vosk')!=='0'}catch(e){return true}};
  function voskLoad(){if(VKp)return VKp;VKp=new Promise(res=>{const go=()=>window.Vosk.createModel(location.origin+'/vendor/vosk-model.tar.gz').then(m=>{VK=m;res(m)}).catch(e=>{console.warn('vosk',e);res(null)});
      if(window.Vosk)return go();const sc=document.createElement('script');sc.src='vendor/vosk.js';sc.onload=go;sc.onerror=()=>res(null);document.head.appendChild(sc)});return VKp}
  window.voskLoad=voskLoad;
  async function voskHasWake(pcm){if(!VK){voskLoad();return null}
    return new Promise(res=>{let done=false,t2=null;const r=new VK.KaldiRecognizer(16000,JSON.stringify(['jarvis','hey jarvis','[unk]']));
      const fin=v=>{if(done)return;done=true;clearTimeout(t2);setTimeout(()=>{try{r.remove()}catch(e){}},50);res(v)};
      r.on('result',m=>{const t=(m.result&&m.result.text)||'';if(/jarvis/.test(t))fin(true);else{clearTimeout(t2);t2=setTimeout(()=>fin(false),350)}});
      r.on('partialresult',m=>{if(/jarvis/.test((m.result&&m.result.partial)||''))fin(true)});
      try{r.acceptWaveformFloat(pcm,16000);r.retrieveFinalResult()}catch(e){fin(null)}setTimeout(()=>fin(null),3000)})}
  setTimeout(()=>{if(voskOn())voskLoad()},6000);
  /* ---- dictation: mic → speech segments → Groq Whisper ---- */
  function makeDictation(){
    const L={partial:[],final:[],state:[]};let st='idle',stream=null,ctx=null,rec=null,raf=0,chunks=[],speaking=false,silentSince=0,lastFinal=0,noise=0.01,startedAt=0;
    const emit=(k,v)=>L[k].forEach(f=>{try{f(v)}catch(e){}});
    const setState=(s,reason)=>{st=s;emit('state',{state:s,reason})};
    async function flush(){if(!rec||rec.state!=='recording')return;const r=rec;await new Promise(res=>{r.onstop=res;r.stop()});
      const blob=new Blob(chunks,{type:r.mimeType||'audio/webm'});chunks=[];if(blob.size<3500)return;
      if(typeof W!=='undefined'&&W&&W.on&&window.voiceCheck&&!(await window.voiceCheck(blob))){emit('partial',{text:''});return}
      let payload=await blob.arrayBuffer(),mt=blob.type;
      try{const dec=await new AudioContext().decodeAudioData(payload.slice(0));
        const len=Math.ceil(dec.duration*16000);const oc=new OfflineAudioContext(1,len,16000);const s=oc.createBufferSource();s.buffer=dec;s.connect(oc.destination);s.start();const r=await oc.startRendering();
        const pcm=r.getChannelData(0);
        // tejamkor tinglash: "Jarvis" kutilayotganda avval kompyuterning o'zida (internetsiz) tekshiramiz — yo'q bo'lsa internetga yubormaymiz
        if(typeof W!=='undefined'&&W&&W.on&&!W.await&&voskOn()){const hit=await voskHasWake(pcm);if(hit===false){emit('partial',{text:''});return}}
        emit('partial',{text:'🎙 tanilmoqda…'});const wav=new DataView(new ArrayBuffer(44+pcm.length*2));const W=(o,str)=>{for(let i=0;i<str.length;i++)wav.setUint8(o+i,str.charCodeAt(i))};
        W(0,'RIFF');wav.setUint32(4,36+pcm.length*2,true);W(8,'WAVE');W(12,'fmt ');wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true);wav.setUint32(24,16000,true);wav.setUint32(28,32000,true);wav.setUint16(32,2,true);wav.setUint16(34,16,true);W(36,'data');wav.setUint32(40,pcm.length*2,true);
        for(let i=0;i<pcm.length;i++){const v=Math.max(-1,Math.min(1,pcm[i]));wav.setInt16(44+i*2,v<0?v*32768:v*32767,true)}payload=wav.buffer;mt='audio/wav'}catch(e){}
      const res=await N.stt(payload,mt);
      if(res.error){emit('partial',{text:''});console.warn(res.error);if(/Groq/.test(res.error))showErr(res.error);return}
      const t=(res.text||'').replace(/^[\s.]+|[\s]+$/g,'');if(t&&!/^(\.|продолжение следует|subtitles|thank you\.?)$/i.test(t)){lastFinal=Date.now();emit('final',{text:t})}else emit('partial',{text:''})}
    function showErr(m){try{if(typeof showToast==='function')showToast(m,'MIKROFON')}catch(e){}}
    function newRec(){chunks=[];rec=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':''});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.start(250)}
    function loop(an,buf){an.getFloatTimeDomainData(buf);let s=0;for(const v of buf)s+=v*v;const rms=Math.sqrt(s/buf.length);const now=Date.now();
      if(!speaking)noise=noise*0.97+rms*0.03;const thr=Math.max(0.012,noise*2.8);
      if(rms>thr){if(!speaking){speaking=true;newRec();emit('partial',{text:'🎙 …'})}silentSince=0}
      else if(speaking){if(!silentSince)silentSince=now;if(now-silentSince>900||(rec&&now-startedAt>60000)){speaking=false;silentSince=0;flush()}}
      const wake=(typeof W!=='undefined'&&W&&W.on);
      if(!wake&&!speaking&&lastFinal&&now-lastFinal>2200){api.stop();return}
      if(!wake&&!speaking&&!lastFinal&&now-startedAt>15000){api.stop();return}
      raf=setTimeout(()=>loop(an,buf),30)}
    const api={
      start(){if(st==='listening')return Promise.resolve();startedAt=Date.now();lastFinal=0;
        return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).then(s=>{stream=s;ctx=new AudioContext();const src=ctx.createMediaStreamSource(s);const an=ctx.createAnalyser();an.fftSize=2048;src.connect(an);
          setState('listening');try{N.wakeBusy&&N.wakeBusy(true)}catch(e){}loop(an,new Float32Array(an.fftSize))}).catch(e=>{throw err('not_granted','Mikrofonga ruxsat yo\'q: '+e.message)})},
      async stop(){if(st!=='listening')return;clearTimeout(raf);if(speaking){speaking=false;await flush()}
        try{stream.getTracks().forEach(t=>t.stop())}catch(e){}try{ctx.close()}catch(e){}try{N.wakeBusy&&N.wakeBusy(false)}catch(e){}setState('idle','stopped')},
      onPartial(f){L.partial.push(f)},onFinal(f){L.final.push(f)},onState(f){L.state.push(f)}};
    return api}

  /* ---- local store as db ---- */
  const db={collection(p){return{doc(k){return{get:async()=>{const all=await N.storeGet()||{};return all[p+'/'+k]||null},
    set:async v=>{const all=await N.storeGet()||{};all[p+'/'+k]=v;await N.storeSet(all)}}}}}};
  const user={id:async()=>'local',name:async()=>'Murodjon'};
  const mcpShim={
    listTools:async()=>N.gapiList?N.gapiList():{servers:[]},
    describeTool:async(server,tool)=>{const d=N.gapiDescribe?await N.gapiDescribe(tool):null;if(!d)throw err('bad_request','sxema yo\'q');return{name:tool,description:'',inputSchema:d.inputSchema}},
    callTool:async(server,tool,input)=>{const r=await N.gapiCall(server,tool,input);if(r.error)throw err(r.error.code,r.error.message);return{payload:r.payload,content:[{type:'text',text:JSON.stringify(r.payload)}]}},
    watchTool:()=>()=>{},invalidate:async()=>{}};
  const NS={sample,dictation:null,tts:null,db,user,mcp:mcpShim,permissions:null};
  let dict=null;
  window.claude={use:async name=>{
    if(name==='dictation'){if(!navigator.mediaDevices||!window.MediaRecorder)return null;dict=dict||makeDictation();return dict}
    return NS[name]===undefined?null:NS[name]}};

  /* ---- model settings window ---- */
  window.openModelSettings=async function(){
    const cfg=await N.getCfg();
    openWin('models','⚙ MODELLAR — BEPUL AI ULANISHLARI',async w=>{w.el.style.width=Math.min(innerWidth-40,760)+'px';w.el.style.height=Math.min(innerHeight-120,640)+'px';
      const order=cfg.providers.map(p=>p.id);
      const draw=()=>{w.body.innerHTML=`<div class="kbm" style="margin-bottom:8px">Jarvis ro'yxatdagi tartib bo'yicha ishlaydi: birinchi model limitga yetsa yoki xato bersa, keyingisiga o'tadi va suhbatni davom ettiradi. Har bir xizmatdan <b>bepul API kalit</b> oling (havolani bosing) va shu yerga qo'ying. Kamida bittasi kerak; <b>Groq</b> kaliti ovozli buyruqlar uchun ham ishlatiladi.</div>
        <div class="vrow"><label>Ovoz tili</label><select data-lang><option value="uz">O'zbek</option><option value="ru">Rus</option><option value="auto">Avtomatik</option></select></div>`+
        order.map((id,i)=>{const p=cfg.providers.find(x=>x.id===id);return `<div class="wmsg" data-p="${p.id}"><div class="h" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-en ${p.enabled?'checked':''}> <b style="color:var(--cy2)">${i+1}. ${esc(p.name)}</b> <span style="flex:1"></span><button class="x" data-up title="Yuqoriga">▲</button><button class="x" data-dn title="Pastga">▼</button></div>
          <div class="t" style="font-size:13px;color:var(--mut)">${esc(p.note||'')}</div>
          <div class="addrow"><input data-key type="password" placeholder="API kalit" value="${esc(p.key||'')}"><button data-get>🔑 Kalit olish</button></div>
          <div class="addrow"><input data-models placeholder="model nomlari, vergul bilan" value="${esc((p.models||[]).join(', '))}"><button data-load>⬇ Modellarni yuklash</button><button data-test>✓ Sinash</button></div>
          <div class="kbm" data-res></div></div>`}).join('')+`<div class="wact"><button class="w" data-save>💾 Saqlash</button></div>`;
        w.body.querySelector('[data-lang]').value=cfg.sttLang||'uz';
        const collect=()=>({sttLang:w.body.querySelector('[data-lang]').value,order,providers:[...w.body.querySelectorAll('[data-p]')].map(el=>({id:el.dataset.p,enabled:el.querySelector('[data-en]').checked,key:el.querySelector('[data-key]').value,models:el.querySelector('[data-models]').value.split(',').map(s=>s.trim()).filter(Boolean)}))});
        const sync=()=>{const c=collect();c.providers.forEach(u=>{const p=cfg.providers.find(x=>x.id===u.id);p.enabled=u.enabled;p.key=u.key;p.models=u.models});cfg.sttLang=c.sttLang};
        w.body.querySelectorAll('[data-p]').forEach(el=>{const id=el.dataset.p,p=cfg.providers.find(x=>x.id===id),res=el.querySelector('[data-res]');
          el.querySelector('[data-get]').onclick=()=>N.open(p.keyUrl);
          el.querySelector('[data-up]').onclick=()=>{sync();const i=order.indexOf(id);if(i>0){order.splice(i,1);order.splice(i-1,0,id);draw()}};
          el.querySelector('[data-dn]').onclick=()=>{sync();const i=order.indexOf(id);if(i<order.length-1){order.splice(i,1);order.splice(i+1,0,id);draw()}};
          el.querySelector('[data-load]').onclick=async()=>{await N.setCfg(collect());res.textContent='Yuklanmoqda…';const r=await N.models(id);
            if(r.error){res.textContent='✕ '+r.error;return}res.innerHTML='Bosib qo\'shing: '+r.models.slice(0,80).map(m=>`<button class="chip" style="margin:2px;font-size:11px" data-m="${esc(m)}">${esc(m)}</button>`).join('');
            res.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const inp=el.querySelector('[data-models]');const cur=inp.value.split(',').map(s=>s.trim()).filter(Boolean);if(!cur.includes(b.dataset.m))cur.push(b.dataset.m);inp.value=cur.join(', ')})};
          el.querySelector('[data-test]').onclick=async()=>{await N.setCfg(collect());res.textContent='Sinalmoqda…';const r=await N.test(id);res.textContent=r.ok?'✓ Ishlayapti ('+r.model+')':'✕ '+r.error}});
        w.body.querySelector('[data-save]').onclick=async()=>{await N.setCfg(collect());window.keysAuto&&window.keysAuto();const n=await N.getCfg();Object.assign(cfg,n);draw();try{showToast('Sozlamalar saqlandi','MODELLAR')}catch(e){}}};
      draw()})};
  document.addEventListener('DOMContentLoaded',()=>{
    const dock=document.getElementById('dock');if(dock){const b=document.createElement('button');b.textContent='⚙ Modellar';b.onclick=()=>window.openModelSettings();dock.insertBefore(b,dock.firstChild)}
    N.getCfg().then(c=>{if(!c.providers.some(p=>p.enabled&&p.hasKey))setTimeout(()=>{try{addMsg('j','👋 Jarvis\'ga xush kelibsiz, ser! Ishlashim uchun kamida bitta **bepul API kalit** kerak. Pastdagi **⚙ Modellar** tugmasini bosing → "🔑 Kalit olish" → kalitni joylang → **Saqlash**. Eng osoni: **Groq** (ovozli buyruqlar ham shu bilan ishlaydi) va **Google Gemini**.');window.openModelSettings()}catch(e){}},800)})});
})();

/* ================= DESKTOP: ONLAYN/OFLAYN + GOOGLE SINXRON ================= */
(function(){
  if(!window.jarvisNative)return;const N=window.jarvisNative;
  const SY=window.SY={dirty:false,busy:false,online:null,status:'—',timer:null,last:0};
  function ui(){const n=document.getElementById('sNet'),g=document.getElementById('sSync'),dn=document.getElementById('dNet'),dg=document.getElementById('dSync');
    if(n){n.textContent=SY.online==null?'…':SY.online?'onlayn':'oflayn';dn.className='dot '+(SY.online?'on':'off')}
    if(g){g.textContent=SY.status;dg.className='dot '+(/✓/.test(SY.status)?'on':'off')}
    const gs=document.getElementById('gmStat');if(gs){gs.textContent=SY.status;gs.className=/✓/.test(SY.status)?'ok':'no'}
    const gb=document.getElementById('gmBtn');if(gb)gb.textContent='☁ Google sinxron sozlamalari'}
  function schedule(ms){clearTimeout(SY.timer);SY.timer=setTimeout(()=>syncNow(),ms||8000)}
  async function syncNow(manual){
    if(SY.busy){schedule(5000);return}SY.busy=true;
    try{
      SY.online=await N.net();
      if(!SY.online){SY.status=SY.dirty?'📴 oflayn · o\'zgarishlar navbatda':'📴 oflayn';ui();return}
      const st=await N.gStatus();
      if(!st.loggedIn){SY.status=st.configured?'Google\'ga kirilmagan':'Google sozlanmagan';ui();return}
      SY.status='⏳ sinxronlanmoqda…';ui();
      const before=JSON.stringify({...memSnapshot(),updated:0});
      const r=await N.gPull();
      if(r.error){SY.status=(r.code==='offline'?'📴 oflayn':'✕ '+r.error.slice(0,60));if(r.code==='offline')SY.online=false;ui();return}
      let remoteHad=false;
      if(r.content){try{const m=JSON.parse(r.content);if(m&&m.app==='JARVIS'){mergeMem(m);remoteHad=true}}catch(e){}}
      const snap=memSnapshot();const changed=JSON.stringify({...snap,updated:0})!==before;
      if(SY.dirty||changed||!remoteHad||manual){const p=await N.gPush(JSON.stringify(snap));
        if(p.error){SY.status=p.code==='quota'?'✕ Google xotira to\'lgan':'✕ '+p.error.slice(0,60);ui();if(p.code==='quota')try{showToast('Google xotirangiz to\'lgan — sinxron to\'xtadi. one.google.com/storage da joy bo\'shating.','SINXRON')}catch(e){}return}}
      SY.dirty=false;SY.last=Date.now();SY.status='✓ '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});ui();
      if(changed&&remoteHad)try{act('☁ Google xotira bilan birlashtirildi')}catch(e){}
      // kalitlar Google xotirada bor, bu kompyuterda yo'q bo'lsa — tiklashni taklif qilish
      if(S.secrets&&S.secrets.blob){const c=await N.getCfg();if(!c.providers.some(p=>p.hasKey)&&!SY.askedSecrets){SY.askedSecrets=true;
        addMsg('j','🔐 Google xotirada shifrlangan API kalitlaringiz topildi. **⚙ Modellar** → "Kalitlarni Google\'dan tiklash" bo\'limida parolingizni kiriting.');}}
    }catch(e){SY.status='✕ '+(e.message||e).slice(0,60);ui()}
    finally{SY.busy=false}}
  window.syncNow=syncNow;
  window.addEventListener('online',()=>{SY.online=true;ui();schedule(1500)});
  window.addEventListener('offline',()=>{SY.online=false;SY.status='📴 oflayn';ui()});
  setInterval(()=>{if(!document.hidden||!window.JARVIS_MOBILE)syncNow()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(800)});
  window.addEventListener('focus',()=>schedule(800));
  document.addEventListener('DOMContentLoaded',()=>{
    // status rows
    const anchor=document.getElementById('sCount');if(anchor){const row=anchor.closest('.stat');
      row.insertAdjacentHTML('beforebegin','<div class="stat"><span><i class="dot" id="dNet"></i>Internet</span><b id="sNet">…</b></div><div class="stat"><span><i class="dot" id="dSync"></i>Google sinxron</span><b id="sSync">—</b></div>')}
    // every local save → mark dirty, sync soon (offline: queued)
    const orig=window.save;window.save=function(){const r=orig.apply(this,arguments);SY.dirty=true;if(SY.online===false){SY.status='📴 oflayn · o\'zgarishlar navbatda';ui()}schedule(3000);return r};
    const gb=document.getElementById('gmBtn');if(gb)gb.onclick=()=>window.openModelSettings();
    ui();setTimeout(()=>syncNow(),2500);setTimeout(()=>window.keysAuto&&window.keysAuto(),4500);setInterval(()=>window.keysAuto&&window.keysAuto(),15*60*1000)});

  /* ===== O'Z-O'ZINI TUZATISH: muntazam tekshiruv va avtomatik tuzatish ===== */
  window.selfHeal=async function(loud){const fixed=[],need=[];
    try{const cfg=await N.getCfg();
      for(const p of cfg.providers.filter(x=>x.enabled&&x.hasKey&&!x.local)){
        const t=await N.test(p.id);if(t.ok)continue;const e=String(t.error||'');
        if(/404|not.?found|does not exist|decommission|deprecated|no longer|invalid model|model_not_found/i.test(e)){
          const ml=await N.models(p.id);if(ml&&ml.models&&ml.models.length){const pref=/(flash|gpt-oss|llama-4|llama-3\.3|qwen|kimi|glm|gemma|free)/i;
            const pick=[...ml.models.filter(m=>pref.test(m)),...ml.models].filter((v,i,a)=>a.indexOf(v)===i).slice(0,3);
            await N.setCfg({providers:[{id:p.id,models:pick}]});const t2=await N.test(p.id);
            if(t2.ok)fixed.push(`${p.name}: eskirgan model almashtirildi → ${t2.model}`);else need.push(`${p.name}: model topilmadi (${String(t2.error).slice(0,80)})`)}}
        else if(/401|403|invalid.*key|api key|unauthor/i.test(e))need.push(`${p.name}: kalit yaroqsiz — ⚙ Modellar'da yangi kalit kiriting`);
        else if(/429/.test(e)){/* limit — vaqtincha, o'zi tiklanadi */}
      }
      if(N.gStatus){const g=await N.gStatus();if(g.loggedIn){const r=await N.gapiCall('Google Drive','list_recent_files',{pageSize:1});if(r&&r.error&&/needs_reauth|invalid_grant/.test(r.error.code+r.error.message))need.push('Google: qayta kirish kerak (⚙ → Google bilan kirish)')}}
      if(N.web){const r=await N.web({action:'search',query:'Toshkent ob-havo',limit:3});if(r&&r.error){const r2=await N.web({action:'images',query:'Toshkent',limit:3});if(r2&&r2.error)need.push('Internet qidiruvi javob bermayapti — zaxira kartochkalar ishlaydi')}}
      const errs=(window.__jerr||[]).filter(x=>Date.now()-x.t<86400000);
      if(errs.length>=3&&typeof sample==='function'){const by={};errs.forEach(x=>{by[x.tool]=(by[x.tool]||0)+1});const top=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
        try{const r=await sample(`Sen JARVIS'ning o'z-o'zini tuzatish modulisan. So'nggi xatolar:\n${errs.slice(-15).map(x=>x.tool+': '+x.msg).join('\n')}\nShu xatolar takrorlanmasligi uchun Jarvis amal qiladigan BITTA aniq qoida yoz (o'zbekcha, 1 gap). Foydasiz bo'lsa "-".`,{cache:false,modelTier:'quick'});
          const t=(r.text||'').trim().replace(/^["'\-\s]+|["'\s]+$/g,'');if(t&&t!=='-'&&t.length>8&&t.length<300&&window.addRule){window.addRule(t,'xatolar');fixed.push('xatolardan yangi qoida: '+t.slice(0,80))}}catch(e){}
        window.__jerr=[]}
    }catch(e){need.push('tekshiruv xatosi: '+e.message)}
    try{localStorage.setItem('jarvis_heal',JSON.stringify({at:Date.now(),fixed,need}))}catch(e){}
    try{N.log('SELFHEAL fixed='+fixed.join('; ')+' need='+need.join('; '))}catch(e){}
    if(fixed.length||need.length||loud){addMsg('j','🔧 **O\'z-o\'zini tekshirish**\n'+(fixed.length?'O\'zim tuzatdim:\n'+fixed.map(x=>'- '+x).join('\n')+'\n':'')+(need.length?'Sizning yordamingiz kerak:\n'+need.map(x=>'- '+x).join('\n'):'')+(!fixed.length&&!need.length?'Hammasi joyida, ser.':''))}
    return{fixed,need}};
  setTimeout(()=>{let last=0;try{last=JSON.parse(localStorage.getItem('jarvis_heal')||'{}').at||0}catch(e){}if(Date.now()-last>12*3600*1000)window.selfHeal(false)},90000);
  setInterval(()=>{const n=(window.__jerr||[]).filter(x=>Date.now()-x.t<600000).length;if(n>=4)window.selfHeal(false)},300000);
  setInterval(()=>window.selfHeal(false),12*3600*1000);
  /* avtomatik yangilanish (kompyuter) */
  if(N.updInstall){const upd=async()=>{try{const r=await N.updInstall();if(r&&r.ok&&r.version){
      const d=addMsg('j',`🔄 **Jarvis yangilandi: v${r.version}** — yangi imkoniyatlar qayta ishga tushirilgandan keyin ishlaydi.`);const b=document.createElement('button');b.className='chip w';b.style.marginTop='8px';b.textContent='↻ Hozir qayta ishga tushirish';b.onclick=()=>N.updRestart();d.appendChild(b);
      try{showToast('Yangi versiya v'+r.version+' tayyor','YANGILANISH')}catch(e){}}}catch(e){}};
    setTimeout(upd,25000);setInterval(upd,6*3600*1000)}
  /* kalitlar Google hisobi bilan avtomatik */
  window.keysAuto=async function(loud){if(!N.keysSync)return;try{const r=await N.keysSync();
    if(r&&r.pulled){try{showToast(r.pulled+' ta API kalit Google hisobingizdan yuklandi','KALITLAR')}catch(e){}if(WINS.models){closeWin('models');window.openModelSettings()}}
    else if(loud&&r&&r.ok){try{showToast(r.count?'Kalitlar Google hisobingizga bog\'landi ('+r.count+' ta)':'Google hisobingizda hali kalit yo\'q — bir marta kiriting, keyin hamma qurilmada o\'zi chiqadi','KALITLAR')}catch(e){}}
    return r}catch(e){}};
  /* settings: Google + kalitlar bo'limi */
  const base=window.openModelSettings;
  window.openModelSettings=async function(){await base();const w=WINS.models;if(!w||w.body.querySelector('[data-gbox]'))return;
    const st=await N.gStatus();const cfg=await N.getCfg();
    const box=document.createElement('div');box.className='wmsg';box.style.borderColor='var(--amber)';box.setAttribute('data-gbox','1');
    box.innerHTML=`<div class="h">☁ GOOGLE XOTIRA VA SINXRON</div>
      <div class="t" style="font-size:13px;color:var(--mut)">Jarvis xotirasi (qaydlar, eslatmalar, bilim, Ikkinchi miya, ko'nikmalar) Google Drive'dagi <b>Jarvis xotira/jarvis_xotira.json</b> faylida saqlanadi — veb-Jarvis bilan ham shu fayl. Internet bo'lmasa Jarvis oflayn ishlaydi, o'zgarishlar navbatda turadi va internet qaytishi bilan avtomatik birlashtiriladi.</div>
      <div class="kbm">Holat: <b>${st.loggedIn?'✓ ulangan — '+esc(st.email):st.configured?'kirilmagan':'sozlanmagan'}</b> · ${esc(SY.status)}</div>
      <details ${st.configured?'':'open'} style="margin:6px 0"><summary style="cursor:pointer;color:var(--cy2)">1-qadam: Google Client ID (bir martalik sozlash)</summary>
        <div class="t" style="font-size:13px;color:var(--mut);margin:6px 0">1) <a href="#" data-o="https://console.cloud.google.com/projectcreate">console.cloud.google.com</a> da yangi loyiha yarating ("Jarvis").<br>2) <a href="#" data-o="https://console.cloud.google.com/apis/library/drive.googleapis.com">Google Drive API</a> ni yoqing (Enable).<br>3) <a href="#" data-o="https://console.cloud.google.com/auth/branding">OAuth consent screen</a>: ilova nomi "Jarvis", turi <b>External</b>, o'z emailingiz; "Audience" bo'limida <b>Publish app</b> (In production) ni bosing — aks holda har 7 kunda qayta kirish kerak bo'ladi.<br>4) <a href="#" data-o="https://console.cloud.google.com/auth/clients">Clients</a> → Create client → turi <b>Desktop app</b> → Client ID va Client Secret ni shu yerga qo'ying.<br>Kirishda "Google hasn't verified this app" chiqsa: <b>Advanced → Go to Jarvis</b> (bu o'zingizning ilovangiz).</div>
        <div class="addrow"><input data-cid placeholder="${window.JARVIS_MOBILE?'Kompyuterdagi JRV1: kodini shu yerga joylang (yoki Client ID)':'Client ID (…apps.googleusercontent.com)'}" value="${esc(cfg.google.clientId)}"></div>
        <div class="addrow"><input data-csec type="password" placeholder="Client Secret" value="${cfg.google.hasSecret?'••••••••':''}"><button data-gsave>Saqlash</button></div></details>
      <div class="wact">${st.loggedIn?'<button data-gsync>🔄 Hozir sinxronlash</button><button data-gout>Chiqish</button>':'<button class="w" data-glogin>🔑 Google bilan kirish</button>'}${(!window.JARVIS_MOBILE&&st.configured&&N.gPhoneCode)?'<button data-pcode>📱 Telefon uchun kod</button>':''}</div>
      <div class="t" style="font-size:13px;color:var(--cy2);margin-top:4px">🔑 <b>API kalitlar endi avtomatik:</b> Google hisobingiz bilan kirgan zahoti barcha kalitlar shu qurilmaga o'zi yuklanadi, yangi kalit kiritsangiz hamma qurilmaga o'zi tarqaladi. Kalitlar Drive'dagi <b>Jarvis xotira/jarvis_kalitlar.json</b> faylida shifrlangan; ularni faqat shu Google hisobga kira olgan odam ocha oladi.</div>
      <div class="h" style="margin-top:8px">🔐 KALITLAR + FACE ID'NI GOOGLE XOTIRADA SAQLASH</div>
      <div class="t" style="font-size:13px;color:var(--mut)">Kalitlar, <b>yuzingiz (Face ID)</b> va ovoz namunangiz siz tanlagan <b>parol</b> bilan shifrlanib (AES-256) xotira fayliga qo'shiladi. Parolsiz hech kim — Google ham — ularni o'qiy olmaydi. Boshqa kompyuterda Jarvisga kirib, shu parolni kiritsangiz kalitlar tiklanadi. Parolni unutmang — uni tiklab bo'lmaydi.</div>
      <div class="addrow"><input data-pass type="password" placeholder="Parol (kamida 6 belgi)"><button data-exp>⬆ Saqlash</button><button data-imp>⬇ Tiklash</button></div>
      <div class="kbm" data-sres>${S.secrets&&S.secrets.blob?'Google xotirada shifrlangan kalitlar bor ('+new Date(S.secrets.at).toLocaleString('ru-RU')+').':'Hali saqlanmagan.'}</div>`;
    w.body.prepend(box);
    box.querySelectorAll('[data-o]').forEach(a=>a.onclick=e=>{e.preventDefault();N.open(a.dataset.o)});
    const q=s=>box.querySelector(s),res=q('[data-sres]');
    if(q('[data-pcode]'))q('[data-pcode]').onclick=async e=>{const r=await N.gPhoneCode();if(r.error){res.textContent='✕ '+r.error;return}try{await navigator.clipboard.writeText(r.code)}catch(er){}let tg=false;try{tg=await N.tgNotify('📱 Telefondagi Jarvis uchun ulanish kodi (Sozlash → Google → 1-qadam maydoniga joylang):\n\n'+r.code)}catch(er){}res.textContent='✓ Kod nusxalandi'+(tg?' va Telegram\'ingizga yuborildi':'')+'. Telefonda: Sozlash → GOOGLE → 1-qadam maydoniga joylang → Saqlash → Google bilan kirish.'};
    q('[data-gsave]').onclick=async()=>{await N.gSetClient({clientId:q('[data-cid]').value,clientSecret:q('[data-csec]').value});closeWin('models');window.openModelSettings()};
    if(q('[data-glogin]'))q('[data-glogin]').onclick=async e=>{e.target.textContent='⏳ Brauzerda ruxsat bering…';const r=await N.gLogin();if(r.error){e.target.textContent='🔑 Google bilan kirish';res.textContent='✕ '+r.error;return}closeWin('models');try{await window.keysAuto(true)}catch(er){}try{await initGoogle();preloadSchemas()}catch(er){}await syncNow(true);window.openModelSettings()};
    if(q('[data-gsync]'))q('[data-gsync]').onclick=async e=>{e.target.textContent='⏳…';await syncNow(true);e.target.textContent='🔄 Hozir sinxronlash';res.textContent='Holat: '+SY.status};
    if(q('[data-gout]'))q('[data-gout]').onclick=async()=>{await N.gLogout();closeWin('models');window.openModelSettings()};
    q('[data-exp]').onclick=async()=>{const r=await N.secExport(q('[data-pass]').value,window.__secExtra?window.__secExtra():null);if(r.error){res.textContent='✕ '+r.error;return}
      S.secrets={at:Date.now(),blob:r.blob};save();q('[data-pass]').value='';res.textContent=`✓ ${r.count} ta kalit shifrlandi va Google xotiraga yuboriladi.`;syncNow(true)};
    q('[data-imp]').onclick=async()=>{if(!S.secrets||!S.secrets.blob){res.textContent='Google xotirada kalit topilmadi — avval Google bilan kiring va sinxronlang.';return}
      const r=(window.__secImportPost||(x=>x))(await N.secImport(S.secrets.blob,q('[data-pass]').value));if(r.error){res.textContent='✕ '+r.error;return}
      q('[data-pass]').value='';closeWin('models');window.openModelSettings();try{showToast(r.count+' ta kalit tiklandi','KALITLAR')}catch(e){}}};
})();

/* ================= DESKTOP: TINIQ OVOZ (Gemini TTS) + FACE ID + OVOZNI TANISH ================= */
(function(){
  if(!window.jarvisNative)return;const N=window.jarvisNative;
  /* ---- tts namespace (Gemini → Windows fallback) ---- */
  const VMAP={buttery:'Charon',rounded:'Orus',glassy:'Kore',airy:'Aoede'};
  const T={L:[],src:null,ctx:null,stopped:false,rate:1};
  const st=(s,reason)=>T.L.forEach(f=>{try{f({state:s,reason})}catch(e){}});
  function pcmToBuffer(b64,rate){const bin=atob(b64);const n=bin.length/2|0;T.ctx=T.ctx||new AudioContext();const buf=T.ctx.createBuffer(1,n,rate);const ch=buf.getChannelData(0);
    for(let i=0;i<n;i++){let v=bin.charCodeAt(2*i)|(bin.charCodeAt(2*i+1)<<8);if(v>=32768)v-=65536;ch[i]=v/32768}return buf}
  function play(buf){return new Promise(res=>{const s=T.ctx.createBufferSource();s.buffer=buf;s.playbackRate.value=T.rate;s.connect(T.ctx.destination);s.onended=res;T.src=s;s.start()})}
  function winSpeak(text){return new Promise(res=>{if(!('speechSynthesis' in window))return res();const u=new SpeechSynthesisUtterance(text);
    const vs=speechSynthesis.getVoices();u.voice=vs.find(v=>/^uz/i.test(v.lang))||vs.find(v=>/^(kk|tr)/i.test(v.lang))||vs.find(v=>/^ru/i.test(v.lang))||null;u.rate=T.rate;u.onend=u.onerror=res;speechSynthesis.speak(u);setTimeout(res,Math.min(120000,text.length*95/T.rate+3000))})}
  function parts(text){const out=[];let cur='';(text.match(/[^.!?…]+[.!?…]*\s*/g)||[text]).forEach(p=>{if((cur+p).length>600&&cur){out.push(cur);cur=''}cur+=p});if(cur.trim())out.push(cur);return out}
  const tts={async speak(arg,o){const lines=typeof arg==='string'?[{text:arg,...(o||{})}]:arg;const text=lines.map(l=>l.text).join(' ').trim();if(!text)return;
      if(lines[0].rate)T.rate=lines[0].rate;const voice=VMAP[lines[0].voice]||lines[0].voice||'Charon';
      T.stopped=false;st('speaking');
      const ev=(()=>{try{return localStorage.getItem('jarvis_edgeVoice')||'madina'}catch(e){return 'madina'}})();
      if(N.voiceSay&&ev!=='off'){try{const r=await N.voiceSay({text,voice:ev,rate:T.rate});if(r&&(r.ok||r.stopped||T.stopped)){st('idle',T.stopped?'viewer_stopped':'completed');return}if(r&&r.error&&!T.edgeWarned){T.edgeWarned=1;console.warn('Edge ovozi:',r.error)}}catch(e){}}
      if(T.stopped){st('idle','viewer_stopped');return}
      try{const ps=parts(text);let next=N.ttsGemini(ps[0],voice);
        for(let i=0;i<ps.length;i++){const r=await next;if(T.stopped)break;if(i+1<ps.length)next=N.ttsGemini(ps[i+1],voice);
          if(r.error){if(!/^(off|no_key|cooldown)$/.test(r.error))console.warn('TTS:',r.error);await winSpeak(ps.slice(i).join(' '));break}
          await play(pcmToBuffer(r.pcm,r.rate))}
      }finally{st('idle',T.stopped?'viewer_stopped':'completed')}},
    add(arg){return tts.speak(arg)},
    stop(){T.stopped=true;try{N.voiceStop&&N.voiceStop()}catch(e){}try{T.src&&T.src.stop()}catch(e){}try{speechSynthesis.cancel()}catch(e){}},
    setRate(r){T.rate=r;try{T.src.playbackRate.value=r}catch(e){}},
    onState(f){T.L.push(f)},onLine(){},onPosition(){},pause(){try{T.ctx.suspend()}catch(e){}},resume(){try{T.ctx.resume()}catch(e){}}};
  const prevUse=window.claude.use;window.claude.use=async n=>n==='tts'?tts:prevUse(n);


  /* ---- helpers ---- */
  const loadJS=src=>new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)});
  const LS=(k,v)=>{if(v===undefined){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}}localStorage.setItem(k,JSON.stringify(v))};
  async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('jarvis:'+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

  /* ---- FACE ID ---- */
  const F=window.FACE=Object.assign({ready:false,lockStart:true,lockSensitive:true},LS('jarvis_face_cfg')||{});
  const saveF=()=>LS('jarvis_face_cfg',{lockStart:F.lockStart,lockSensitive:F.lockSensitive});
  async function faceLoad(){if(F.ready)return;await loadJS('vendor/face-api.js');const M='vendor/model';const tf=faceapi.tf;
    let okB=false;try{okB=await tf.setBackend('webgl');await tf.ready()}catch(e){okB=false}if(!okB||tf.getBackend()!=='webgl'){await tf.setBackend('cpu');await tf.ready()}
    await faceapi.nets.tinyFaceDetector.loadFromUri(M);await faceapi.nets.faceLandmark68TinyNet.loadFromUri(M);await faceapi.nets.faceRecognitionNet.loadFromUri(M);F.ready=true}
  function overlay(title){const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;z-index:100;background:rgba(2,6,12,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Rajdhani,sans-serif;color:#d6f3ff';
    o.innerHTML=`<div style="font:900 18px Orbitron;letter-spacing:.3em;color:#8be9ff">${title}</div><div style="position:relative;width:320px;height:240px;border:2px solid #3fd2ff;border-radius:12px;overflow:hidden;box-shadow:0 0 30px rgba(63,210,255,.4)"><video autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video><div class="scan" style="position:absolute;left:0;right:0;height:3px;background:#46f0a6;box-shadow:0 0 12px #46f0a6;top:0;animation:fscan 2s linear infinite"></div></div>
      <div class="msg2" style="font-size:17px;min-height:22px">Kamera ishga tushmoqda…</div><div class="pinrow" style="display:none;gap:6px"><input type="password" inputmode="numeric" placeholder="Zaxira PIN" style="background:#000;border:1px solid #3fd2ff;color:#fff;padding:8px;font-size:16px;width:150px"><button style="background:#0b2a3a;border:1px solid #3fd2ff;color:#8be9ff;padding:8px 14px;cursor:pointer">Kirish</button></div>
      <button class="cancel" style="background:none;border:1px solid #555;color:#999;padding:6px 14px;cursor:pointer">Bekor qilish</button><style>@keyframes fscan{0%{top:0}50%{top:237px}100%{top:0}}</style>`;
    document.body.appendChild(o);return o}
  async function camera(o){const s=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480}});const v=o.querySelector('video');v.srcObject=s;await new Promise(r=>v.onloadeddata=r);return{v,stop:()=>s.getTracks().forEach(t=>t.stop())}}
  async function descriptor(v){const d=await faceapi.detectSingleFace(v,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5})).withFaceLandmarks(true).withFaceDescriptor();return d&&d.descriptor}
  window.faceEnroll=async function(){const o=overlay('FACE ID — YUZNI O\'RGATISH');const msg=o.querySelector('.msg2');let cam;
    try{await faceLoad();cam=await camera(o);const ds=[];msg.textContent='Kameraga to\'g\'ri qarang, boshingizni sekin u yoq-bu yoqqa buring…';
      const t0=Date.now();while(ds.length<6&&Date.now()-t0<30000){const d=await descriptor(cam.v);if(d){ds.push(Array.from(d));msg.textContent=`Namuna: ${ds.length}/6`}await new Promise(r=>setTimeout(r,500))}
      if(ds.length<6)throw new Error('Yuz aniqlanmadi — yorug\'roq joyda qayta urinib ko\'ring.');
      const mean=ds[0].map((_,i)=>ds.reduce((s,d)=>s+d[i],0)/ds.length);
      let pin='';while(!/^\d{4,8}$/.test(pin)){pin=await askPin(o,'Zaxira PIN o\'rnating (4–8 raqam) — kamera ishlamasa kerak bo\'ladi');if(pin===null)throw new Error('Bekor qilindi')}
      LS('jarvis_face',{d:ds,mean,pin:await sha(pin),at:Date.now()});msg.textContent='✓ Yuzingiz saqlandi';await new Promise(r=>setTimeout(r,900));return true}
    catch(e){msg.textContent='✕ '+(e.message||e);await new Promise(r=>setTimeout(r,2200));return false}finally{cam&&cam.stop();o.remove()}};
  function askPin(o,label){return new Promise(res=>{const row=o.querySelector('.pinrow');row.style.display='flex';const i=row.querySelector('input');i.placeholder=label.length<30?label:'PIN';o.querySelector('.msg2').textContent=label;i.value='';i.focus();
    const go=()=>{row.style.display='none';res(i.value)};row.querySelector('button').onclick=go;i.onkeydown=e=>{if(e.key==='Enter')go()};o.querySelector('.cancel').onclick=()=>res(null)})}
  window.faceVerify=async function(reason,mandatory){const prof=LS('jarvis_face');if(!prof)return true;
    const o=overlay('FACE ID'+(reason?' — '+reason:''));const msg=o.querySelector('.msg2');let cam,ok=false,done=false;
    if(mandatory)o.querySelector('.cancel').style.display='none';
    const pinTry=async()=>{const p=await askPin(o,'Zaxira PIN');if(p===null){if(!mandatory){done=true}return}if(await sha(p)===prof.pin){ok=true;done=true}else msg.textContent='✕ PIN noto\'g\'ri'};
    o.querySelector('.cancel').onclick=()=>{done=true};
    try{await faceLoad();cam=await camera(o);msg.textContent='Kameraga qarang…';const t0=Date.now();
      setTimeout(()=>{if(!done){o.querySelector('.pinrow').style.display='flex';o.querySelector('.pinrow button').onclick=async()=>{const i=o.querySelector('.pinrow input');if(await sha(i.value)===prof.pin){ok=true;done=true}else msg.textContent='✕ PIN noto\'g\'ri'}}},6000);
      while(!done&&Date.now()-t0<(mandatory?1e9:25000)){const d=await descriptor(cam.v);
        if(d){const dist=Math.min(...prof.d.map(x=>Math.sqrt(x.reduce((s,v,i)=>s+(v-d[i])**2,0))));
          if(dist<0.48){ok=true;msg.textContent='✓ Tanildi — xush kelibsiz, ser';await new Promise(r=>setTimeout(r,600));break}
          msg.textContent='Yuz tanilmadi ('+dist.toFixed(2)+')';}
        else if(!done)msg.textContent='Yuz ko\'rinmayapti…';await new Promise(r=>setTimeout(r,350))}
    }catch(e){msg.textContent='Kamera ishlamadi: '+(e.message||e);while(!done)await pinTry()}
    finally{cam&&cam.stop();o.remove()}
    try{act(ok?'🙂 Face ID: tasdiqlandi':'✕ Face ID: rad etildi',ok?'':'e')}catch(e){}return ok};
  async function gate(reason){if(!LS('jarvis_face')||!F.lockSensitive)return true;return window.faceVerify(reason)}
  window.faceGate=gate;

  /* ---- OVOZNI TANISH (eksperimental) ---- */
  const VP=window.VOICEPRINT=Object.assign({on:false,thr:0.8},LS('jarvis_vp_cfg')||{});
  const saveVP=()=>LS('jarvis_vp_cfg',{on:VP.on,thr:VP.thr});
  async function vpFeat(blob){await loadJS('vendor/meyda.min.js');const ac=new (window.OfflineAudioContext||AudioContext)(1,16000,16000);
    const ab=await (new AudioContext()).decodeAudioData(await blob.arrayBuffer());const x=ab.getChannelData(0),sr=ab.sampleRate;
    Meyda.sampleRate=sr;Meyda.bufferSize=1024;Meyda.numberOfMFCCCoefficients=14;const fr=[];
    for(let i=0;i+1024<x.length;i+=512){const f=x.slice(i,i+1024);let e=0;for(const v of f)e+=v*v;if(Math.sqrt(e/1024)<0.015)continue;const m=Meyda.extract('mfcc',f);if(m)fr.push(m.slice(1))}
    if(fr.length<20)return null;const d=fr[0].length;const mean=Array(d).fill(0),sd=Array(d).fill(0);
    fr.forEach(f=>f.forEach((v,i)=>mean[i]+=v/fr.length));fr.forEach(f=>f.forEach((v,i)=>sd[i]+=(v-mean[i])**2/fr.length));return mean.concat(sd.map(Math.sqrt))}
  const cos=(a,b)=>{let s=0,na=0,nb=0;for(let i=0;i<a.length;i++){s+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return s/Math.sqrt(na*nb)};
  window.voiceCheck=async function(blob){const p=LS('jarvis_vp');if(!VP.on||!p)return true;try{const f=await vpFeat(blob);if(!f)return true;const s=Math.max(...p.map(x=>cos(x,f)));
    try{act(`🎙 ovoz o\'xshashligi ${(s*100|0)}%`+(s<VP.thr?' — begona, e\'tiborsiz':''),s<VP.thr?'w':'')}catch(e){}return s>=VP.thr}catch(e){return true}};
  window.voiceEnroll=async function(statusEl){const prof=[];const st=navigator.mediaDevices.getUserMedia({audio:true});const s=await st;
    try{for(let k=0;k<3;k++){statusEl.textContent=`${k+1}/3: "Jarvis, bugungi ishlarimni ko'rsat" deb 4 soniya gapiring…`;
      const rec=new MediaRecorder(s);const ch=[];rec.ondataavailable=e=>ch.push(e.data);rec.start();await new Promise(r=>setTimeout(r,4200));await new Promise(r=>{rec.onstop=r;rec.stop()});
      const f=await vpFeat(new Blob(ch,{type:rec.mimeType}));if(f)prof.push(f);else k--;}
      LS('jarvis_vp',prof);VP.on=true;saveVP();statusEl.textContent='✓ Ovozingiz saqlandi. "Jarvis" kutish rejimida begona ovozlar e\'tiborsiz qoldiriladi.'}
    finally{s.getTracks().forEach(t=>t.stop())}};

  /* ---- startup lock & sensitive actions ---- */
  document.addEventListener('DOMContentLoaded',()=>{
    if(LS('jarvis_face')&&F.lockStart)setTimeout(()=>window.faceVerify('Jarvisga kirish',true),300);
    const wrapClick=(id,reason,cond)=>{const el=document.getElementById(id);if(!el)return;const orig=el.onclick;el.onclick=async e=>{if((!cond||cond())&&!(await gate(reason)))return;orig&&orig.call(el,e)}};
    setTimeout(()=>{wrapClick('unlock','Himoya qulfini ochish');wrapClick('lockBtn','Himoya qulfini ochish',()=>S.locked)},500);
    const base=window.openModelSettings;window.openModelSettings=async function(){if(!(await gate('Sozlamalar va kalitlar')))return;await base();addSecSections()};
  });
  async function addSecSections(){const w=WINS.models;if(!w||w.body.querySelector('[data-sec2]'))return;const tc=await N.ttsCfg();
    const box=document.createElement('div');box.className='wmsg';box.setAttribute('data-sec2','1');box.style.borderColor='var(--green)';const hasFace=!!LS('jarvis_face'),hasVP=!!LS('jarvis_vp');
    box.innerHTML=`<div class="h">🎙 JARVIS OVOZI — TABIIY O'ZBEK</div><div class="t" style="font-size:13px;color:var(--mut)">Asosiy ovoz: Microsoft Edge'ning tabiiy o'zbek ovozi (bepul, internet kerak). Ishlamasa, pastdagi Gemini, so'ng Windows ovozi ishlaydi.</div>
      <div class="addrow"><select data-ev style="flex:1"><option value="madina">👩 Madina</option><option value="sardor">👨 Sardor</option><option value="off">O'chiq (Gemini / Windows)</option></select><button data-evt>▶ Sinash</button></div><div data-evs style="font-size:12px;color:var(--mut)"></div>
      <div class="h" style="margin-top:12px">🔊 ZAXIRA OVOZ (Gemini)</div><div class="t" style="font-size:13px;color:var(--mut)">Google Gemini kaliti bilan odamnikiga o'xshash tiniq, ravon ovoz. Limit tugasa yoki internet bo'lmasa Windows ovozi ishlaydi. Ovoz turini chapdagi "Ovoz" menyusidan tanlang.</div>
      <div class="addrow"><label class="toggle"><input type="checkbox" data-tton ${tc.ttsOn?'checked':''}> yoqilgan</label><input data-ttm value="${esc(tc.ttsModel)}"><button data-tts>▶ Sinash</button></div>
      <div class="h" style="margin-top:10px">🙂 FACE ID</div><div class="t" style="font-size:13px;color:var(--mut)">Yuzingiz faqat shu kompyuterda raqamli belgi ko'rinishida saqlanadi (rasm saqlanmaydi). Kamera ishlamasa — zaxira PIN.</div>
      <div class="wact"><button data-fe>${hasFace?'🔁 Qayta o\'rgatish':'📷 Yuzimni o\'rgatish'}</button>${hasFace?'<button data-ft>✓ Sinash</button><button data-fd>✕ O\'chirish</button>':''}</div>
      <label class="toggle"><input type="checkbox" data-fs ${F.lockStart?'checked':''}> Jarvis ochilganda yuz bilan kirish</label>
      <label class="toggle"><input type="checkbox" data-fz ${F.lockSensitive?'checked':''}> Sozlamalar, kalitlar va himoya qulfini ochishda yuz so'rash</label>
      <div class="h" style="margin-top:10px">🎙 OVOZIMNI TANISH (eksperimental)</div><div class="t" style="font-size:13px;color:var(--mut)">"Jarvis" kutish rejimida faqat sizning ovozingizga javob berishga harakat qiladi. Bu qulaylik uchun, xavfsizlik emas — ovozni yozib olib aldash mumkin. Faollik jurnalida o'xshashlik foizi ko'rinadi — shunga qarab sezgirlikni sozlang.</div>
      <div class="wact"><button data-ve>${hasVP?'🔁 Qayta o\'rgatish':'🎙 Ovozimni o\'rgatish'}</button>${hasVP?'<button data-vd>✕ O\'chirish</button>':''}</div>
      <label class="toggle"><input type="checkbox" data-von ${VP.on?'checked':''}> yoqilgan</label>
      <div class="vrow"><label>Sezgirlik <b data-vthv>${Math.round(VP.thr*100)}%</b></label><input type="range" min="0.6" max="0.97" step="0.01" value="${VP.thr}" data-vth></div>
      <div class="kbm" data-sres2></div>`;
    w.body.prepend(box);const q=s=>box.querySelector(s),res=q('[data-sres2]');
    {const ev=q('[data-ev]'),evs=q('[data-evs]');try{ev.value=localStorage.getItem('jarvis_edgeVoice')||'madina'}catch(e){}ev.onchange=()=>{try{localStorage.setItem('jarvis_edgeVoice',ev.value)}catch(e){}const m=document.getElementById('vEdge');if(m)m.value=ev.value};
      q('[data-evt]').onclick=async()=>{try{localStorage.setItem('jarvis_edgeVoice',ev.value)}catch(e){}evs.textContent='⏳ Tekshirilmoqda (birinchi marta 5–15 soniya)…';const r=await N.voiceSay({text:'Assalomu alaykum, ser. Men Jarvisman. Qurilish, hujjat, qaror — barchasini ravon o\'qiyman.',voice:ev.value==='off'?'madina':ev.value,rate:1});
        if(r&&/edge_not_found|no_edge/.test(r.error||'')&&N.edgeInstall){evs.innerHTML='✕ Microsoft Edge o\'rnatilmagan. <button data-ein style="margin-left:6px">⬇ Edge\'ni o\'rnatish</button>';evs.querySelector('[data-ein]').onclick=async()=>{evs.textContent='⏳ Edge o\'rnatilmoqda (2–5 daqiqa, Windows ruxsat so\'rasa — "Да" ni bosing)…';const x=await N.edgeInstall();evs.textContent=x&&x.ok?'✓ Edge o\'rnatildi — endi ▶ Sinash ni bosing':'✕ '+((x&&x.error)||'o\'rnatilmadi')};return}
        evs.textContent=r&&r.ok?'✓ Tabiiy ovoz ishlayapti'+(r.voice?' ('+r.voice.replace(/^Microsoft /,'')+')':''):'✕ Ishlamadi: '+({no_edge:'Microsoft Edge topilmadi',edge_not_found:'Microsoft Edge topilmadi — microsoft.com/edge dan o\'rnating',edge_page_not_loaded:'Edge ochildi, lekin ovoz sahifasi yuklanmadi',edge_exited:'Edge darhol yopilib qoldi',no_uz_voice:'o\'zbek ovozi topilmadi — internetni tekshiring',not_started:'Edge ovozni boshlamadi',timeout:'javob kelmadi'}[r&&r.error]||(r&&r.error)||'noma\'lum')}}
    q('[data-tton]').onchange=e=>N.ttsCfg({ttsOn:e.target.checked});q('[data-ttm]').onchange=e=>N.ttsCfg({ttsModel:e.target.value});
    q('[data-tts]').onclick=async()=>{await N.ttsCfg({ttsModel:q('[data-ttm]').value,ttsOn:q('[data-tton]').checked});const r=await N.ttsGemini('Assalomu alaykum, ser. Men Jarvisman. Qurilish, qog\'oz, qaror — barchasini aniq o\'qiyman.','Charon');
      if(r.error){res.textContent='✕ Gemini ovozi: '+r.error+' — Windows ovozi ishlatiladi.';return}res.textContent='✓ Gemini ovozi ishlayapti';try{await tts.speak('Assalomu alaykum, ser. Men Jarvisman. Qurilish, qog\'oz, qaror — barchasini aniq o\'qiyman.')}catch(e){}};
    q('[data-fe]').onclick=async()=>{if(await window.faceEnroll()){closeWin('models');window.openModelSettings()}};
    if(q('[data-ft]'))q('[data-ft]').onclick=async()=>{res.textContent=(await window.faceVerify('Sinov'))?'✓ Tanildi':'✕ Tanilmadi'};
    if(q('[data-fd]'))q('[data-fd]').onclick=()=>{localStorage.removeItem('jarvis_face');closeWin('models');window.openModelSettings()};
    q('[data-fs]').onchange=e=>{F.lockStart=e.target.checked;saveF()};q('[data-fz]').onchange=e=>{F.lockSensitive=e.target.checked;saveF()};
    q('[data-ve]').onclick=async()=>{try{await window.voiceEnroll(res)}catch(e){res.textContent='✕ '+(e.message||e)}};
    if(q('[data-vd]'))q('[data-vd]').onclick=()=>{localStorage.removeItem('jarvis_vp');VP.on=false;saveVP();closeWin('models');window.openModelSettings()};
    q('[data-von]').onchange=e=>{VP.on=e.target.checked;saveVP()};q('[data-vth]').oninput=e=>{VP.thr=+e.target.value;q('[data-vthv]').textContent=Math.round(VP.thr*100)+'%';saveVP()};
    const tts=await window.claude.use('tts')}
})();

/* ================= DESKTOP: KOMPYUTERNI BOSHQARISH + YUZNI GOOGLE'DA SAQLASH ================= */
(function(){
  if(!window.jarvisNative)return;const N=window.jarvisNative;
  document.addEventListener('DOMContentLoaded',()=>{
    if(typeof TOOLS==='undefined')return;
    TOOLS.push({name:'pc',description:'Foydalanuvchining kompyuterida ishlash (Windows). action: open_app (name: word, excel, chrome, telegram, kalkulyator, autocad… yoki dastur nomi/URL), open_path (path — fayl/papkani ochish), show_in_folder (path), list_dir (path), find_files (query — Ish stoli, Hujjatlar, Yuklamalar, OneDrive ichidan nomi bo\'yicha qidirish; root ixtiyoriy), read_file (path — matnli fayllar), write_text_file (name yoki path, text — Ish stoliga saqlaydi), system_info, powershell (command — istalgan Windows buyrug\'i; foydalanuvchi har safar tasdiqlaydi). Avval find_files bilan yo\'lni aniqla.',
      inputSchema:{type:'object',properties:{action:{type:'string',enum:['open_app','open_path','show_in_folder','list_dir','find_files','read_file','write_text_file','system_info','powershell']},name:{type:'string'},path:{type:'string'},query:{type:'string'},root:{type:'string'},text:{type:'string'},command:{type:'string'}},required:['action']},
      execute:async a=>{
        if(S.locked)throw new Error('Himoya rejimi yoqilgan — kompyuterni boshqarish bloklangan.');
        const risky=a.action==='powershell'||a.action==='write_text_file';
        if(risky){const ok=await aiConfirm(a.action==='powershell'?'POWERSHELL BUYRUG\'I':'FAYL YOZISH',a.action==='powershell'?'Jarvis kompyuteringizda quyidagi buyruqni bajarmoqchi. Ruxsat berasizmi?':'Jarvis fayl yozmoqchi. Ruxsat berasizmi?',a.command||((a.path||a.name||'')+'\n\n'+(a.text||'').slice(0,800)));
          if(!ok){act('✋ pc.'+a.action+' — rad etildi','w');throw new Error('Foydalanuvchi rad etdi.')}}
        act('🖥 pc.'+a.action+(a.name?' '+a.name:a.query?' "'+a.query+'"':a.path?' '+a.path.split(/[\\/]/).pop():''),risky?'w':'');
        const r=await N.pc(a);if(r&&r.error)throw new Error(r.error);return shortJSON(r,9000)}});
  });
  /* yuz va ovoz namunasini kalitlar bilan birga shifrlab Google'ga yuborish */
  const LS=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
  window.__secExtra=()=>({face:LS('jarvis_face'),vp:LS('jarvis_vp'),faceCfg:LS('jarvis_face_cfg'),vpCfg:LS('jarvis_vp_cfg')});
  window.__secImportPost=r=>{if(r&&r.ok&&r.extra){const x=r.extra;
    if(x.face)localStorage.setItem('jarvis_face',JSON.stringify(x.face));if(x.vp)localStorage.setItem('jarvis_vp',JSON.stringify(x.vp));
    if(x.faceCfg)localStorage.setItem('jarvis_face_cfg',JSON.stringify(x.faceCfg));if(x.vpCfg)localStorage.setItem('jarvis_vp_cfg',JSON.stringify(x.vpCfg))}return r};
})();

/* ================= DESKTOP: INTERNET VOSITASI + TELEGRAM ================= */
(function(){
  if(!window.jarvisNative)return;const N=window.jarvisNative;
  document.addEventListener('DOMContentLoaded',()=>{
    if(typeof TOOLS==='undefined')return;
    TOOLS.push({name:'web',description:'Internetdan O\'ZING top va ko\'rsat: search (query — veb sahifalar: sarlavha, havola, qisqa matn), images (query — rasmlar), videos (query — YouTube videolar), fetch_url (url — sahifani to\'liq o\'qish), wiki (query, lang: uz|ru|en), news (source: kun|daryo|gazeta|uza), weather (city). search/images/videos natijalari foydalanuvchiga Jarvis ichida rasm/video/kartochka bo\'lib o\'zi ko\'rsatiladi — sen faqat eng yaxshilarini qisqa izohla. Rasm so\'ralsa — images, video so\'ralsa — videos, ma\'lumot/variant so\'ralsa — search (+kerak bo\'lsa fetch_url).',
      inputSchema:{type:'object',properties:{action:{type:'string',enum:['search','images','videos','fetch_url','wiki','news','weather']},city:{type:'string'},source:{type:'string'},limit:{type:'number'},url:{type:'string'},query:{type:'string'},lang:{type:'string'}},required:['action']},
      execute:async a=>{act('🌐 web.'+a.action+' '+(a.city||a.source||a.query||a.url||''));const r=await N.web(a);
        if(r&&r.error&&/^(search|images|videos)$/.test(a.action)){try{window.showMedia('results',window.searchLinks(a.query||'',a.action==='search'?'pages':a.action),a.query)}catch(e){}
          return 'Bevosita natija olinmadi ('+r.error+'), shuning uchun foydalanuvchiga qidiruv kartochkalari ko\'rsatildi. Boshqa so\'z bilan yana bir marta urinib ko\'r; texnik xatoni foydalanuvchiga aytma — eng yaxshi variantlarni o\'zing tavsiya qil.'}
        if(r&&r.error)throw new Error(r.error);
        try{if(r.images)window.showMedia('images',r.images,a.query);if(r.videos)window.showMedia('videos',r.videos,a.query);if(r.results)window.showMedia('results',r.results,a.query)}catch(e){}
        if(r.images)return shortJSON({korsatildi:r.images.length+' ta rasm foydalanuvchiga ko\'rsatildi',rasmlar:r.images.slice(0,12).map(x=>({title:x.title,site:x.site}))},4000);
        if(r.videos)return shortJSON({korsatildi:r.videos.length+' ta video foydalanuvchiga ko\'rsatildi',videolar:r.videos.map(x=>({title:x.title,channel:x.channel,duration:x.duration,views:x.views,url:x.url}))},5000);
        if(r.results)return shortJSON({korsatildi:r.results.length+' ta sahifa kartochka bo\'lib ko\'rsatildi',natijalar:r.results},8000);
        return shortJSON(r,10000)}});
    // Telegram: incoming messages from phone
    if(N.onTg)N.onTg(async m=>{const um=addMsg('u','📱 '+m.text);let ans='';const imgs=[];let extra='';window.__madeFiles=[];
      try{if(!m.file&&voiceControl(m.text)){N.tgReply(m.id,'✓ Bajarildi.');return}
        if(m.file){const bl=b64toBlob(m.file.b64,m.file.mime||'');
          if(/^image\//.test(m.file.mime)||/\.(jpe?g|png|webp)$/i.test(m.file.name)){imgs.push(bl);const im=document.createElement('img');im.src=URL.createObjectURL(bl);im.style.cssText='width:84px;height:84px;object-fit:cover;border-radius:8px;display:block;margin-top:6px';um.appendChild(im)}
          else{const fl=new File([bl],m.file.name,{type:m.file.mime||''});try{regFile(m.file.name,new Uint8Array(await bl.arrayBuffer()),m.file.mime)}catch(e){}
            let tx='';try{tx=(await extractText(fl)).slice(0,60000)}catch(e){tx='(o\'qib bo\'lmadi: '+e.message+')'}
            extra='\n\n[Biriktirilgan fayl: '+m.file.name+(/\.(docx|xlsx)$/i.test(m.file.name)?' — asl formatida tahrirlash uchun documents vositasida file="'+m.file.name+'"':'')+']\n"""\n'+tx+'\n"""';
            const d2=document.createElement('div');d2.className='udoc';d2.textContent='📄 '+m.file.name;um.appendChild(d2)}}
        const now=new Date();const d=addMsg('j','…');S.curMsg=d;
        const r=await sample(sysPrompt()+`\n\n[Hozir: ${fmtDate(now)}, ${pad(now.getHours())}:${pad(now.getMinutes())}]\n[Foydalanuvchi Telegram orqali telefondan yozmoqda — javobni qisqa, markdown belgilarsiz yoz. Yaratilgan yoki tahrirlangan fayllar unga Telegram'da avtomatik yuboriladi.]\n\n---\nFoydalanuvchi: `+m.text+extra,{tools:allTools(),cache:false,modelTier:'default',...(imgs.length?{images:imgs}:{})});
        ans=(r.text||'').replace(/\*\*/g,'');setBody(d,r.text||'');try{chatLog('u','📱 Telegram: '+m.text);chatLog('j',ans)}catch(e){}S.history.push({role:'user',content:m.text+(m.file?' [fayl: '+m.file.name+']':'')},{role:'assistant',content:ans});noteExchange()}
      catch(e){ans=e&&e.code==='offline'?'📴 Internet yo\'q: '+localBrain(m.text):'✕ '+(e&&e.message||e)}
      N.tgReply(m.id,ans||'…');
      const made=window.__madeFiles||[];window.__madeFiles=null;
      for(const f of made){try{const b64=await b2b64(f.blob);await N.tgSendFile({name:f.name,b64,mime:f.blob.type,caption:'📄 '+f.name})}catch(e){}}});
    if(N.onTgPaired)N.onTgPaired(n=>{try{showToast('Telegram ulandi: '+n,'TELEGRAM');act('📱 Telegram ulandi')}catch(e){}if(WINS.models){closeWin('models');window.openModelSettings()}});
  });
  // settings section
  const base=window.openModelSettings;
  window.openModelSettings=async function(){await base();const w=WINS.models;if(!w||!N.tgGet||w.body.querySelector('[data-tgbox]'))return;const t=await N.tgGet();
    const box=document.createElement('div');box.className='wmsg';box.setAttribute('data-tgbox','1');box.style.borderColor='#2aa3e0';
    box.innerHTML=`<div class="h">📱 TELEGRAM — TELEFONDAN JARVISGA</div><div class="t" style="font-size:13px;color:var(--mut)">Telefonda Telegram'dan Jarvisga yozasiz yoki <b>ovozli xabar</b> yuborasiz — kompyuterdagi Jarvis bajaradi va javob qaytaradi (kompyuter yoqiq va Jarvis ochiq bo'lishi kerak). Faqat siz ulana olasiz. <b>Bitta botni faqat bitta qurilmada yoqing</b> (kompyuter tavsiya — u fonda ham ishlaydi).<br>1) Telegram'da <a href="#" data-o="https://t.me/BotFather">@BotFather</a> → /newbot → nom bering → tokenni oling. 2) Tokenni shu yerga qo'ying → Ulash. 3) Botingizga chiqqan 6 raqamli kodni yuboring.</div>
      <div class="addrow"><input data-tgt type="password" placeholder="${t.hasToken?'Token saqlangan (yangisini kiritish mumkin)':'Bot token'}"><button data-tgs>Ulash</button></div>
      <div class="kbm" data-tgr>${t.conflict?'<b style="color:var(--amber)">⚠ Bu bot boshqa qurilmada (kompyuter yoki telefonda) ishlayapti, shuning uchun bu yerda to\'xtatildi. Bitta botni faqat bitta qurilmada yoqing.</b><br>':''}${t.owner?'✓ Ulangan: '+esc(t.ownerName)+(t.on?' · ishlayapti':' · o\'chiq'):t.code?'Botingizga shu kodni yuboring: <b style="font-size:18px;color:var(--amber)">'+t.code+'</b>':t.hasToken?'Kod olish uchun "Ulash" ni bosing.':''}</div>
      ${t.hasToken?`<label class="toggle"><input type="checkbox" data-tge ${t.enabled?'checked':''}> Telegram orqali boshqarish yoqilgan</label>${t.owner?'<div class="wact"><button data-tgu>Boshqa hisobga qayta ulash</button></div>':''}`:''}`;
    w.body.prepend(box);const q=s=>box.querySelector(s);
    box.querySelectorAll('[data-o]').forEach(a=>a.onclick=e=>{e.preventDefault();N.open(a.dataset.o)});
    q('[data-tgs]').onclick=async()=>{const r=await N.tgSet({token:q('[data-tgt]').value||undefined,enabled:true});if(r.error){q('[data-tgr]').textContent='✕ '+r.error;return}
      q('[data-tgr]').innerHTML=r.owner?'✓ Ulangan':'@'+esc(r.bot||'bot')+' ga shu kodni yuboring: <b style="font-size:18px;color:var(--amber)">'+r.code+'</b>'};
    if(q('[data-tge]'))q('[data-tge]').onchange=e=>N.tgSet({enabled:e.target.checked});
    if(q('[data-tgu]'))q('[data-tgu]').onclick=async()=>{await N.tgSet({unpair:true,enabled:true});closeWin('models');window.openModelSettings()}};
})();

/* ================= DESKTOP: GEMINI LIVE — JONLI OVOZLI SUHBAT ================= */
(function(){
  if(!window.jarvisNative)return;const N=window.jarvisNative;
  const L=window.LIVE={on:false,ws:null,mic:null,actx:null,pctx:null,proc:null,next:0,srcs:[],userBuf:'',botBuf:'',uMsg:null,bMsg:null,toolsMap:{}};
  const b64=buf=>{let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
  function clean(s){if(Array.isArray(s))return s.map(clean);if(!s||typeof s!=='object')return s;const o={};
    for(const k in s){if(['additionalProperties','$schema','default','examples','format'].includes(k))continue;o[k]=clean(s[k])}
    if(o.type==='array'&&!o.items)o.items={type:'string'};if(o.type==='object'&&!o.properties)o.properties={};return o}
  function setBtn(){const b=document.getElementById('liveBtn');if(b){b.classList.toggle('on',L.on);b.textContent=L.on?'■ JONLI':'🎙 JONLI'}}
  function stopPlay(){L.srcs.forEach(s=>{try{s.stop()}catch(e){}});L.srcs=[];L.next=0}
  function play(b64data){const bin=atob(b64data);const n=bin.length/2|0;const buf=L.pctx.createBuffer(1,n,24000);const ch=buf.getChannelData(0);
    for(let i=0;i<n;i++){let v=bin.charCodeAt(2*i)|(bin.charCodeAt(2*i+1)<<8);if(v>=32768)v-=65536;ch[i]=v/32768}
    const s=L.pctx.createBufferSource();s.buffer=buf;s.connect(L.pctx.destination);const t=Math.max(L.pctx.currentTime+0.03,L.next);s.start(t);L.next=t+buf.duration;L.srcs.push(s);
    setMode('speaking');s.onended=()=>{L.srcs=L.srcs.filter(x=>x!==s);if(!L.srcs.length&&L.on)setMode('listening')}}
  async function start(){
    if(L.on)return stop();
    const cfg=await N.liveCfg();if(!cfg.key){addMsg('j','Jonli suhbat uchun **Google Gemini** kaliti kerak: ⚙ Modellar → Google Gemini → 🔑 Kalit olish.');return}
    stopSpeak();if(typeof W!=='undefined'&&W.on)wakeOff();
    L.on=true;setBtn();act('🎙 jonli suhbat: ulanmoqda…');
    const tools=allTools().filter(t=>t.name!=='open_app'||true);L.toolsMap=Object.fromEntries(tools.map(t=>[t.name,t]));
    tools.push({name:'look_screen',description:'Foydalanuvchining kompyuter ekranini ko\'radi (ekran rasmi olinadi). "Ekranga qara", "bu nima", "shu jadvalni o\'qi" deganda ishlat.',inputSchema:{type:'object',properties:{}}});
    const now=new Date();
    const sys=sysPrompt()+`\n\n[Hozir: ${fmtDate(now)}, ${pad(now.getHours())}:${pad(now.getMinutes())}]\nSEN HOZIR JONLI OVOZLI SUHBATDASAN: tabiiy, iliq, ravon o'zbek tilida (foydalanuvchi qaysi tilda gapirsa — o'sha tilda) qisqa gapir, xuddi tirik odamdek. Ro'yxat, belgi, markdown ishlatma. Kerak bo'lsa vositalardan foydalan.`;
    const models=[cfg.model,'gemini-2.5-flash-native-audio-latest','gemini-2.5-flash-native-audio-preview-12-2025'].filter((m,i,a)=>m&&a.indexOf(m)===i);
    let mi=0;
    const connect=()=>{const ws=new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key='+encodeURIComponent(cfg.key));L.ws=ws;let ready=false;
      ws.onopen=()=>ws.send(JSON.stringify({setup:{model:'models/'+models[mi],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:cfg.voice}}}},
        systemInstruction:{parts:[{text:sys.slice(0,30000)}]},tools:[{functionDeclarations:tools.map(t=>{const pr=clean(t.inputSchema||{type:'object'});const d={name:t.name,description:String(t.description||'').slice(0,1000)};if(pr.properties&&Object.keys(pr.properties).length)d.parameters=pr;return d})}],
        inputAudioTranscription:{},outputAudioTranscription:{}}}));
      ws.onmessage=async ev=>{const txt=typeof ev.data==='string'?ev.data:await ev.data.text();let m;try{m=JSON.parse(txt)}catch(e){return}
        if(m.setupComplete){ready=true;act('🎙 jonli suhbat: '+models[mi]);setMode('listening');showToast('Gapiravering, ser — men eshityapman','JONLI');await startMic();return}
        const sc=m.serverContent;
        if(sc){if(sc.interrupted){stopPlay();setMode('listening')}
          if(sc.inputTranscription&&sc.inputTranscription.text){L.userBuf+=sc.inputTranscription.text;if(!L.uMsg)L.uMsg=addMsg('u','');L.uMsg.textContent='🎙 '+L.userBuf}
          if(sc.inputTranscription&&$('modal').classList.contains('on')){const q=L.userBuf.toLowerCase().replace(/[.,!?]/g,'').trim();if(YES.test(q)){closeModal(true);act('🎙 ovoz bilan tasdiqlandi')}else if(NO.test(q))closeModal(false)}
          if(sc.outputTranscription&&sc.outputTranscription.text){L.botBuf+=sc.outputTranscription.text;if(!L.bMsg)L.bMsg=addMsg('j','');setBody(L.bMsg,L.botBuf)}
          (sc.modelTurn&&sc.modelTurn.parts||[]).forEach(p=>{if(p.inlineData&&p.inlineData.data)play(p.inlineData.data)});
          if(sc.turnComplete){if(L.userBuf||L.botBuf){S.history.push({role:'user',content:L.userBuf||'(ovoz)'},{role:'assistant',content:L.botBuf||'(ovoz)'});noteExchange()}L.userBuf='';L.botBuf='';L.uMsg=null;L.bMsg=null}}
        if(m.toolCall){const res=[];for(const fc of m.toolCall.functionCalls||[]){let out;
            try{if(fc.name==='look_screen'){const s=await N.screenshot();if(s.error)throw new Error(s.error);ws.send(JSON.stringify({realtimeInput:{video:{data:s.jpeg,mimeType:'image/jpeg'}}}));out='Ekran rasmi yuborildi, uni ko\'rib javob ber.';act('👁 ekran ko\'rildi')}
              else{const t=L.toolsMap[fc.name];if(!t)throw new Error('vosita yo\'q');const v=await t.execute(fc.args||{});out=typeof v==='string'?v:JSON.stringify(v)}}
            catch(e){out='XATO: '+(e.message||e)}
            res.push({id:fc.id,name:fc.name,response:{result:String(out).slice(0,8000)}})}
          ws.send(JSON.stringify({toolResponse:{functionResponses:res}}))}
        if(m.goAway)act('🎙 sessiya tugash arafasida','w')};
      ws.onclose=ev=>{if(!ready&&L.on&&mi<models.length-1&&ev.code!==1000){mi++;act('↻ boshqa jonli model: '+models[mi],'w');connect();return}
        if(L.on){const why=ev.reason||('kod '+ev.code);if(!ready)addMsg('j','Jonli suhbatga ulanib bo\'lmadi: '+why+'. ⚙ Modellar → JONLI SUHBAT bo\'limida model nomini tekshiring.');stop(true)}};
      ws.onerror=()=>{}};
    try{L.pctx=new AudioContext({sampleRate:24000});connect()}catch(e){addMsg('j','Xato: '+e.message);stop(true)}}
  async function startMic(){try{L.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      L.actx=new AudioContext({sampleRate:16000});const src=L.actx.createMediaStreamSource(L.mic);L.proc=L.actx.createScriptProcessor(2048,1,1);
      L.proc.onaudioprocess=e=>{if(!L.ws||L.ws.readyState!==1)return;const f=e.inputBuffer.getChannelData(0);const i16=new Int16Array(f.length);for(let i=0;i<f.length;i++){const v=Math.max(-1,Math.min(1,f[i]));i16[i]=v<0?v*32768:v*32767}
        L.ws.send(JSON.stringify({realtimeInput:{audio:{data:b64(i16.buffer),mimeType:'audio/pcm;rate=16000'}}}))};
      src.connect(L.proc);L.proc.connect(L.actx.destination)}catch(e){addMsg('j','Mikrofon ishlamadi: '+e.message);stop(true)}}
  function stop(silent){L.on=false;setBtn();try{L.proc&&L.proc.disconnect()}catch(e){}try{L.mic&&L.mic.getTracks().forEach(t=>t.stop())}catch(e){}try{L.actx&&L.actx.close()}catch(e){}
    stopPlay();try{L.ws&&L.ws.close(1000)}catch(e){}try{L.pctx&&L.pctx.close()}catch(e){}L.ws=null;setMode('idle');if(!silent)act('🎙 jonli suhbat tugadi')}
  window.liveStart=start;window.liveStop=stop;
  document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.querySelector('.bar');if(bar){const b=document.createElement('button');b.className='btn wake';b.id='liveBtn';b.title='Gemini bilan jonli ovozli suhbat (gapingizni bo\'lish ham mumkin)';b.textContent='🎙 JONLI';b.onclick=()=>start();bar.insertBefore(b,bar.firstChild)}
    const st=document.createElement('style');st.textContent='#liveBtn.on{color:#03080f;background:var(--green);border-color:var(--green);animation:wpulse 1.6s infinite}';document.head.appendChild(st);
    document.getElementById('estop')&&document.getElementById('estop').addEventListener('click',()=>{if(L.on)stop()});
    if(typeof TOOLS!=='undefined'){const vc=window.voiceControl;}
  });
  // settings
  const base=window.openModelSettings;
  window.openModelSettings=async function(){await base();const w=WINS.models;if(!w||w.body.querySelector('[data-livebox]'))return;const c=await N.liveCfg();
    const V=['Charon','Orus','Puck','Fenrir','Iapetus','Algenib','Kore','Aoede','Leda','Zephyr','Sulafat','Achernar'];
    const box=document.createElement('div');box.className='wmsg';box.setAttribute('data-livebox','1');box.style.borderColor='var(--green)';
    box.innerHTML=`<div class="h">🎙 JONLI SUHBAT (Gemini Live)</div><div class="t" style="font-size:13px;color:var(--mut)">Odamdek tabiiy ovozda real vaqtda gaplashadi, gapini bo'lishingiz mumkin, kompyuterni boshqaradi va "ekranga qara" desangiz ekraningizni ko'radi. Google Gemini kaliti bilan ishlaydi (bepul limit bor). Pastdagi <b>🎙 JONLI</b> tugmasi bilan yoqiladi.</div>
      <div class="vrow"><label>Ovoz</label><select data-lv>${V.map(v=>`<option ${v===c.voice?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="addrow"><input data-lm value="${esc(c.model)}"><button data-ls>Saqlash</button></div>`;
    w.body.prepend(box);box.querySelector('[data-ls]').onclick=async()=>{await N.liveSet({model:box.querySelector('[data-lm]').value,voice:box.querySelector('[data-lv]').value});try{showToast('Saqlandi','JONLI')}catch(e){}};
    box.querySelector('[data-lv]').onchange=e=>N.liveSet({voice:e.target.value})};
})();
(function(){if(!window.jarvisNative)return;document.addEventListener('DOMContentLoaded',()=>{const vc=window.voiceControl;if(typeof vc!=='function')return;
  window.voiceControl=function(t){const l=String(t).toLowerCase().replace(/^(?:hey |эй )?(?:jarvis|джарвис|жарвис)[\s,]*/,'').trim();
    if(/^(jonli( rejim| suhbat)?|gaplashamiz|suhbatlashamiz)\b/.test(l)){$('inp').value='';window.liveStart&&window.liveStart();return true}return vc(t)}})})();

/* exe: "Jarvis" kutish rejimi oldingi safar yoqilgan bo'lsa — dastur ochilishi bilan o'zi yoqiladi */
(function(){if(!window.jarvisNative)return;document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{try{if(localStorage.getItem('jarvis_wake')==='1'&&dict&&!W.on){wakeOn();act('🎙 "Jarvis" kutish rejimi avtomatik yoqildi')}}catch(e){}},3500))})();

/* ================= OFLAYN AI: Ollama'ni bir tugma bilan o'rnatish ================= */
(function(){if(!window.jarvisNative||!window.jarvisNative.ollamaStatus)return;const N=window.jarvisNative;
  const base=window.openModelSettings;
  window.openModelSettings=async function(){await base();const w=WINS.models;if(!w||w.body.querySelector('[data-olbox]'))return;const s=await N.ollamaStatus();
    const box=document.createElement('div');box.className='wmsg';box.setAttribute('data-olbox','1');box.style.borderColor='var(--amber)';
    const M=[['qwen3:4b','Qwen3 4B — tez, ~2.5 GB (tavsiya)'],['qwen3:8b','Qwen3 8B — aqlliroq, ~5 GB, 16 GB RAM'],['gemma3:4b','Gemma 3 4B — ~3.3 GB'],['llama3.2:3b','Llama 3.2 3B — eng yengil, ~2 GB']];
    box.innerHTML=`<div class="h">📴 INTERNETSIZ AI (Ollama)</div><div class="t" style="font-size:13px;color:var(--mut)">Internet bo'lmaganda ham Jarvis o'ylashi va javob berishi uchun kompyuterga kichik AI model o'rnatiladi. Bir marta internet bilan o'rnating — keyin internetsiz ishlaydi. Kompyuterda kamida 8 GB RAM bo'lsin.</div>
      <div class="kbm" data-ols>Holat: ${s.running?'✓ Ollama ishlayapti · modellar: '+(s.models.join(', ')||'yo\'q'):s.installed?'o\'rnatilgan, lekin ishlamayapti':'o\'rnatilmagan'}</div>
      <div class="vrow"><label>Model</label><select data-olm>${M.map(m=>`<option value="${m[0]}">${m[1]}</option>`).join('')}</select></div>
      <div class="wact">${s.running?'':'<button class="w" data-oli>⬇ Ollama\'ni o\'rnatish</button>'}<button data-olp>⬇ Modelni yuklash</button></div>
      <div style="height:6px;background:rgba(63,210,255,.12)"><div data-olbar style="height:100%;width:0;background:var(--amber)"></div></div>`;
    w.body.prepend(box);const q=x=>box.querySelector(x),st=q('[data-ols]');
    N.onOllamaProgress&&N.onOllamaProgress(p=>{st.textContent=p.status+(p.total?` — ${(p.completed/1e9).toFixed(2)} / ${(p.total/1e9).toFixed(2)} GB`:'');if(p.total)q('[data-olbar]').style.width=(p.completed/p.total*100)+'%'});
    if(q('[data-oli]'))q('[data-oli]').onclick=async e=>{e.target.disabled=true;st.textContent='Yuklab olinmoqda va o\'rnatilmoqda… (bir necha daqiqa)';const r=await N.ollamaInstall();st.textContent=r.error?'✕ '+r.error:'✓ Ollama o\'rnatildi. Endi modelni yuklang.';e.target.disabled=false};
    q('[data-olp]').onclick=async e=>{const m=q('[data-olm]').value;e.target.disabled=true;const r=await N.ollamaPull(m);e.target.disabled=false;
      if(r.error){st.textContent='✕ '+r.error;return}st.textContent='✓ '+m+' tayyor — internetsiz rejimda ishlatiladi.';try{act('📴 oflayn model tayyor: '+m)}catch(er){}}};
})();

/* ================= 🩺 TEKSHIRUV (diagnostika) + xatolar jurnali ================= */
(function(){if(!window.jarvisNative||!window.jarvisNative.diag)return;const N=window.jarvisNative;
  const log=m=>{try{N.log(String(m).slice(0,2000))}catch(e){}};
  window.addEventListener('error',e=>log('JS: '+e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno));
  window.addEventListener('unhandledrejection',e=>log('Promise: '+(e.reason&&e.reason.message||e.reason)));
  document.addEventListener('DOMContentLoaded',()=>{const oa=window.act;if(typeof oa==='function')window.act=function(t,c){if(c==='e')log('ACT: '+t);return oa.apply(this,arguments)};
    const dock=document.getElementById('dock');if(dock){const b=document.createElement('button');b.textContent='🩺 Tekshiruv';b.onclick=()=>window.openDiag();dock.insertBefore(b,dock.children[1]||null)}});
  window.openDiag=function(){openWin('diag','🩺 JARVIS TEKSHIRUVI',async w=>{w.body.innerHTML='<div class="wact"><button data-run class="w">▶ Qayta tekshirish</button><button data-cp>📋 Hisobotni nusxalash</button><button data-log>📄 Xatolar jurnali</button></div><div data-out><div class="spin">Tekshirilmoqda… (30 soniyagacha)</div></div>';
    const out=w.body.querySelector('[data-out]');let report='';
    const run=async()=>{out.innerHTML='<div class="spin">Tekshirilmoqda… (30 soniyagacha)</div>';const r=await N.diag();
      // brauzer tomonidagi tekshiruvlar
      const mic=await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return{ok:true,msg:'mikrofon ruxsati bor'}}).catch(e=>({ok:false,msg:'mikrofon: '+e.message,fix:'Windows Sozlamalar → Maxfiylik → Mikrofon → ilovalarga ruxsat bering'}));
      const voices=('speechSynthesis' in window)?speechSynthesis.getVoices().length:0;
      r.items.push({name:'Mikrofon',...mic},{name:'Windows ovozlari',ok:voices>0,msg:voices+' ta ovoz',fix:voices?'':'Windows Sozlamalar → Vaqt va til → Nutq → ovoz qo\'shing'});
      let aiOk=false;try{const t=await sample('Faqat "OK" deb javob ber.',{cache:false,modelTier:'quick'});aiOk=/ok/i.test(t.text||'');r.items.push({name:'AI suhbat (vositalar bilan)',ok:aiOk,msg:(t.text||'').slice(0,60)})}catch(e){r.items.push({name:'AI suhbat',ok:false,msg:e.message.slice(0,300),fix:'⚙ Modellar → kalitlarni "✓ Sinash" bilan tekshiring'})}
      try{const t=await sample('Hozir soat necha? get_datetime vositasidan foydalan.',{tools:localTools().slice(0,3),cache:false,modelTier:'quick'});r.items.push({name:'AI vositalarni chaqirishi',ok:/\d{1,2}:\d{2}/.test(t.text||''),msg:(t.text||'').slice(0,80)})}catch(e){r.items.push({name:'AI vositalarni chaqirishi',ok:false,msg:e.message.slice(0,300)})}
      report=r.items.map(i=>`${i.ok?'✓':'✕'} ${i.name}: ${i.msg||''}${!i.ok&&i.fix?' → '+i.fix:''}`).join('\n');
      out.innerHTML=r.items.map(i=>`<div class="it" style="cursor:default"><div class="a" style="color:${i.ok?'var(--green)':'var(--red)'}">${i.ok?'✓':'✕'} ${esc(i.name)}</div><div class="c">${esc(i.msg||'')}</div>${!i.ok&&i.fix?`<div class="b">➜ ${esc(i.fix)}</div>`:''}</div>`).join('')};
    w.body.querySelector('[data-run]').onclick=run;w.body.querySelector('[data-cp]').onclick=()=>navigator.clipboard?.writeText(report).catch(()=>{});
    w.body.querySelector('[data-log]').onclick=async()=>{const t=await N.logRead();out.innerHTML=`<div class="wmsg"><div class="t" style="font-size:12px;white-space:pre-wrap">${esc(t||'Jurnal bo\'sh')}</div></div>`};run()})};
})();
