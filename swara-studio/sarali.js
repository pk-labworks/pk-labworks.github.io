import {RAGAS} from './music.js?v=20261123-1';
import {selectionFields} from './selection.js?v=20261122-8';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {liveReadoutMarkup,clearLiveReadout,showLiveReadout} from './live-readout.js?v=20261123-6';

// The source lesson uses seven scale degrees. Missing degrees become holds so
// five-note ragas keep the same eight-beat Aadi taalam shape.
const PATTERNS=[
  ['s r g m | p d | n S','S n d p | m g | r s'],
  ['s r - s r - | s r | g m','s r g m | p d | n S','S n - S n - | S n | d p','S n d p | m g | r s'],
  ['s r g - s | r g - | s r','s r g m | p d | n S','S n d - S | n d - | S n','S n d p | m g | r s'],
  ['s r g m - | s r | g m -','s r g m | p d | n S','S n d p - | S n | d p -','S n d p | m g | r s'],
  ['s r g m | p , - | s r','s r g m | p d | n S','S n d p | m , - | S n','S n d p | m g | r s'],
  ['s r g m | p d - | s r','s r g m | p d | n S','S n d p | m g - | S n','S n d p | m g | r s'],
  ['s r g m | p d | n ,','s r g m | p d | n S','S n d p | m g | r ,','S n d p | m g | r s'],
  ['s r g m | p m | g r','s r g m | p d | n S','S n d p | m p | d n','S n d p | m g | r s'],
  ['s r g m | p m | d p','s r g m | p d | n S','S n d p | m p | g m','S n d p | m g | r s'],
  ['s r g m | p , | g m','p , , , | p , | , ,','g m p d | n d | p m','g m p - g | m g | r s'],
  ['S , n d | n , | d p','d , p m | p , | p ,','g m p d | n d | p m','g m p - g | m g | r s'],
  ['S S n d | n n | d p','d d p m | p , | p ,','g m p d | n d | p m','g m p - g | m g | r s'],
  ['s r g r | g , - | g m','p m p , - | d p | d ,','m p d p | d n | d p','m p d p | m g | r s'],
  ['s r g m | p , | p ,','d d p , | m m | p ,','d n S , | S n | d p','S n d p | m g | r s']
];

const code=note=>note.offset===12?"S'":note.variant.replace(/[₁₂₃]/g,n=>({'₁':'1','₂':'2','₃':'3'})[n]);

export function adaptNotationLine(line,raga){
  let previous=null;
  return line.split('|').map(bar=>bar.trim().split(/\s+/).flatMap(token=>{
    if(token==='-')return [];
    if(token===',')return previous?[{code:'~',label:'—',hold:true}]:[];
    const note=token==='S'?raga.notes.at(-1):raga.notes.find(item=>item.offset!==12&&item.variant[0].toLowerCase()===token);
    if(!note){
      if(previous)return [{code:'~',label:'—',hold:true}];
      const degrees='srgmpdn',target=degrees.indexOf(token);
      const nearest=raga.notes.filter(item=>item.offset!==12).sort((a,b)=>Math.abs(degrees.indexOf(a.variant[0].toLowerCase())-target)-Math.abs(degrees.indexOf(b.variant[0].toLowerCase())-target))[0];
      previous=nearest;
      return [{code:code(nearest),label:nearest.variant,hold:false}];
    }
    previous=note;
    return [{code:code(note),label:note.offset===12?'Ṡ':note.variant,hold:false}];
  })).filter(bar=>bar.length);
}

export function saraliPattern(ragaId,index){
  const raga=RAGAS[ragaId];
  if(!raga||!Number.isInteger(index)||index<0||index>=PATTERNS.length)throw new Error('Choose a Sarali Varasai pattern.');
  const lines=PATTERNS[index].map(line=>adaptNotationLine(line,raga));
  return {lines,notes:lines.map(bars=>bars.flat().map(beat=>beat.code).join(' ')).join('\n')};
}

