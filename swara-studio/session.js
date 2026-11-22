import {RAGA_LIST,RAGAS,midiHz,noteName} from './music.js?v=20261116-13';
import {detectLivePitch,livePitchReading} from './swara-live-core.js?v=20261121-1';

const STORAGE_KEY='swara-studio-custom-session-v1';
const VOICE_DB='swara-studio-private-voice-v1';
const VOICE_STORE='recordings';
const VOICE_KEY='aa-bank';
const FIRST_VOICE_MIDI=54;
const VOICE_NOTE_SECONDS=3;
const VOICE_NOTE_COUNT=20;
const SHRUTHIS=[54,55,56,57,58,59,60,61];
const digit=letter=>({'₁':'1','₂':'2','₃':'3'})[letter]||letter;

function voiceDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(VOICE_DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(VOICE_STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function privateVoice(operation,value){
  const db=await voiceDatabase();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(VOICE_STORE,operation==='read'?'readonly':'readwrite');
    const request=operation==='read'?tx.objectStore(VOICE_STORE).get(VOICE_KEY):tx.objectStore(VOICE_STORE).put(value,VOICE_KEY);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}

export function parseSwaraSequence(text,raga){
  const notes=raga.notes;
  const tokens=text.replace(/upper\s+sa/gi,'UpperSa').replace(/[₁₂₃]/g,digit).split(/[\s,;|]+/).filter(Boolean);
  if(!tokens.length)throw new Error('Enter at least one swara.');
  if(tokens.length>64)throw new Error('Use 64 swaras or fewer in one session.');
  return tokens.map((raw,position)=>{
    const token=raw.toUpperCase().replace(/[’‘]/g,"'");
    if(/^(UPPERSA|S['^+.]|SA['^+.])$/.test(token))return notes.length-1;
    if(token==='S'||token==='SA')return 0;
    const match=token.match(/^(R|RI|G|GA|M|MA|P|PA|D|DA|N|NI)([123])?$/);
    if(!match)throw new Error(`“${raw}” at position ${position+1} is not a swara. Use the swaras shown below.`);
    const letter=match[1][0],variant=match[2];
    const index=notes.findIndex(note=>note.offset!==12&&note.variant[0]===letter&&(!variant||note.variant.slice(1).replace(/[₁₂₃]/g,digit)===variant));
    if(index<0)throw new Error(`“${raw}” is not in ${raga.name}. Choose swaras shown below.`);
    return index;
  });
}

export function createPracticeSession({sound,getSettings}){
  const host=document.getElementById('session-view');
  const defaults=()=>({base:getSettings().base,raga:getSettings().raga,tempo:50,notes:'',sound:'piano'});
  let state=defaults();
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved&&SHRUTHIS.includes(saved.base)&&RAGAS[saved.raga]&&Number.isInteger(saved.tempo)&&saved.tempo>=30&&saved.tempo<=180&&typeof saved.notes==='string'&&saved.notes.length<=600){state={...defaults(),...saved};}
  }catch{}
  let running=false,runId=0,frame=0,micController=null,micActive=false,micBuffer=null,lastMicFrame=0,previousMidi=null;
  let scheduled=[],voiceBuffer=null,voiceReady=false;
  const $=id=>host.querySelector(`#${id}`);
  const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}};
  const swaraLabel=note=>note.offset===12?'Upper Sa':note.name+note.variant.slice(1);
  const code=note=>note.offset===12?"S'":note.variant.replace(/[₁₂₃]/g,digit);

  function render(){
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">YOUR PRACTICE SESSION</p><h1>Make a phrase to sing.</h1></div>
      <div class="session-builder"><div class="session-fields">
        <label>Base shruthi<select id="session-base">${SHRUTHIS.map(m=>`<option value="${m}">${noteName(m)}</option>`).join('')}</select></label>
        <label>Raga<select id="session-raga">${RAGA_LIST.map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label>Tempo (BPM)<input id="session-tempo" type="number" min="30" max="180" step="1" inputmode="numeric"></label>
        <label>Sound<select id="session-sound"><option value="piano">Piano</option><option value="voice">My voice</option></select></label>
      </div><label class="session-notes-label" for="session-notes">Swaras</label>
      <textarea id="session-notes" rows="3" spellcheck="false" placeholder="S R2 G3 P D2 S'"></textarea>
      <div id="session-swatches" class="session-swatches" aria-label="Add a swara"></div>
      <p class="field-note">One swara per beat. S' means Upper Sa.</p>
      <div class="session-private-voice"><button id="session-import" class="secondary-button" type="button">Load private voice file</button><input id="session-voice-file" type="file" accept=".wav,audio/wav" hidden><span id="session-voice-state">No voice file loaded. Piano is ready.</span></div>
      <p class="session-private-note">Your voice file stays in this browser on this device. It is never uploaded.</p>
      <p id="session-error" class="session-error" role="alert" hidden></p>
      <div class="session-actions"><button id="session-play" class="primary-button" type="button">Sing along <span aria-hidden="true">→</span></button><button id="session-stop" class="secondary-button" type="button" disabled>Stop</button><label class="session-mic-label"><input id="session-mic" type="checkbox" checked> Show my sung note</label></div>
      <p id="session-status" class="session-status" role="status">Use headphones when singing along.</p>
      <div class="session-stage"><div class="session-stage-top"><span class="label">CURRENT SWARA</span><span id="session-count">—</span></div><strong id="session-current">—</strong><div id="session-sequence" class="session-sequence"></div><div class="session-progress"><i id="session-progress-fill"></i></div><p id="session-heard">Your note: —</p></div></div>`;
    $('session-base').value=String(state.base);$('session-raga').value=state.raga;$('session-tempo').value=String(state.tempo);$('session-notes').value=state.notes;$('session-sound').value=state.sound==='voice'?'voice':'piano';
    $('session-base').onchange=()=>{state.base=Number($('session-base').value);save();refreshPreview();};
    $('session-raga').onchange=()=>{state.raga=$('session-raga').value;save();renderSwatches();refreshPreview();};
    $('session-tempo').oninput=()=>{state.tempo=Number($('session-tempo').value);save();refreshPreview();};
    $('session-sound').onchange=()=>{state.sound=$('session-sound').value;save();};
    $('session-notes').oninput=()=>{state.notes=$('session-notes').value;save();refreshPreview();};
    $('session-mic').onchange=()=>{$('session-heard').hidden=!$('session-mic').checked;};
    $('session-swatches').onclick=event=>{const button=event.target.closest('[data-code]');if(!button)return;const input=$('session-notes');const prefix=input.value.trimEnd();input.value=prefix?`${prefix} ${button.dataset.code}`:button.dataset.code;state.notes=input.value;save();refreshPreview();input.focus();};
    $('session-play').onclick=start;
    $('session-stop').onclick=()=>stop('Stopped.');
    $('session-import').onclick=()=>$('session-voice-file').click();
    $('session-voice-file').onchange=async()=>{const file=$('session-voice-file').files[0];if(file)await importVoice(file);$('session-voice-file').value='';};
    updateVoiceState();
    renderSwatches();refreshPreview();$('session-heard').hidden=!$('session-mic').checked;
  }
  function renderSwatches(){
    $('session-swatches').innerHTML=RAGAS[state.raga].notes.map(note=>`<button type="button" data-code="${code(note)}" aria-label="Add ${swaraLabel(note)}">${code(note)}</button>`).join('');
  }
  function readSequence(){
    if(!Number.isInteger(state.tempo)||state.tempo<30||state.tempo>180)throw new Error('Choose a tempo from 30 to 180 BPM.');
    return parseSwaraSequence(state.notes,RAGAS[state.raga]);
  }
  function refreshPreview(){
    if(!running){$('session-current').textContent='—';$('session-progress-fill').style.width='0';$('session-heard').textContent='Your note: —';$('session-status').textContent='Use headphones when singing along.';}
    try{
      const indices=readSequence(),notes=RAGAS[state.raga].notes;
      $('session-error').hidden=true;
      $('session-sequence').innerHTML=indices.map((i,n)=>`<span data-position="${n}">${swaraLabel(notes[i])}</span>`).join('');
      $('session-count').textContent=`${indices.length} beat${indices.length===1?'':'s'} · ${Math.round(indices.length*60/state.tempo)}s`;
    }catch(error){
      $('session-sequence').innerHTML='';$('session-count').textContent='—';
      if(state.notes.trim()){$('session-error').textContent=error.message;$('session-error').hidden=false;}
      else $('session-error').hidden=true;
    }
  }
  function updateVoiceState(message){
    const label=$('session-voice-state');
    if(label)label.textContent=message|| (voiceReady?'Private voice ready on this device.':'No voice file loaded. Piano is ready.');
  }
  async function decodeVoice(blob){
    sound.ctx??=new (window.AudioContext||window.webkitAudioContext)();
    const buffer=await sound.ctx.decodeAudioData(await blob.arrayBuffer());
    if(Math.abs(buffer.duration-VOICE_NOTE_COUNT*VOICE_NOTE_SECONDS)>.3)throw new Error('Choose the 60-second swara-aa-bank.wav voice file.');
    return buffer;
  }
  async function importVoice(file){
    $('session-import').disabled=true;updateVoiceState('Loading private voice…');
    try{
      const decoded=await decodeVoice(file);
      voiceBuffer=decoded;voiceReady=true;state.sound='voice';$('session-sound').value='voice';save();
      try{await privateVoice('write',file);updateVoiceState();}
      catch{updateVoiceState('Private voice ready for this tab. Browser storage is unavailable.');}
    }catch(error){updateVoiceState(error.message||'Could not load this voice file.');}
    finally{$('session-import').disabled=false;}
  }
  async function restoreVoice(){
    try{
      const blob=await privateVoice('read');
      if(!blob)return;
      voiceBuffer=await decodeVoice(blob);voiceReady=true;updateVoiceState();
    }catch{updateVoiceState('Stored voice could not be loaded. Choose the private voice file again.');}
  }
  function stop(message=''){
    runId++;running=false;cancelAnimationFrame(frame);frame=0;micController?.abort();micController=null;
    if(micActive){sound.releaseMic();micActive=false;micBuffer=null;}
    for(const {source,gain} of scheduled){try{gain.gain.cancelScheduledValues(sound.ctx.currentTime);gain.gain.setTargetAtTime(0,sound.ctx.currentTime,.01);source.stop(sound.ctx.currentTime+.05);}catch{}}
    scheduled=[];
    const play=$('session-play'),halt=$('session-stop');
    if(play){play.disabled=false;halt.disabled=true;for(const id of ['session-base','session-raga','session-tempo','session-sound','session-notes','session-mic'])$(id).disabled=false;}
    if(message&&$('session-status'))$('session-status').textContent=message;
  }
  async function start(){
    let indices;
    try{indices=readSequence();}catch(error){$('session-error').textContent=error.message;$('session-error').hidden=false;return;}
    stop();const token=++runId;
    $('session-error').hidden=true;$('session-play').disabled=true;$('session-stop').disabled=false;
    for(const id of ['session-base','session-raga','session-tempo','session-sound','session-notes','session-mic'])$(id).disabled=true;
    $('session-status').textContent='Preparing your phrase…';
    const notes=RAGAS[state.raga].notes;
    const midis=indices.map(i=>state.base+notes[i].offset);
    try{
      await sound.unlock();
      if(token!==runId)return;
      if(state.sound==='voice'&&!voiceReady)throw new Error('Load your private voice file first, or choose Piano.');
      let micWarning='';
      if($('session-mic').checked){
        micController=new AbortController();
        try{await sound.microphone(micController.signal);if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
        catch(error){if(token!==runId)return;micWarning='Microphone unavailable; the session will still play.';}
      }
      const ctx=sound.ctx,beat=60/state.tempo,startAt=ctx.currentTime+.15;
      midis.forEach((midi,index)=>{
        const useVoice=state.sound==='voice';
        const source=useVoice?ctx.createBufferSource():ctx.createOscillator(),gain=ctx.createGain(),when=startAt+index*beat;
        if(useVoice)source.buffer=voiceBuffer;
        else{source.type='triangle';source.frequency.setValueAtTime(midiHz(midi),when);}
        source.connect(gain);gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.9,when+.025);
        gain.gain.setValueAtTime(.9,when+beat-.045);gain.gain.linearRampToValueAtTime(0,when+beat);
        if(useVoice)source.start(when,(midi-FIRST_VOICE_MIDI)*VOICE_NOTE_SECONDS+.12,beat);
        else{source.start(when);source.stop(when+beat);}
        scheduled.push({source,gain});source.onended=()=>{try{source.disconnect();gain.disconnect();}catch{}};
      });
      running=true;$('session-status').textContent=micWarning|| (micActive?'Sing along and watch your note.':'Sing along.');
      const animate=()=>{
        if(!running||token!==runId)return;
        const now=ctx.currentTime,elapsed=now-startAt,current=Math.floor(elapsed/beat);
        if(current>=indices.length){$('session-progress-fill').style.width='100%';stop('Session complete. Play it again or change the notes.');return;}
        if(current>=0){
          $('session-current').textContent=swaraLabel(notes[indices[current]]);
          $('session-count').textContent=`Beat ${current+1} of ${indices.length}`;
          $('session-progress-fill').style.width=`${100*Math.min(1,elapsed/(beat*indices.length))}%`;
          host.querySelectorAll('[data-position]').forEach(el=>el.classList.toggle('current',Number(el.dataset.position)===current));
        }
        if(micActive&&now-lastMicFrame>.07){
          lastMicFrame=now;sound.analyser.getFloatTimeDomainData(micBuffer);
          const frequency=detectLivePitch(micBuffer,ctx.sampleRate);
          if(frequency){const reading=livePitchReading(frequency,state.base,previousMidi);previousMidi=reading.midi;$('session-heard').textContent=`Your note: ${reading.fullName} · ${frequency.toFixed(1)} Hz`;}
          else $('session-heard').textContent='Your note: —';
        }
        frame=requestAnimationFrame(animate);
      };
      frame=requestAnimationFrame(animate);
    }catch(error){if(token!==runId)return;stop(error.message||'The session could not start.');$('session-error').textContent=error.message||'The session could not start.';$('session-error').hidden=false;}
  }
  render();
  restoreVoice();
  return {render,stop};
}
