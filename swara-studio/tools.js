import {RAGAS,PITCH_POSITION_LABELS,midiHz,noteName} from './music.js?v=20261116-13';
import {LIVE_SWARAS,LIVE_WINDOW_MS,LIVE_GRAPH_FRAME_MS,detectLivePitch,livePitchReading,drawLiveTrace} from './swara-live-core.js?v=20261121-1';
import {selectionFields} from './selection.js?v=20261122-1';

export function createTools({sound,getSettings,getNotes,onSelection}){
  const host=document.getElementById('tools-view');
  let mode='see',selectedOffset=0,playingOffset=null,timer=null,requestId=0;
  let micController=null,micPending=false,listening=false,micFrame=0,lastAnalysis=0,lastDraw=0,lastVoice=0,micError='',previousMidi=null,micSamples=null,liveHistory=[];
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
  const toolHeading=()=>`<div class="tool-current-settings">${selectionFields('tool',getSettings())}</div>`;
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
    micPending=false;listening=false;previousMidi=null;micSamples=null;
    clearLive();
    const micButton=host.querySelector('#tool-mic');
    if(micButton){micButton.textContent='Start';micButton.setAttribute('aria-label','Start pitch detection');micButton.setAttribute('aria-pressed','false');}
    const status=host.querySelector('#tool-mic-status');if(status)status.textContent='';
    host.querySelectorAll('.piano-key.playing').forEach(key=>key.classList.remove('playing'));
    const button=host.querySelector('#tool-stop');
    if(button)button.disabled=true;
  }
  function liveView(){
    const scale=LIVE_SWARAS.map(([name,description],index)=>`<div class="swara-live-scale-item${ragaNote(index)?' in-raga':''}" data-scale-index="${index}"><strong>${name}</strong><small>${description.split(' / ')[1]}</small></div>`).join('');
    const state=micPending?'Connecting to microphone…':micError||'';
    return `<div class="tool-surface swara-live-tool"><div class="tool-surface-heading">${toolHeading()}</div><div class="live-toolbar"><button class="primary-button" id="tool-mic" aria-pressed="${micPending||listening}" aria-label="${micPending?'Cancel microphone request':listening?'Stop pitch detection':'Start pitch detection'}">${micPending?'Cancel':listening?'Stop':'Start'}</button><span id="tool-mic-status" role="status">${state}</span></div><section class="swara-live-readout" aria-label="Current sung pitch"><div class="swara-live-note-row"><div><strong id="tool-live-note" aria-live="polite">—</strong><span id="tool-live-name">Your note will appear here</span></div><div class="swara-live-western"><strong id="tool-live-western">—</strong><span id="tool-live-hz">— Hz</span></div></div><div class="swara-live-tuning"><span>FLAT</span><div class="swara-live-tuning-track"><i></i><i id="tool-tuning-dot"></i></div><span>SHARP</span></div><p id="tool-live-cents">Sing to see your tuning</p></section><section class="swara-live-trace"><div class="swara-live-section-heading"><h3>Last 2 seconds</h3><button class="secondary-button" id="tool-clear-trace" type="button">Clear graph</button></div><canvas id="tool-live-trace" role="img" aria-label="Live pitch trace over the last two seconds, from Sa to Upper Sa, scrolling under a fixed now marker"></canvas><p>Notes outside this octave appear in the readout above.</p></section><section class="swara-live-scale-section"><h3>Swaras around your Sa</h3><div class="swara-live-scale-grid">${scale}</div></section><p class="tool-caption">Microphone audio stays on this device.</p></div>`;
  }
  function clearLive(){
    const note=host.querySelector('#tool-live-note');if(!note)return;
    note.textContent='—';
    host.querySelector('#tool-live-name').textContent='Your note will appear here';
    host.querySelector('#tool-live-western').textContent='—';
    host.querySelector('#tool-live-hz').textContent='— Hz';
    host.querySelector('#tool-live-cents').textContent='Sing to see your tuning';
    host.querySelector('#tool-tuning-dot').style.left='50%';
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
    host.querySelector('#tool-tuning-dot').style.left=`${reading.tuningPosition}%`;
    host.querySelectorAll('.swara-live-scale-item').forEach((item,i)=>item.classList.toggle('active',i===reading.index));
    liveHistory.push({midi:reading.exactMidi,time:now});
  }
  function drawTrace(now=performance.now()){
    liveHistory=liveHistory.filter(point=>point.time>=now-LIVE_WINDOW_MS);
    drawLiveTrace(host.querySelector('#tool-live-trace'),liveHistory,getSettings().base,now,{
      inRaga:offset=>offset===12||!!ragaNote(offset),
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
    host.innerHTML=`<p class="eyebrow">SWARA TOOLS</p><h1 class="progress-intro">Explore every pitch.</h1><p class="page-description">Sing to see your pitch, or hear a swara on a keyboard set to your shruthi.</p><div class="tool-tabs" role="tablist" aria-label="Swara tools"><button role="tab" data-tool="see" aria-selected="${mode==='see'}">Sing</button><button role="tab" data-tool="play" aria-selected="${mode==='play'}">Play</button></div>${mode==='see'?liveView():piano()}`;
    if(mode==='see')requestAnimationFrame(()=>{if(!host.hidden)drawTrace();});
  }
  function reset(){stop();selectedOffset=0;liveHistory=[];if(!host.hidden)render();}
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
    if(event.target.closest('#tool-clear-trace')){liveHistory=[];drawTrace();return;}
    const key=event.target.closest('[data-key]');
    if(key)play(Number(key.dataset.key));
  });
  host.addEventListener('change',event=>{
    if(!event.target.matches('#tool-base,#tool-raga'))return;
    const base=Number(host.querySelector('#tool-base').value),raga=host.querySelector('#tool-raga').value;
    stop();onSelection({base,raga});
  });
  window.addEventListener('resize',()=>{if(mode==='see'&&!host.hidden)drawTrace();});
  return {render,stop,reset};
}
