import {RAGAS} from './music.js?v=20261123-3';
import {selectionFields} from './selection.js?v=20261122-8';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {liveReadoutMarkup,clearLiveReadout,showLiveReadout} from './live-readout.js?v=20261123-6';

const rows=text=>text.trim().split('\n').map(line=>line.trim());
export const ALANKARAS=[
  {name:'Chatusra jati Dhruva',short:'Dhruva',groups:[4,2,4,4],lines:rows(`
    s r g m | g r | s r g r | s r g m
    r g m p | m g | r g m g | r g m p
    g m p d | p m | g m p m | g m p d
    m p d n | d p | m p d p | m p d n
    p d n S | n d | p d n d | p d n S
    S n d p | d n | S n d n | S n d p
    n d p m | p d | n d p d | n d p m
    d p m g | m p | d p m p | d p m g
    p m g r | g m | p m g m | p m g r
    m g r s | r g | m g r g | m g r s`)},
  {name:'Chatusra jati Matya',short:'Matya',groups:[4,2,4],lines:rows(`
    s r g r | s r | s r g m
    r g m g | r g | r g m p
    g m p m | g m | g m p d
    m p d p | m p | m p d n
    p d n d | p d | p d n S
    S n d n | S n | S n d p
    n d p d | n d | n d p m
    d p m p | d p | d p m g
    p m g m | p m | p m g r
    m g r g | m g | m g r s`)},
  {name:'Chatusra jati Rupaka',short:'Rupaka',groups:[2,4],lines:rows(`
    s r | s r g m
    r g | r g m p
    g m | g m p d
    m p | m p d n
    p d | p d n S
    S n | S n d p
    n d | n d p m
    d p | d p m g
    p m | p m g r
    m g | m g r s`)},
  {name:'Misra jati Jhampa',short:'Jhampa',groups:[7,1,2],lines:rows(`
    s r g s r s r | g | m ,
    r g m r g r g | m | p ,
    g m p g m g m | p | d ,
    m p d m p m p | d | n ,
    p d n p d p d | n | S ,
    S n d S n S n | d | p ,
    n d p n d n d | p | m ,
    d p m d p d p | m | g ,
    p m g p m p m | g | r ,
    m g r m g m g | r | s ,`)},
  {name:'Tisra jati Triputa',short:'Triputa',groups:[3,2,2],lines:rows(`
    s r g | s r | g m
    r g m | r g | m p
    g m p | g m | p d
    m p d | m p | d n
    p d n | p d | n S
    S n d | S n | d p
    n d p | n d | p m
    d p m | d p | m g
    p m g | p m | g r
    m g r | m g | r s`)},
  {name:'Khanda jati Ata',short:'Ata',groups:[5,5,2,2],lines:rows(`
    s r , g , | s , r g , | m , | m ,
    r g , m , | r , g m , | p , | p ,
    g m , p , | g , m p , | d , | d ,
    m p , d , | m , p d , | n , | n ,
    p d , n , | p , d n , | S , | S ,
    S n , d , | S , n d , | p , | p ,
    n d , p , | n , d p , | m , | m ,
    d p , m , | d , p m , | g , | g ,
    p m , g , | p , m g , | r , | r ,
    m g , r , | m , g r , | s , | s ,`)},
  {name:'Chatusra jati Eka',short:'Eka',groups:[4],lines:rows(`
    s r g m
    r g m p
    g m p d
    m p d n
    p d n S
    S n d p
    n d p m
    d p m g
    p m g r
    m g r s`)},
  {name:'Sankeerna jati Eka · version 1',short:'Eka · version 1',groups:[9],lines:rows(`
    s , r , g , m p d
    r , g , m , p d n
    g , m , p , d n S
    S , n , d , p m g
    n , d , p , m g r
    d , p , m , g r s`)},
  {name:'Sankeerna jati Eka · version 2',short:'Eka · version 2',groups:[9],lines:rows(`
    s r , g m , p d n
    r g , m p , d n S
    S n , d p , m g r
    n d , p m , g r s`)}
];

const noteCode=note=>note.offset===12?"S'":note.variant.replace(/[₁₂₃]/g,digit=>({'₁':'1','₂':'2','₃':'3'})[digit]);
const sourceDegrees='srgmpdnS';

function adaptAlankaraLine(line,raga,shift){
  return line.split('|').map(bar=>bar.trim().split(/\s+/).map(token=>{
    if(token===',')return {code:'~',label:'—',hold:true};
    const degree=sourceDegrees.indexOf(token);
    if(degree<0)throw new Error(`Unknown Alankara swara: ${token}.`);
    const note=raga.notes[Math.max(0,Math.min(raga.notes.length-1,degree+shift))];
    return {code:noteCode(note),label:note.offset===12?'Ṡ':note.variant,hold:false};
  }));
}