export function createSaraliVarasai({sound,getSettings,onSelection}){
  const host=document.getElementById('sarali-view');
  let selected=0,tempo=50,running=false,runId=0,frame=0,micActive=false,micBuffer=null,previousMidi=null;
  const $=id=>host.querySelector('#'+id);
  function showLineWindow(lineIndex){
    host.querySelectorAll('[data-score-line]').forEach(row=>{
      const index=Number(row.dataset.scoreLine);
      row.hidden=Math.abs(index-lineIndex)>1;
      row.classList.toggle('current',index===lineIndex);
    });
  }
  function stop(message=''){
    runId++;running=false;cancelAnimationFrame(frame);frame=0;
    if(micActive){sound.releaseMic();micActive=false;micBuffer=null;}
    sound.stopNotes();
    host.querySelectorAll('[data-score-line]').forEach(row=>{row.hidden=false;row.classList.remove('current');});
    clearLiveReadout(host,'sarali');previousMidi=null;
    const play=$('sarali-practice');
    if(play){play.textContent='Play and sing pattern';play.disabled=false;}
    host.querySelectorAll('[data-pattern],#sarali-base,#sarali-raga,#sarali-tempo').forEach(el=>el.disabled=false);
    if(message&&$('sarali-status'))$('sarali-status').textContent=message;
  }
  function render(){
    if(running)stop();
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=saraliPattern(settings.raga,selected);
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">LEARNING PATH · 01</p><h1>Sarali Varasai.</h1></div>
      <div class="sarali-panel"><div class="sarali-top">${selectionFields('sarali',settings)}</div>
      <p class="sarali-scale">${raga.notes.map(note=>note.variant).join(' &nbsp; ')}</p>
      <p class="sarali-instruction">Aadi taalam. Listen to one line, then sing it for the same number of beats.</p>
      <label class="sarali-tempo-label">Tempo (BPM) <input id="sarali-tempo" type="number" min="30" max="180" step="1" value="${tempo}"></label>
      <div class="sarali-picker" role="group" aria-label="Sarali Varasai patterns">${PATTERNS.map((_,i)=>`<button type="button" data-pattern="${i}" aria-pressed="${i===selected}">${String(i+1).padStart(2,'0')}</button>`).join('')}</div>
      <div class="sarali-score"><h2>Pattern ${String(selected+1).padStart(2,'0')}</h2>${pattern.lines.map((bars,line)=>`<div class="sarali-score-line" data-score-line="${line}"><span class="sarali-line-number">${line+1}</span>${bars.map(bar=>`<span class="sarali-bar">${bar.map(beat=>`<span class="${beat.hold?'hold':''}" aria-label="${beat.hold?'Hold previous swara':beat.label}">${beat.label}</span>`).join('')}</span>`).join('')}</div>`).join('')}</div>
      <div class="sarali-actions"><button id="sarali-practice" class="primary-button" type="button">Play and sing pattern</button><button id="sarali-next" class="secondary-button" type="button" hidden>Next pattern →</button></div>
      <p id="sarali-status" class="session-status" role="status">Ready for pattern ${selected+1}.</p>
      ${liveReadoutMarkup('sarali')}
      <div class="session-progress"><i id="sarali-progress-fill"></i></div>
      <p class="sarali-source">Adapted from “Sarali Varisai” in <em>karnATik Beginners’ Lessons Notation</em> (Rani, 2002). Missing swaras are held for one beat in five-note ragas.</p></div>`;
    for(const id of ['sarali-base','sarali-raga'])host.querySelector(`#${id}`).onchange=()=>onSelection({base:Number(host.querySelector('#sarali-base').value),raga:host.querySelector('#sarali-raga').value});
    host.querySelectorAll('[data-pattern]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.pattern);render();});
    $('sarali-tempo').onchange=()=>{const value=Number($('sarali-tempo').value);tempo=Number.isInteger(value)?Math.max(30,Math.min(180,value)):50;$('sarali-tempo').value=tempo;};
    $('sarali-practice').onclick=()=>running?stop('Stopped. Choose a pattern or play again.'):start();
    $('sarali-next').onclick=()=>{selected=(selected+1)%PATTERNS.length;render();};
  }
  async function start(){
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=saraliPattern(settings.raga,selected);
    stop();const token=++runId;
    $('sarali-next').hidden=true;$('sarali-practice').textContent='Preparing…';$('sarali-practice').disabled=true;
    $('sarali-status').textContent='Preparing your pattern…';
    host.querySelectorAll('[data-pattern],#sarali-base,#sarali-raga,#sarali-tempo').forEach(el=>el.disabled=true);
    try{
      await sound.unlock();if(token!==runId)return;
      let micWarning='';
      try{await sound.microphone();if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
      catch{micWarning='Microphone unavailable; the pattern will still play.';}
      const beat=60/tempo,ctx=sound.ctx,timeline=[],startAt=ctx.currentTime+.15;
      let cursor=startAt;
      for(const [lineIndex,bars] of pattern.lines.entries()){
        const beats=bars.flat(),duration=beats.length*beat;
        timeline.push({lineIndex,beats,refStart:cursor,refEnd:cursor+duration,singStart:cursor+duration+.3,singEnd:cursor+duration*2+.3});
        let i=0;
        while(i<beats.length){
          const item=beats[i];
          if(item.hold){i++;continue;}
          let length=1;while(i+length<beats.length&&beats[i+length].hold)length++;
          const note=raga.notes.find(n=>code(n)===item.code);
          if(note)sound.scheduleReference(settings.base+note.offset,cursor+i*beat,length*beat);
          i+=length;
        }
        cursor+=duration*2+.55;
      }
      running=true;$('sarali-practice').disabled=false;$('sarali-practice').textContent='Stop pattern';
      $('sarali-status').textContent=micWarning||'Listen to line 1.';
      let lastMic=0,lastVoiceAt=0,displayedLine=-1,showingVoice=false;
      const animate=()=>{
        if(!running||token!==runId)return;
        const now=ctx.currentTime,last=timeline.at(-1);
        if(now>=last.singEnd){
          $('sarali-progress-fill').style.width='100%';
          stop('Pattern complete. Continue with the next pattern or replay this one.');
          showLineWindow(last.lineIndex);
          $('sarali-next').hidden=false;return;
        }
        const part=timeline.find(item=>now<item.singEnd+.25);
        if(part){
          const listening=now<part.refEnd,singing=now>=part.singStart;
          if(displayedLine!==part.lineIndex){showLineWindow(part.lineIndex);displayedLine=part.lineIndex;}
          $('sarali-status').textContent=listening?`Listen to line ${part.lineIndex+1} of ${timeline.length}.`:singing?`Sing line ${part.lineIndex+1} of ${timeline.length}.`:'Get ready to sing.';
          $('sarali-progress-fill').style.width=`${Math.round(100*Math.max(0,(now-startAt)/(last.singEnd-startAt)))}%`;
          if(!singing&&showingVoice){clearLiveReadout(host,'sarali');previousMidi=null;showingVoice=false;}
          if(singing)showingVoice=true;
          if(singing&&micActive&&now-lastMic>.07){
            lastMic=now;sound.analyser.getFloatTimeDomainData(micBuffer);
            const hz=detectLivePitch(micBuffer,ctx.sampleRate);
            if(hz){previousMidi=showLiveReadout(host,'sarali',hz,settings.base,previousMidi);lastVoiceAt=now;}
            else if(now-lastVoiceAt>.7){clearLiveReadout(host,'sarali');previousMidi=null;}
          }
        }
        frame=requestAnimationFrame(animate);
      };
      frame=requestAnimationFrame(animate);
    }catch(error){if(token!==runId)return;stop(error.message||'Could not start the pattern.');}
  }
  render();
  return {render,stop};
}
