import {RAGAS} from './music.js?v=20261123-1';
import {selectionFields} from './selection.js?v=20261122-8';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {liveReadoutMarkup,clearLiveReadout,showLiveReadout} from './live-readout.js?v=20261123-6';
import {scorePatternLine,shouldRetryPatternLine,lineFeedbackMarkup,patternSummaryMarkup} from './pattern-feedback.js?v=20261125-3';

// The source lesson uses seven scale degrees. In five-note ragas, omitted
// swaras move their beats to the end of each line so Aadi taalam stays intact.
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
const noteForToken=(token,raga)=>token==='S'?raga.notes.at(-1):raga.notes.find(item=>item.offset!==12&&item.variant[0].toLowerCase()===token);
const hold=()=>({code:'~',label:'—',hold:true});

function adaptFiveNoteLine(line,raga){
  const bars=line.split('|').map(bar=>bar.trim().split(/\s+/).filter(token=>token!=='-'));
  const beats=[];
  let sourceNote=null;
  for(const bar of bars)for(const token of bar){
    if(token===','){
      if(sourceNote&&noteForToken(sourceNote,raga))beats.push(hold());
      continue;
    }
    sourceNote=token;
    const note=noteForToken(token,raga);
    if(note)beats.push({code:code(note),label:note.offset===12?'Ṡ':note.variant,hold:false});
  }
  const total=bars.reduce((sum,bar)=>sum+bar.length,0);
  if(!beats.some(beat=>!beat.hold))throw new Error('A Sarali Varasai line has no notes in this raga.');
  while(beats.length<total)beats.push(hold());
  let offset=0;
  return bars.map(bar=>{const section=beats.slice(offset,offset+bar.length);offset+=bar.length;return section;});
}