export function alankaraPattern(ragaId,index){
  const raga=RAGAS[ragaId],pattern=ALANKARAS[index];
  if(!raga||!pattern)throw new Error('Choose an Alankara pattern.');
  const sourceHalf=pattern.lines.length/2,octaveDegrees=raga.notes.length-1;
  const lineCount=Math.max(1,sourceHalf-(7-octaveDegrees));
  const ascending=pattern.lines.slice(0,lineCount).map(line=>adaptAlankaraLine(line,raga,0));
  const descending=pattern.lines.slice(sourceHalf,sourceHalf+lineCount).map(line=>adaptAlankaraLine(line,raga,octaveDegrees-7));
  const lines=[...ascending,...descending];
  for(const bars of lines){
    if(bars.length!==pattern.groups.length||bars.some((bar,i)=>bar.length!==pattern.groups[i]))throw new Error(`Alankara ${index+1} has an incorrect beat grouping.`);
  }
  return {...pattern,lines,beats:pattern.groups.reduce((sum,count)=>sum+count,0)};
}

export function createAlankaras({sound,getSettings,onSelection}){
  const host=document.getElementById('alankara-view');
  const $=id=>host.querySelector(`#${id}`);
  let selected=0,tempo=50,running=false,runId=0,frame=0,micActive=false,micBuffer=null,previousMidi=null,lastMicSample=0,lastVoiceAt=0;

  function showLineWindow(lineIndex){
    host.querySelectorAll('[data-alankara-line]').forEach(row=>{
      const index=Number(row.dataset.alankaraLine);
      row.hidden=Math.abs(index-lineIndex)>1;
      row.classList.toggle('current',index===lineIndex);
    });
  }
  function stop(message=''){
    runId++;running=false;cancelAnimationFrame(frame);frame=0;
    sound.stopNotes();
    if(micActive){sound.releaseMic();micActive=false;micBuffer=null;}
    clearLiveReadout(host,'alankara');previousMidi=null;
    host.querySelectorAll('[data-alankara-line]').forEach(row=>{row.hidden=false;row.classList.remove('current');});
    host.querySelectorAll('[data-alankara-beat]').forEach(note=>note.classList.remove('current-beat'));
    const play=$('alankara-practice');
    if(play){play.textContent='Play and sing pattern';play.disabled=false;}
    host.querySelectorAll('[data-alankara],#alankara-base,#alankara-raga,#alankara-tempo').forEach(el=>el.disabled=false);
    if(message&&$('alankara-status'))$('alankara-status').textContent=message;
  }
  function render(){
    if(running)stop();
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=alankaraPattern(settings.raga,selected);
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">LEARNING PATH · 02</p><h1>Alankaras.</h1></div>
      <div class="sarali-panel alankara-panel"><div class="sarali-top">${selectionFields('alankara',settings)}</div>
      <p class="sarali-scale">${raga.notes.map(note=>note.variant).join(' &nbsp; ')}</p>
      <p class="sarali-instruction">Listen to one line, then sing it for the same number of beats.</p>
      <label class="sarali-tempo-label">Tempo (BPM) <input id="alankara-tempo" type="number" min="30" max="180" step="1" value="${tempo}"></label>
      <div class="alankara-picker" role="group" aria-label="Alankara patterns">${ALANKARAS.map((item,i)=>`<button type="button" data-alankara="${i}" aria-pressed="${i===selected}"><span>${String(i+1).padStart(2,'0')}</span><strong>${item.short}</strong></button>`).join('')}</div>
      <div class="alankara-meta"><strong>${pattern.name}</strong><span>${pattern.beats} beats · ${pattern.groups.join(' + ')}</span></div>
      <div class="sarali-score alankara-score"><h2>Pattern ${String(selected+1).padStart(2,'0')}</h2>${pattern.lines.map((bars,lineIndex)=>`<div class="sarali-score-line" data-alankara-line="${lineIndex}"><span class="sarali-line-number">${lineIndex+1}</span>${bars.map((bar,barIndex)=>`<span class="sarali-bar">${bar.map((beat,beatIndex)=>`<span class="${beat.hold?'hold':''}" data-alankara-beat="${bars.slice(0,barIndex).reduce((sum,part)=>sum+part.length,0)+beatIndex}" aria-label="${beat.hold?'Hold previous swara':beat.label}">${beat.label}</span>`).join('')}</span>`).join('')}</div>`).join('')}</div>
      <div class="sarali-actions"><button id="alankara-practice" class="primary-button" type="button">Play and sing pattern</button><button id="alankara-next" class="secondary-button" type="button" hidden>Next alankara →</button></div>
      <p id="alankara-status" class="session-status" role="status">Ready for pattern ${selected+1}.</p>
      ${liveReadoutMarkup('alankara')}
      <div class="session-progress"><i id="alankara-progress-fill"></i></div>
      <p class="sarali-source">Adapted from “Alankaarams” (lesson 6) in <em>karnATik Beginners’ Lessons Notation</em> (Rani, 2002). Patterns follow the selected raga’s swaras through Upper Sa; wide patterns repeat an endpoint when needed to complete the taalam.</p></div>`;
    for(const id of ['alankara-base','alankara-raga'])$(id).onchange=()=>onSelection({base:Number($('alankara-base').value),raga:$('alankara-raga').value});
    host.querySelectorAll('[data-alankara]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.alankara);render();});
    $('alankara-tempo').oninput=()=>{const value=Number($('alankara-tempo').value);if(Number.isInteger(value)&&value>=30&&value<=180)tempo=value;};
    $('alankara-tempo').onchange=()=>{const value=Number($('alankara-tempo').value);tempo=Number.isInteger(value)?Math.max(30,Math.min(180,value)):50;$('alankara-tempo').value=tempo;};
    $('alankara-practice').onclick=()=>running?stop('Stopped. Choose an alankara or play again.'):start();
    $('alankara-next').onclick=()=>{selected=(selected+1)%ALANKARAS.length;render();};
  }
  async function waitUntil(time,token){
    while(sound.ctx.currentTime<time){
      if(token!==runId)throw new DOMException('Stopped','AbortError');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(token!==runId)throw new DOMException('Stopped','AbortError');
  }
  function scheduleLine(beats,notesByCode,base,beat,startAt){
    const segments=[];
    beats.forEach((item,beatIndex)=>{
      if(item.hold&&segments.length)segments.at(-1).beats++;
      else{
        const note=notesByCode.get(item.code);
        if(!note)throw new Error(`The note ${item.code} is not in this raga.`);
        segments.push({midi:base+note.offset,beatIndex,beats:1});
      }
    });
    segments.forEach(({midi,beatIndex,beats})=>sound.scheduleReference(midi,startAt+beatIndex*beat,beats*beat));
  }
  async function runPhase({lineIndex,beats,phase,beat,base,totalBeats,completedBeats,token,startAt}){
    const duration=beats.length*beat;
    showLineWindow(lineIndex);
    if(phase==='listen'){clearLiveReadout(host,'alankara');previousMidi=null;lastVoiceAt=0;}
    const animate=()=>{
      if(!running||token!==runId)return;
      const now=sound.ctx.currentTime,elapsed=Math.max(0,now-startAt),current=Math.min(beats.length-1,Math.floor(elapsed/beat));
      $('alankara-status').textContent=`${phase==='listen'?'Listen to':'Sing'} line ${lineIndex+1} of ${totalBeats.lines}.`;
      $('alankara-progress-fill').style.width=`${Math.min(100,100*(completedBeats+elapsed/beat)/(totalBeats.beats*2))}%`;
      host.querySelectorAll('[data-alankara-beat]').forEach(note=>note.classList.toggle('current-beat',Number(note.closest('[data-alankara-line]').dataset.alankaraLine)===lineIndex&&Number(note.dataset.alankaraBeat)===current));
      if(phase==='sing'&&micActive&&now>=startAt&&now-lastMicSample>=.07){
        lastMicSample=now;sound.analyser.getFloatTimeDomainData(micBuffer);
        const hz=detectLivePitch(micBuffer,sound.ctx.sampleRate);
        if(hz){previousMidi=showLiveReadout(host,'alankara',hz,base,previousMidi);lastVoiceAt=now;}
        else if(now-lastVoiceAt>.7){clearLiveReadout(host,'alankara');previousMidi=null;}
      }
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    try{await waitUntil(startAt+duration,token);}finally{cancelAnimationFrame(frame);frame=0;}
  }
  async function start(){
    const settings=getSettings(),pattern=alankaraPattern(settings.raga,selected),lines=pattern.lines.map(bars=>bars.flat()),notesByCode=new Map(RAGAS[settings.raga].notes.map(note=>[noteCode(note),note]));
    stop();const token=++runId;
    $('alankara-next').hidden=true;$('alankara-practice').textContent='Preparing…';$('alankara-practice').disabled=true;
    $('alankara-status').textContent='Preparing your pattern…';
    host.querySelectorAll('[data-alankara],#alankara-base,#alankara-raga,#alankara-tempo').forEach(el=>el.disabled=true);
    try{
      await sound.unlock();if(token!==runId)return;
      try{await sound.microphone();if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
      catch{if(token!==runId)return;}
      const beat=60/tempo,total={lines:lines.length,beats:lines.reduce((sum,line)=>sum+line.length,0)};
      running=true;$('alankara-practice').disabled=false;$('alankara-practice').textContent='Stop pattern';
      let completedBeats=0;
      for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
        const beats=lines[lineIndex],refStart=sound.ctx.currentTime+.1;
        scheduleLine(beats,notesByCode,settings.base,beat,refStart);
        await runPhase({lineIndex,beats,phase:'listen',beat,base:settings.base,totalBeats:total,completedBeats,token,startAt:refStart});
        completedBeats+=beats.length;
        await waitUntil(sound.ctx.currentTime+.25,token);
        const singStart=sound.ctx.currentTime+.1;
        await runPhase({lineIndex,beats,phase:'sing',beat,base:settings.base,totalBeats:total,completedBeats,token,startAt:singStart});
        completedBeats+=beats.length;
      }
      stop('Pattern complete. Continue with the next alankara or replay this one.');
      $('alankara-progress-fill').style.width='100%';showLineWindow(lines.length-1);$('alankara-next').hidden=false;
    }catch(error){if(token!==runId||error.name==='AbortError')return;stop(error.message||'The pattern could not start.');}
  }
  render();
  return {render,stop};
}
