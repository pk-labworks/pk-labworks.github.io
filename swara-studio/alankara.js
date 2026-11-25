import {RAGAS} from './music.js?v=20261125-5';
import {selectionFields} from './selection.js?v=20261122-8';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {liveReadoutMarkup,clearLiveReadout,showLiveReadout} from './live-readout.js?v=20261123-6';
import {scorePatternLine,shouldRetryPatternLine,lineFeedbackMarkup,patternSummaryMarkup} from './pattern-feedback.js?v=20261125-5';
import {countInForLine} from './tempo-guide.js?v=20261125-5';

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
    if(play){play.textContent='Listen and Sing';play.disabled=false;}
    const memory=$('alankara-just-sing');
    if(memory){memory.textContent='Just Sing';memory.disabled=false;}
    host.querySelectorAll('[data-alankara],#alankara-base,#alankara-raga,#alankara-tempo').forEach(el=>el.disabled=false);
    if(message&&$('alankara-status'))$('alankara-status').textContent=message;
  }
  function render(){
    if(running)stop();
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=alankaraPattern(settings.raga,selected);
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">LEARNING PATH · 02</p><h1>Alankaras.</h1></div>
      <div class="sarali-panel alankara-panel"><div class="sarali-top">${selectionFields('alankara',settings)}</div>
      <p class="sarali-scale">${raga.notes.map(note=>note.variant).join(' &nbsp; ')}</p>
      <p class="sarali-instruction">Listen and Sing plays each line first. Just Sing uses beat clicks at the set tempo, without swara playback.</p>
      <label class="sarali-tempo-label">Tempo (BPM) <input id="alankara-tempo" type="number" min="30" max="180" step="1" value="${tempo}"></label>
      <div class="alankara-picker" role="group" aria-label="Alankara patterns">${ALANKARAS.map((item,i)=>`<button type="button" data-alankara="${i}" aria-pressed="${i===selected}"><span>${String(i+1).padStart(2,'0')}</span><strong>${item.short}</strong></button>`).join('')}</div>
      <div class="alankara-meta"><strong>${pattern.name}</strong><span>${pattern.beats} beats · ${pattern.groups.join(' + ')}</span></div>
      <div class="sarali-actions"><button id="alankara-practice" class="primary-button" type="button">Listen and Sing</button><button id="alankara-just-sing" class="secondary-button" type="button">Just Sing</button><button id="alankara-next" class="secondary-button" type="button" hidden>Next alankara →</button></div>
      <p id="alankara-status" class="session-status" role="status">Ready for pattern ${selected+1}.</p>
      <div id="alankara-stage" class="session-stage pattern-stage"><div class="session-stage-top"><span class="label">CURRENT SWARA</span><span id="alankara-count">${pattern.lines.length} lines</span></div><strong id="alankara-current">—</strong>
      <div class="sarali-score alankara-score"><h2>Pattern ${String(selected+1).padStart(2,'0')}</h2>${pattern.lines.map((bars,lineIndex)=>`<div class="sarali-score-line" data-alankara-line="${lineIndex}"><span class="sarali-line-number">${lineIndex+1}</span>${bars.map((bar,barIndex)=>`<span class="sarali-bar">${bar.map((beat,beatIndex)=>`<span class="${beat.hold?'hold':''}" data-alankara-beat="${bars.slice(0,barIndex).reduce((sum,part)=>sum+part.length,0)+beatIndex}" aria-label="${beat.hold?'Hold previous swara':beat.label}">${beat.label}</span>`).join('')}</span>`).join('')}</div>`).join('')}</div>
      <div id="alankara-line-feedback" class="pattern-line-feedback" role="status" aria-live="polite" hidden></div>
      ${liveReadoutMarkup('alankara')}<div class="session-progress"><i id="alankara-progress-fill"></i></div></div>
      <div id="alankara-results" class="session-results" hidden></div>
      <p class="sarali-source">Adapted from “Alankaarams” (lesson 6) in <em>karnATik Beginners’ Lessons Notation</em> (Rani, 2002). Patterns follow the selected raga’s swaras through Upper Sa; wide patterns repeat an endpoint when needed to complete the taalam.</p></div>`;
    for(const id of ['alankara-base','alankara-raga'])$(id).onchange=()=>onSelection({base:Number($('alankara-base').value),raga:$('alankara-raga').value});
    host.querySelectorAll('[data-alankara]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.alankara);render();});
    $('alankara-tempo').oninput=()=>{const value=Number($('alankara-tempo').value);if(Number.isInteger(value)&&value>=30&&value<=180)tempo=value;};
    $('alankara-tempo').onchange=()=>{const value=Number($('alankara-tempo').value);tempo=Number.isInteger(value)?Math.max(30,Math.min(180,value)):50;$('alankara-tempo').value=tempo;};
    $('alankara-practice').onclick=()=>running?stop('Stopped. Choose an alankara or play again.'):start();
    $('alankara-just-sing').onclick=()=>running?stop('Stopped. Choose an alankara or play again.'):start({justSing:true});
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
  async function runPhase({lineIndex,beats,phase,attempt,maxAttempts,beat,base,lineCount,token,startAt}){
    const duration=beats.length*beat,samples=[];
    let lastLabel='—';
    const cueLabels=beats.map(item=>item.hold?lastLabel:(lastLabel=item.label));
    showLineWindow(lineIndex);
    if(phase==='listen'){clearLiveReadout(host,'alankara');previousMidi=null;lastVoiceAt=0;$('alankara-line-feedback').hidden=true;}
    if(phase==='sing'){$('alankara-line-feedback').hidden=true;if(maxAttempts===1){clearLiveReadout(host,'alankara');previousMidi=null;lastVoiceAt=0;}}
    const animate=()=>{
      if(!running||token!==runId)return;
      const now=sound.ctx.currentTime,elapsed=Math.max(0,now-startAt),current=Math.min(beats.length-1,Math.floor(elapsed/beat));
      $('alankara-current').textContent=cueLabels[current];
      $('alankara-count').textContent=`Line ${lineIndex+1} of ${lineCount} · ${phase==='listen'?'Listen':'Sing'}${maxAttempts>1?` · try ${attempt} of ${maxAttempts}`:''}`;
      $('alankara-status').textContent=`${phase==='listen'?'Listen to':'Sing'} line ${lineIndex+1} of ${lineCount}${maxAttempts>1?` · try ${attempt} of ${maxAttempts}`:''}.`;
      const phaseProgress=phase==='listen'?.5*Math.min(1,elapsed/duration):.5+.5*Math.min(1,elapsed/duration);
      $('alankara-progress-fill').style.width=`${100*(lineIndex+phaseProgress)/lineCount}%`;
      host.querySelectorAll('[data-alankara-beat]').forEach(note=>note.classList.toggle('current-beat',Number(note.closest('[data-alankara-line]').dataset.alankaraLine)===lineIndex&&Number(note.dataset.alankaraBeat)===current));
      if(phase==='sing'&&micActive&&now>=startAt&&now-lastMicSample>=.06){
        lastMicSample=now;sound.analyser.getFloatTimeDomainData(micBuffer);
        const hz=detectLivePitch(micBuffer,sound.ctx.sampleRate);
        samples.push({t:elapsed,hz:hz||null});
        if(hz){previousMidi=showLiveReadout(host,'alankara',hz,base,previousMidi);lastVoiceAt=now;}
        else if(now-lastVoiceAt>.7){clearLiveReadout(host,'alankara');previousMidi=null;}
      }
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    try{await waitUntil(startAt+duration,token);}finally{cancelAnimationFrame(frame);frame=0;}
    return samples;
  }
  async function start({justSing=false}={}){
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=alankaraPattern(settings.raga,selected),lines=pattern.lines.map(bars=>bars.flat()),notesByCode=new Map(raga.notes.map(note=>[noteCode(note),note]));
    stop();const token=++runId;
    const activeButton=$(justSing?'alankara-just-sing':'alankara-practice');
    $('alankara-next').hidden=true;$('alankara-line-feedback').hidden=true;$('alankara-results').hidden=true;
    $('alankara-progress-fill').style.width='0';activeButton.textContent='Preparing…';$('alankara-practice').disabled=true;$('alankara-just-sing').disabled=true;
    $('alankara-status').textContent='Preparing your pattern…';
    host.querySelectorAll('[data-alankara],#alankara-base,#alankara-raga,#alankara-tempo').forEach(el=>el.disabled=true);
    try{
      await sound.unlock();if(token!==runId)return;
      try{await sound.microphone();if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
      catch{if(token!==runId)return;}
      if(justSing&&!micActive)throw new Error('Allow microphone access to use Just Sing and receive feedback.');
      const beat=60/tempo,tolerance=({beginner:35,intermediate:25,advanced:15})[settings.level]||35,results=[];
      running=true;activeButton.disabled=false;activeButton.textContent='Stop pattern';
      showLineWindow(0);
      $('alankara-stage').scrollIntoView({block:'center'});
      if(justSing){$('alankara-status').textContent=`Count in at ${tempo} BPM.`;$('alankara-current').textContent='Get ready';$('alankara-count').textContent=`Line 1 of ${lines.length} · Just Sing`;}
      for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
        const beats=lines[lineIndex],attempts=[],maxAttempts=justSing?1:(micActive?3:1);
        for(let attempt=1;attempt<=maxAttempts;attempt++){
          if(!justSing){
            const refStart=sound.ctx.currentTime+.1;
            scheduleLine(beats,notesByCode,settings.base,beat,refStart);
            await runPhase({lineIndex,beats,phase:'listen',attempt,maxAttempts,beat,base:settings.base,lineCount:lines.length,token,startAt:refStart});
            await waitUntil(sound.ctx.currentTime+.25,token);
          }
          const singStart=justSing
            ?await countInForLine({sound,beat,lineBeats:beats.length,waitUntil,token,onBeat:remaining=>{
              showLineWindow(lineIndex);
              $('alankara-line-feedback').hidden=true;
              $('alankara-current').textContent=String(remaining);
              $('alankara-count').textContent=`Line ${lineIndex+1} of ${lines.length} · Count in · ${tempo} BPM`;
              $('alankara-status').textContent=`Sing line ${lineIndex+1} after ${remaining} ${remaining===1?'beat':'beats'}.`;
            }})
            :sound.ctx.currentTime+.1;
          const samples=await runPhase({lineIndex,beats,phase:'sing',attempt,maxAttempts,beat,base:settings.base,lineCount:lines.length,token,startAt:singStart});
          if(micActive){
            const result=scorePatternLine(samples,beats,beat,settings.base,raga.notes,tolerance,noteCode);
            attempts.push(result);
            $('alankara-line-feedback').innerHTML=lineFeedbackMarkup(lineIndex,attempt,result,raga.notes,{singlePass:justSing,lastLine:lineIndex===lines.length-1});
            $('alankara-line-feedback').hidden=false;
            await waitUntil(sound.ctx.currentTime+1.2,token);
            if(justSing||!shouldRetryPatternLine(result.score,attempt))break;
          }else{
            $('alankara-line-feedback').innerHTML=`<strong>Line ${lineIndex+1} complete</strong><p>Allow microphone access for a score.</p>`;
            $('alankara-line-feedback').hidden=false;
            await waitUntil(sound.ctx.currentTime+1.2,token);
          }
        }
        results.push({attempts});
      }
      stop('Pattern complete. Continue with the next alankara or replay this one.');
      $('alankara-progress-fill').style.width='100%';showLineWindow(lines.length-1);$('alankara-next').hidden=false;
      const needsPractice=justSing&&results.some(line=>line.attempts[0]?.score<60);
      $('alankara-results').innerHTML=patternSummaryMarkup(results,raga.notes,tolerance,{singlePass:justSing})+(needsPractice?'<button id="alankara-guided-retry" class="primary-button" type="button">Listen and Sing</button>':'');
      $('alankara-results').hidden=false;
      if(needsPractice)$('alankara-guided-retry').onclick=()=>start();
      $('alankara-results').scrollIntoView({block:'nearest'});
    }catch(error){if(token!==runId||error.name==='AbortError')return;stop(error.message||'The pattern could not start.');}
  }
  render();
  return {render,stop};
}
