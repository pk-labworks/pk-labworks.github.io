import {RAGAS,PITCH_POSITION_LABELS,midiHz,noteName,detectPitch} from './music.js?v=20261116-13';

export function createTools({sound,getSettings,getNotes,onSettings}){
  const host=document.getElementById('tools-view');
  let mode='see',selectedOffset=0,playingOffset=null,timer=null,requestId=0;
  let micController=null,micPending=false,listening=false,micFrame=0,lastFrame=0,lastVoice=0,micError='',recentPitches=[];
  const blackPitchClasses=new Set([1,3,6,8,10]);
  const isBlack=midi=>blackPitchClasses.has(((midi%12)+12)%12);
  const position=offset=>((offset%12)+12)%12;
  const ragaNote=offset=>getNotes().find(note=>note.offset===position(offset));
  const label=offset=>{
    if(offset===12)return 'Upper Sa';
    const note=ragaNote(offset);
    return note?note.name+note.variant.slice(1):PITCH_POSITION_LABELS[position(offset)];
  };
  const register=offset=>offset<0?'Lower octave':offset>=12?'Higher octave':'Middle octave';
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
    if(micPending||listening)sound.releaseMic();
    micPending=false;listening=false;recentPitches=[];
    host.querySelectorAll('.piano-key.playing').forEach(key=>key.classList.remove('playing'));
    const button=host.querySelector('#tool-stop');
    if(button)button.disabled=true;
  }
  function liveView(){
    const rows=Array.from({length:13},(_,i)=>12-i).map(offset=>{
      const inRaga=offset===12||!!ragaNote(offset);
      return `<div class="live-pitch-row${inRaga?' in-raga':''}" data-live-row="${offset}"><span class="live-position">${String(offset).padStart(2,'0')}</span><span class="live-line"></span><strong>${offset===12?'Upper Sa':label(offset)}</strong><span class="live-marker" aria-hidden="true"></span></div>`;
    }).join('');
    const state=micPending?'Connecting to microphone…':micError||'';
    return `<div class="tool-surface"><div class="tool-surface-heading"><div><h2>Sing and see the swara</h2><p>Sing a note. Your Sa is ${noteName(getSettings().base)}. Green positions belong to ${RAGAS[getSettings().raga].name}.</p></div><button class="secondary-button" id="tool-settings">Change shruthi or raga</button></div><div class="live-toolbar"><button class="primary-button" id="tool-mic" aria-pressed="${micPending||listening}">${micPending?'Cancel listening':listening?'Stop listening':'Start listening'}</button><span id="tool-mic-status" role="status">${state}</span></div><div class="live-pitch-layout"><div class="live-readout"><span class="label">YOU ARE SINGING</span><strong id="tool-live-note" aria-live="polite">—</strong><span id="tool-live-register">Sing to see your swara</span><div class="live-measures"><div><span class="label">YOUR PITCH</span><strong id="tool-live-hz">—</strong></div><div><span class="label">NEAREST PITCH</span><strong id="tool-live-cents">—</strong></div></div><p id="tool-live-raga"></p></div><div class="live-scale" role="img" aria-label="Twelve pitch positions from Sa to Upper Sa. The current sung pitch is marked while listening.">${rows}</div></div><p class="tool-caption">Pitch positions repeat in each octave.</p></div>`;
  }
  function clearLive(){
    const note=host.querySelector('#tool-live-note');if(!note)return;
    note.textContent='—';
    host.querySelector('#tool-live-register').textContent='Sing to see your swara';
    host.querySelector('#tool-live-hz').textContent='—';
    host.querySelector('#tool-live-cents').textContent='—';
    host.querySelector('#tool-live-raga').textContent='';
    host.querySelectorAll('.live-pitch-row.current').forEach(row=>row.classList.remove('current'));
  }
  function showPitch(hz){
    const exact=12*Math.log2(hz/midiHz(getSettings().base));
    const nearest=Math.round(exact),pitchClass=position(nearest);
    const note=ragaNote(nearest),variant=nearest===12?'Upper Sa':note?label(nearest):PITCH_POSITION_LABELS[pitchClass];
    const octave=nearest<0?'Lower octave':nearest>=12?'Higher octave':'Middle octave';
    const swaraName=nearest===12?'Upper Sa':nearest<0?'Lower '+variant:nearest>12?'Higher '+variant:variant;
    const cents=Math.round((exact-nearest)*100);
    host.querySelector('#tool-live-note').textContent=swaraName;
    host.querySelector('#tool-live-register').textContent=`${octave} · ${noteName(getSettings().base+nearest)}`;
    host.querySelector('#tool-live-hz').textContent=`${hz.toFixed(1)} Hz`;
    host.querySelector('#tool-live-cents').textContent=`${cents>0?'+':''}${cents} cents`;
    host.querySelector('#tool-live-raga').textContent=note||pitchClass===0?`In ${RAGAS[getSettings().raga].name}`:`Outside ${RAGAS[getSettings().raga].name}`;
    host.querySelectorAll('.live-pitch-row.current').forEach(row=>row.classList.remove('current'));
    const displayOffset=nearest===12?12:pitchClass;
    host.querySelector(`[data-live-row="${displayOffset}"]`)?.classList.add('current');
  }
  function followVoice(now){
    if(!listening||!sound.analyser||host.hidden||mode!=='see')return;
    if(now-lastFrame>=75){
      lastFrame=now;
      const buffer=new Float32Array(sound.analyser.fftSize);
      sound.analyser.getFloatTimeDomainData(buffer);
      const found=detectPitch(buffer,sound.ctx.sampleRate);
      if(found){
        lastVoice=now;recentPitches.push(found.hz);if(recentPitches.length>5)recentPitches.shift();
        const sorted=[...recentPitches].sort((a,b)=>a-b);
        showPitch(sorted[Math.floor(sorted.length/2)]);
      }else if(now-lastVoice>350){recentPitches=[];clearLive();}
    }
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
      micPending=false;listening=true;lastFrame=0;lastVoice=performance.now();render();
      micFrame=requestAnimationFrame(followVoice);
    }catch(error){
      if(token!==requestId||error.name==='AbortError')return;
      micPending=false;micController=null;sound.releaseMic();
      micError=error.name==='NotAllowedError'?'Microphone access was declined. Allow access in your browser settings and try again.':error.name==='NotFoundError'?'No microphone was found. Connect one and try again.':error.message||'Microphone could not start. Please try again.';
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
    return `<div class="tool-surface"><div class="tool-surface-heading"><div><h2>Play the swara</h2><p>Tap any key to hear it for ${getSettings().duration} seconds. Tap it again or use Stop to end the sound.</p></div><button class="secondary-button" id="tool-settings">Change shruthi or raga</button></div><div class="piano-scroll" role="group" aria-label="Piano from lower Pa through middle Sa to higher Pa"><div class="piano-registers" style="width:${width}px">${rangeLabels}</div><div class="piano" style="width:${width}px">${keys}</div></div><div class="piano-footer">${detail(selectedOffset)}<button class="secondary-button" id="tool-stop" ${playingOffset===null?'disabled':''}>Stop playing ■</button></div><p class="tool-caption">All twelve pitch positions are playable. Green keys belong to ${RAGAS[getSettings().raga].name}; your Sa is ${noteName(base)}. Playback time follows Practice settings.</p></div>`;
  }
  function render(){
    host.innerHTML=`<p class="eyebrow">SWARA TOOLS</p><h1 class="progress-intro">Explore every pitch.</h1><p class="page-description">Sing to see your pitch, or hear a swara on a keyboard set to your shruthi.</p><div class="tool-tabs" role="tablist" aria-label="Swara tools"><button role="tab" data-tool="see" aria-selected="${mode==='see'}">Sing and see the swara</button><button role="tab" data-tool="play" aria-selected="${mode==='play'}">Play the swara</button></div>${mode==='see'?liveView():piano()}`;
  }
  function reset(){stop();selectedOffset=0;if(!host.hidden)render();}
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
    if(event.target.closest('#tool-settings')){stop();onSettings();return;}
    if(event.target.closest('#tool-stop')){stop();render();return;}
    if(event.target.closest('#tool-mic')){startMic();return;}
    const key=event.target.closest('[data-key]');
    if(key)play(Number(key.dataset.key));
  });
  return {render,stop,reset};
}
