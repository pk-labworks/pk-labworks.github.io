import {RAGAS,PITCH_POSITION_LABELS,midiHz,noteName,median} from './music.js?v=20261122-8';
import {LIVE_SWARAS,LIVE_WINDOW_MS,LIVE_GRAPH_FRAME_MS,detectLivePitch,livePitchReading,drawLiveTrace} from './swara-live-core.js?v=20261121-1';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-8';
import {pitchCircleMarkup,resetPitchCircle,updatePitchCircle} from './pitch-circle.js?v=20261125-1';

const FIND_SECONDS=5;
export function suggestBaseShruthi(frequencies){
  const pitches=frequencies.filter(hz=>Number.isFinite(hz)&&hz>0).map(hz=>69+12*Math.log2(hz/440));
  if(pitches.length<24)return {error:'Sing “aaa” a little longer, then try again.'};
  const center=median(pitches),spread=median(pitches.map(pitch=>Math.abs(pitch-center)));
  if(spread>.8)return {error:'The pitch moved a lot. Try a relaxed, steady “aaa”.'};
  const base=Math.round(center);
  if(!SHRUTHIS.includes(base))return {error:'That pitch is outside the available shruthi range. Try a comfortable middle note.'};
  return {base};
}

export function createTools({sound,getSettings,getNotes,onSelection}){
  const host=document.getElementById('tools-view');
  let mode='see',singRaga='none',selectedOffset=0,playingOffset=null,timer=null,requestId=0;
  let micController=null,micPending=false,listening=false,micFrame=0,lastAnalysis=0,lastDraw=0,lastVoice=0,micError='',previousMidi=null,micSamples=null,liveHistory=[];
  let findPending=false,finding=false,findStart=0,findSamples=[],findResult=null,findError='',applyingFind=false;
  const blackPitchClasses=new Set([1,3,6,8,10]);
  const isBlack=midi=>blackPitchClasses.has(((midi%12)+12)%12);
  const position=offset=>((offset%12)+12)%12;
  const ragaNote=offset=>(mode==='see'?(RAGAS[singRaga]?.notes||[]):getNotes()).find(note=>note.offset===position(offset));
  const label=offset=>{
    if(offset===12)return 'Upper Sa';
    const note=ragaNote(offset);
    return note?note.name+note.variant.slice(1):PITCH_POSITION_LABELS[position(offset)];
  };
  const register=offset=>offset<0?'Lower octave':offset>=12?'Higher octave':'Middle octave';
  const toolHeading=()=>`<div class="tool-current-settings">${selectionFields('tool',{...getSettings(),raga:mode==='see'?singRaga:getSettings().raga},{includeNone:mode==='see'})}</div>`;
  const detail=offset=>{
    const midi=getSettings().base+offset;
    const name=offset===12?'Upper Sa':ragaNote(offset)?.name||PITCH_POSITION_LABELS[position(offset)];
    return `<div class="tool-detail"><span class="label">SELECTED PITCH</span><strong>${name}</strong><span>${label(offset)} · ${register(offset)} · ${noteName(midi)} · ${midiHz(midi).toFixed(2)} Hz</span></div>`;
  };
  function stop(){
    requestId++;
    clearTimeout(timer);timer=null;
    if(playingOffset!==null)sound.stopNotes();
    playingOffset=null;
    micController?.abort();micController=null;
    cancelAnimationFrame(micFrame);micFrame=0;
    if(micPending||listening||findPending||finding)sound.releaseMic();
    micPending=false;listening=false;findPending=false;finding=false;previousMidi=null;micSamples=null;
    clearLive();
    const micButton=host.querySelector('#tool-mic');
    if(micButton){micButton.textContent='Start';micButton.setAttribute('aria-label','Start pitch detection');micButton.setAttribute('aria-pressed','false');}
    const status=host.querySelector('#tool-mic-status');if(status)status.textContent='';
    const findButton=host.querySelector('#tool-find-start');if(findButton)findButton.textContent='Start';
    host.querySelectorAll('.piano-key.playing').forEach(key=>key.classList.remove('playing'));
    const button=host.querySelector('#tool-stop');
    if(button)button.disabled=true;
  }
  function liveView(){
    const scale=LIVE_SWARAS.map(([name,description],index)=>`<div class="swara-live-scale-item${ragaNote(index)?' in-raga':''}" data-scale-index="${index}"><strong>${name}</strong><small>${description.split(' / ')[1]}</small></div>`).join('');
    const state=micPending?'Connecting to microphone…':micError||'';
    return `<div class="tool-surface swara-live-tool"><div class="tool-surface-heading">${toolHeading()}</div><p class="tool-live-instruction">Press Start, then just start singing and see where your notes land.</p><div class="live-toolbar"><button class="primary-button" id="tool-mic" aria-pressed="${micPending||listening}" aria-label="${micPending?'Cancel microphone request':listening?'Stop pitch detection':'Start pitch detection'}">${micPending?'Cancel':listening?'Stop':'Start'}</button><span id="tool-mic-status" role="status">${state}</span></div><section class="swara-live-readout" aria-label="Current sung pitch"><div class="swara-live-note-row"><div><strong id="tool-live-note" aria-live="polite">—</strong><span id="tool-live-name">Your note will appear here</span></div><div class="swara-live-western"><strong id="tool-live-western">—</strong><span id="tool-live-hz">— Hz</span></div></div>${pitchCircleMarkup('tool')}<p id="tool-live-cents">Sing to see your tuning</p></section><section class="swara-live-trace"><div class="swara-live-section-heading"><h3>Last 2 seconds</h3><button class="secondary-button" id="tool-clear-trace" type="button">Clear graph</button></div><canvas id="tool-live-trace" role="img" aria-label="Live pitch trace over the last two seconds, from Sa to Upper Sa, scrolling under a fixed now marker"></canvas><p>Notes outside this octave appear in the readout above.</p></section><section class="swara-live-scale-section"><h3>Swaras around your Sa</h3><div class="swara-live-scale-grid">${scale}</div></section><p class="tool-caption">Microphone audio stays on this device.</p></div>`;
  }
  function findView(){
    const status=findPending?'Connecting to microphone…':finding?'Sing “aaa” comfortably.':findError;
    const suggestion=findResult?`<div class="tool-find-result"><span class="label">SUGGESTED BASE SHRUTHI</span><strong>${noteName(findResult.base)}</strong><p>Try this as your Sa. You can change it anytime.</p><button class="primary-button" id="tool-find-use" type="button" ${getSettings().base===findResult.base?'disabled':''}>${getSettings().base===findResult.base?'Using this shruthi':`Use ${noteName(findResult.base)}`}</button></div>`:'';
    return `<div class="tool-surface tool-find"><div class="tool-surface-heading">${toolHeading()}</div><h2>Find a comfortable Sa</h2><p>Sing “aaa” at an easy, steady pitch for five seconds.</p><div class="tool-find-actions"><button class="primary-button" id="tool-find-start" type="button">${findPending||finding?'Stop':'Start'}</button><span id="tool-find-status" role="status">${status}</span></div><div class="tool-find-progress" role="progressbar" aria-label="Singing time" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="tool-find-progress-fill"></i></div>${suggestion}<p class="tool-caption">The suggestion uses pitch measurements from this attempt. Audio is not saved.</p></div>`;
  }
  function clearLive(){
    const note=host.querySelector('#tool-live-note');if(!note)return;
    note.textContent='—';
    host.querySelector('#tool-live-name').textContent='Your note will appear here';
    host.querySelector('#tool-live-western').textContent='—';
    host.querySelector('#tool-live-hz').textContent='— Hz';
    host.querySelector('#tool-live-cents').textContent='Sing to see your tuning';
    resetPitchCircle(host,'tool');
    host.querySelectorAll('.swara-live-scale-item.active').forEach(item=>item.classList.remove('active'));
  }
  function showPitch(frequency,now){
    const reading=livePitchReading(frequency,getSettings().base,previousMidi);
    previousMidi=reading.midi;lastVoice=now;
    host.querySelector('#tool-live-note').textContent=reading.swara;
    host.querySelector('#tool-live-name').textContent=reading.fullName;
    host.querySelector('#tool-live-western').textContent=reading.western;
    host.querySelector('#tool-live-hz').textContent=`${frequency.toFixed(1)} Hz`;
    host.querySelector('#tool-live-cents').textContent=reading.tuning;
    updatePitchCircle(host,'tool',{noteKey:reading.midi,frequency,targetHz:midiHz(reading.midi),sampleMs:60,durationMs:3000,tolerance:({beginner:35,intermediate:25,advanced:15})[getSettings().level]||35});
    host.querySelectorAll('.swara-live-scale-item').forEach((item,i)=>item.classList.toggle('active',i===reading.index));
    liveHistory.push({midi:reading.exactMidi,time:now});
  }
  function drawTrace(now=performance.now()){
    liveHistory=liveHistory.filter(point=>point.time>=now-LIVE_WINDOW_MS);
    drawLiveTrace(host.querySelector('#tool-live-trace'),liveHistory,getSettings().base,now,{
      inRaga:offset=>singRaga!=='none'&&(offset===12||!!ragaNote(offset)),
      labelAt:offset=>offset===12?'Upper Sa':LIVE_SWARAS[offset][0]
    });
  }
  function followVoice(now){
    if(!listening||!sound.analyser||host.hidden||mode!=='see')return;
    if(now-lastAnalysis>=55){
      lastAnalysis=now;
      sound.analyser.getFloatTimeDomainData(micSamples);
      const frequency=detectLivePitch(micSamples,sound.ctx.sampleRate);
      if(frequency)showPitch(frequency,now);
      else if(now-lastVoice>700){clearLive();previousMidi=null;}
    }
    if(now-lastDraw>=LIVE_GRAPH_FRAME_MS-1){drawTrace(now);lastDraw=now;}
    micFrame=requestAnimationFrame(followVoice);
  }
  async function startMic(){
    if(micPending||listening){stop();render();return;}
    stop();micError='';
    const token=++requestId,controller=new AbortController();
    micController=controller;micPending=true;render();
    try{
      await sound.unlock();
      if(token!==requestId)return;
      await sound.microphone(controller.signal);
      if(token!==requestId||host.hidden||mode!=='see'){sound.releaseMic();return;}
      sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;
      micSamples=new Float32Array(sound.analyser.fftSize);
      micPending=false;listening=true;lastAnalysis=0;lastDraw=0;lastVoice=performance.now();render();
      micFrame=requestAnimationFrame(followVoice);
    }catch(error){
      if(token!==requestId||error.name==='AbortError')return;
      micPending=false;micController=null;sound.releaseMic();
      micError=error.name==='NotAllowedError'?'Microphone access was declined. Allow access in your browser settings and try again.':error.name==='NotFoundError'?'No microphone was found. Connect one and try again.':error.message||'Microphone could not start. Please try again.';
      render();
    }
  }
  function finishFind(){
    finding=false;micController=null;cancelAnimationFrame(micFrame);micFrame=0;sound.releaseMic();micSamples=null;
    const result=suggestBaseShruthi(findSamples);
    findResult=result.base===undefined?null:result;
    findError=result.error||'';
    render();
  }
  function followFindVoice(now){
    if(!finding||!sound.analyser||host.hidden||mode!=='find')return;
    const elapsed=Math.min(FIND_SECONDS,(now-findStart)/1000);
    const progress=host.querySelector('.tool-find-progress');
    if(progress){progress.setAttribute('aria-valuenow',String(Math.round(100*elapsed/FIND_SECONDS)));host.querySelector('#tool-find-progress-fill').style.width=`${100*elapsed/FIND_SECONDS}%`;}
    if(now-lastAnalysis>=55){
      lastAnalysis=now;sound.analyser.getFloatTimeDomainData(micSamples);
      const frequency=detectLivePitch(micSamples,sound.ctx.sampleRate);
      if(frequency)findSamples.push(frequency);
    }
    if(elapsed>=FIND_SECONDS){finishFind();return;}
    micFrame=requestAnimationFrame(followFindVoice);
  }
  async function startFind(){
    if(findPending||finding){stop();render();return;}
    stop();findResult=null;findError='';findSamples=[];
    const token=++requestId,controller=new AbortController();
    micController=controller;findPending=true;render();
    try{
      await sound.unlock();
      if(token!==requestId)return;
      await sound.microphone(controller.signal);
      if(token!==requestId||host.hidden||mode!=='find'){sound.releaseMic();return;}
      sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;
      micSamples=new Float32Array(sound.analyser.fftSize);
      findPending=false;finding=true;findStart=performance.now();lastAnalysis=0;render();
      micFrame=requestAnimationFrame(followFindVoice);
    }catch(error){
      if(token!==requestId||error.name==='AbortError')return;
      findPending=false;micController=null;sound.releaseMic();
      findError=error.name==='NotAllowedError'?'Microphone access was declined. Allow access in your browser settings and try again.':error.name==='NotFoundError'?'No microphone was found. Connect one and try again.':error.message||'Microphone could not start. Please try again.';
      render();
    }
  }
  function piano(){
    const base=getSettings().base,whiteWidth=58,blackWidth=38;
    const offsets=Array.from({length:25},(_,i)=>i-5);
    const firstBlack=isBlack(base-5),lastBlack=isBlack(base+19);
    const lead=firstBlack?blackWidth/2:0,trail=lastBlack?blackWidth/2:0;
    let whites=0;
    const centers=new Map();
    const keys=offsets.map(offset=>{
      const black=isBlack(base+offset),left=black?lead+whites*whiteWidth-blackWidth/2:lead+whites*whiteWidth;
      centers.set(offset,left+(black?blackWidth:whiteWidth)/2);
      if(!black)whites++;
      const inRaga=offset===12||!!ragaNote(offset);
      const keyLabel=label(offset),midi=base+offset;
      return `<button type="button" class="piano-key ${black?'black':'white'}${inRaga?' in-raga':''}${selectedOffset===offset?' selected':''}${playingOffset===offset?' playing':''}" data-key="${offset}" style="left:${left}px" aria-label="Play ${offset===12?'Upper Sa':keyLabel} in the ${register(offset).toLowerCase()}, ${noteName(midi)}, ${midiHz(midi).toFixed(2)} hertz" aria-pressed="${playingOffset===offset}" title="${register(offset)} · ${keyLabel} · ${noteName(midi)}"><span>${offset===12?'Upper Sa':keyLabel}</span></button>`;
    }).join('');
    const width=lead+whites*whiteWidth+trail;
    const rangeLabels=[['Lower Pa → Sa',-5,0],['Sa → Upper Sa',0,12],['Upper Sa → Pa',12,19]].map(([name,start,end])=>`<span style="left:${(centers.get(start)+centers.get(end))/2}px">${name}</span>`).join('');
    return `<div class="tool-surface"><div class="tool-surface-heading">${toolHeading()}</div><div class="piano-scroll" role="group" aria-label="Piano from lower Pa through middle Sa to higher Pa"><div class="piano-registers" style="width:${width}px">${rangeLabels}</div><div class="piano" style="width:${width}px">${keys}</div></div><div class="piano-footer">${detail(selectedOffset)}<button class="secondary-button" id="tool-stop" ${playingOffset===null?'disabled':''}>Stop playing ■</button></div><p class="tool-caption">All twelve pitch positions are playable. Green keys belong to ${RAGAS[getSettings().raga].name}; your Sa is ${noteName(base)}. Playback time follows Practice settings.</p></div>`;
  }
  function render(){
    host.innerHTML=`<p class="eyebrow">SWARA TOOLS</p><h1 class="progress-intro">Explore every pitch.</h1><p class="page-description">Sing to see your pitch, play a swara, or find a comfortable shruthi.</p><div class="tool-tabs" role="tablist" aria-label="Swara tools"><button role="tab" data-tool="see" aria-selected="${mode==='see'}">Sing</button><button role="tab" data-tool="play" aria-selected="${mode==='play'}">Play</button><button role="tab" data-tool="find" aria-selected="${mode==='find'}">Find my shruthi</button></div>${mode==='see'?liveView():mode==='find'?findView():piano()}`;
    if(mode==='see')requestAnimationFrame(()=>{if(!host.hidden)drawTrace();});
  }
  function reset(){stop();selectedOffset=0;liveHistory=[];if(!applyingFind){findResult=null;findError='';}if(!host.hidden)render();}
  async function play(offset){
    if(playingOffset===offset){stop();render();return;}
    stop();selectedOffset=offset;
    const token=++requestId;
    try{
      await sound.unlock();
      if(token!==requestId||host.hidden||mode!=='play')return;
      const duration=Number(getSettings().duration);
      sound.tone(midiHz(getSettings().base+offset),duration);
      playingOffset=offset;render();
      timer=setTimeout(()=>{if(token===requestId){playingOffset=null;render();}},duration*1000+150);
    }catch{playingOffset=null;render();}
  }
  host.addEventListener('click',event=>{
    const tab=event.target.closest('[data-tool]');
    if(tab){if(mode!==tab.dataset.tool){stop();mode=tab.dataset.tool;render();}return;}
    if(event.target.closest('#tool-stop')){stop();render();return;}
    if(event.target.closest('#tool-mic')){startMic();return;}
    if(event.target.closest('#tool-find-start')){startFind();return;}
    if(event.target.closest('#tool-find-use')&&findResult){applyingFind=true;try{onSelection({base:findResult.base,raga:getSettings().raga});}finally{applyingFind=false;}return;}
    if(event.target.closest('#tool-clear-trace')){liveHistory=[];drawTrace();return;}
    const key=event.target.closest('[data-key]');
    if(key)play(Number(key.dataset.key));
  });
  host.addEventListener('change',event=>{
    if(!event.target.matches('#tool-base,#tool-raga'))return;
    if(mode==='see'&&event.target.id==='tool-raga'){
      singRaga=event.target.value;
      render();return;
    }
    const base=Number(host.querySelector('#tool-base').value),raga=host.querySelector('#tool-raga').value;
    stop();onSelection({base,raga:mode==='see'?getSettings().raga:raga});
  });
  window.addEventListener('resize',()=>{if(mode==='see'&&!host.hidden)drawTrace();});
  return {render,stop,reset};
}