export function adaptNotationLine(line,raga){
  if(raga.notes.length===6)return adaptFiveNoteLine(line,raga);
  let previous=null;
  return line.split('|').map(bar=>bar.trim().split(/\s+/).flatMap(token=>{
    if(token==='-')return [];
    if(token===',')return previous?[hold()]:[];
    const note=noteForToken(token,raga);
    if(!note){
      if(previous)return [hold()];
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
    host.querySelectorAll('[data-sarali-beat]').forEach(note=>note.classList.remove('current-beat'));
    clearLiveReadout(host,'sarali');previousMidi=null;
    const play=$('sarali-practice');
    if(play){play.textContent='Listen and Sing';play.disabled=false;}
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
      <div class="sarali-actions"><button id="sarali-practice" class="primary-button" type="button">Listen and Sing</button><button id="sarali-next" class="secondary-button" type="button" hidden>Next pattern →</button></div>
      <p id="sarali-status" class="session-status" role="status">Ready for pattern ${selected+1}.</p>
      <div id="sarali-stage" class="session-stage pattern-stage"><div class="session-stage-top"><span class="label">CURRENT SWARA</span><span id="sarali-count">${pattern.lines.length} lines</span></div><strong id="sarali-current">—</strong>
      <div class="sarali-score"><h2>Pattern ${String(selected+1).padStart(2,'0')}</h2>${pattern.lines.map((bars,line)=>`<div class="sarali-score-line" data-score-line="${line}"><span class="sarali-line-number">${line+1}</span>${bars.map((bar,barIndex)=>`<span class="sarali-bar">${bar.map((beat,beatIndex)=>`<span class="${beat.hold?'hold':''}" data-sarali-beat="${bars.slice(0,barIndex).reduce((sum,part)=>sum+part.length,0)+beatIndex}" aria-label="${beat.hold?'Hold previous swara':beat.label}">${beat.label}</span>`).join('')}</span>`).join('')}</div>`).join('')}</div>
      <div id="sarali-line-feedback" class="pattern-line-feedback" role="status" aria-live="polite" hidden></div>
      ${liveReadoutMarkup('sarali')}<div class="session-progress"><i id="sarali-progress-fill"></i></div></div>
      <div id="sarali-results" class="session-results" hidden></div>
      <p class="sarali-source">Adapted from “Sarali Varisai” in <em>karnATik Beginners’ Lessons Notation</em> (Rani, 2002). In five-note ragas, skipped swaras extend the final note of each line.</p></div>`;
    for(const id of ['sarali-base','sarali-raga'])host.querySelector(`#${id}`).onchange=()=>onSelection({base:Number(host.querySelector('#sarali-base').value),raga:host.querySelector('#sarali-raga').value});
    host.querySelectorAll('[data-pattern]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.pattern);render();});
    $('sarali-tempo').oninput=()=>{const value=Number($('sarali-tempo').value);if(Number.isInteger(value)&&value>=30&&value<=180)tempo=value;};
    $('sarali-tempo').onchange=()=>{const value=Number($('sarali-tempo').value);tempo=Number.isInteger(value)?Math.max(30,Math.min(180,value)):50;$('sarali-tempo').value=tempo;};
    $('sarali-practice').onclick=()=>running?stop('Stopped. Choose a pattern or play again.'):start();
    $('sarali-next').onclick=()=>{selected=(selected+1)%PATTERNS.length;render();};
  }
  async function waitUntil(time,token){
    while(sound.ctx.currentTime<time){
      if(token!==runId)throw new DOMException('Stopped','AbortError');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(token!==runId)throw new DOMException('Stopped','AbortError');
  }
  function scheduleLine(beats,raga,base,beat,startAt){
    const notesByCode=new Map(raga.notes.map(note=>[code(note),note]));
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
  async function runPhase({lineIndex,beats,phase,attempt,beat,base,lineCount,token,startAt}){
    const duration=beats.length*beat,samples=[];
    let lastLabel='—';
    const cueLabels=beats.map(item=>item.hold?lastLabel:(lastLabel=item.label));
    showLineWindow(lineIndex);
    if(phase==='listen'){clearLiveReadout(host,'sarali');previousMidi=null;$('sarali-line-feedback').hidden=true;}
    let lastMic=0,lastVoiceAt=0;
    const animate=()=>{
      if(!running||token!==runId)return;
      const now=sound.ctx.currentTime,elapsed=Math.max(0,now-startAt);
      const current=Math.min(beats.length-1,Math.floor(elapsed/beat));
      $('sarali-current').textContent=cueLabels[current];
      $('sarali-count').textContent=`Line ${lineIndex+1} of ${lineCount} · ${phase==='listen'?'Listen':'Sing'}${micActive?` · try ${attempt} of 3`:''}`;
      $('sarali-status').textContent=`${phase==='listen'?'Listen to':'Sing'} line ${lineIndex+1} of ${lineCount}${micActive?` · try ${attempt} of 3`:''}.`;
      const phaseProgress=phase==='listen'?.5*Math.min(1,elapsed/duration):.5+.5*Math.min(1,elapsed/duration);
      $('sarali-progress-fill').style.width=`${100*(lineIndex+phaseProgress)/lineCount}%`;
      host.querySelectorAll('[data-sarali-beat]').forEach(note=>note.classList.toggle('current-beat',Number(note.closest('[data-score-line]').dataset.scoreLine)===lineIndex&&Number(note.dataset.saraliBeat)===current));
      if(phase==='sing'&&micActive&&now>=startAt&&now-lastMic>=.06){
        lastMic=now;sound.analyser.getFloatTimeDomainData(micBuffer);
        const hz=detectLivePitch(micBuffer,sound.ctx.sampleRate);
        samples.push({t:elapsed,hz:hz||null});
        if(hz){previousMidi=showLiveReadout(host,'sarali',hz,base,previousMidi);lastVoiceAt=now;}
        else if(now-lastVoiceAt>.7){clearLiveReadout(host,'sarali');previousMidi=null;}
      }
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    try{await waitUntil(startAt+duration,token);}finally{cancelAnimationFrame(frame);frame=0;}
    return samples;
  }
  async function start(){
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=saraliPattern(settings.raga,selected),lines=pattern.lines.map(bars=>bars.flat());
    stop();const token=++runId;
    $('sarali-next').hidden=true;$('sarali-line-feedback').hidden=true;$('sarali-results').hidden=true;
    $('sarali-progress-fill').style.width='0';$('sarali-practice').textContent='Preparing…';$('sarali-practice').disabled=true;
    $('sarali-status').textContent='Preparing your pattern…';
    host.querySelectorAll('[data-pattern],#sarali-base,#sarali-raga,#sarali-tempo').forEach(el=>el.disabled=true);
    try{
      await sound.unlock();if(token!==runId)return;
      try{await sound.microphone();if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
      catch{if(token!==runId)return;}
      const beat=60/tempo,tolerance=({beginner:35,intermediate:25,advanced:15})[settings.level]||35,results=[];
      running=true;$('sarali-practice').disabled=false;$('sarali-practice').textContent='Stop pattern';
      $('sarali-stage').scrollIntoView({block:'center'});
      for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
        const beats=lines[lineIndex],attempts=[];
        for(let attempt=1;attempt<=(micActive?3:1);attempt++){
          const refStart=sound.ctx.currentTime+.1;
          scheduleLine(beats,raga,settings.base,beat,refStart);
          await runPhase({lineIndex,beats,phase:'listen',attempt,beat,base:settings.base,lineCount:lines.length,token,startAt:refStart});
          await waitUntil(sound.ctx.currentTime+.25,token);
          const singStart=sound.ctx.currentTime+.1;
          const samples=await runPhase({lineIndex,beats,phase:'sing',attempt,beat,base:settings.base,lineCount:lines.length,token,startAt:singStart});
          if(micActive){
            const result=scorePatternLine(samples,beats,beat,settings.base,raga.notes,tolerance,code);
            attempts.push(result);
            $('sarali-line-feedback').innerHTML=lineFeedbackMarkup(lineIndex,attempt,result,raga.notes);
            $('sarali-line-feedback').hidden=false;
            await waitUntil(sound.ctx.currentTime+1.2,token);
            if(!shouldRetryPatternLine(result.score,attempt))break;
          }else{
            $('sarali-line-feedback').innerHTML=`<strong>Line ${lineIndex+1} complete</strong><p>Allow microphone access for a score.</p>`;
            $('sarali-line-feedback').hidden=false;
            await waitUntil(sound.ctx.currentTime+1.2,token);
          }
        }
        results.push({attempts});
      }
      stop('Pattern complete. Continue with the next pattern or replay this one.');
      $('sarali-progress-fill').style.width='100%';showLineWindow(lines.length-1);$('sarali-next').hidden=false;
      $('sarali-results').innerHTML=patternSummaryMarkup(results,raga.notes,tolerance);$('sarali-results').hidden=false;
      $('sarali-results').scrollIntoView({block:'nearest'});
    }catch(error){if(token!==runId||error.name==='AbortError')return;stop(error.message||'Could not start the pattern.');}
  }
  render();
  return {render,stop};
}
