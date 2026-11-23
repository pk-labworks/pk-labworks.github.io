import {RAGAS} from './music.js?v=20261123-1';
import {detectLivePitch,livePitchReading} from './swara-live-core.js?v=20261121-1';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-8';

const STORAGE_KEY='swara-studio-custom-session-v1';
const digit=letter=>({'₁':'1','₂':'2','₃':'3'})[letter]||letter;
const sequenceTokens=text=>text.replace(/upper\s+sa/gi,'UpperSa').replace(/[₁₂₃]/g,digit).split(/[\s,;|]+/).filter(Boolean);

export function parseSwaraSequence(text,raga){
  const notes=raga.notes;
  const tokens=sequenceTokens(text);
  if(!tokens.length)throw new Error('Enter at least one swara.');
  if(tokens.length>64)throw new Error('Use 64 swaras or fewer in one session.');
  const sequence=tokens.map((raw,position)=>{
    if(raw==='~'){
      if(position===0)throw new Error('A hold (~) needs a swara before it.');
      return null;
    }
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
  sequence.forEach((index,position)=>{if(index===null)sequence[position]=sequence[position-1];});
  return sequence;
}

export function createPracticeSession({sound,getSettings,onSelection}){
  const host=document.getElementById('session-view');
  const defaults=()=>({base:getSettings().base,raga:getSettings().raga,tempo:50,notes:'',source:''});
  let state=defaults();
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved&&SHRUTHIS.includes(saved.base)&&RAGAS[saved.raga]&&Number.isInteger(saved.tempo)&&saved.tempo>=30&&saved.tempo<=180&&typeof saved.notes==='string'&&saved.notes.length<=600){state={...defaults(),...saved,base:getSettings().base,raga:getSettings().raga};delete state.sound;}
  }catch{}
  let running=false,runId=0,frame=0,micController=null,micActive=false,micBuffer=null,lastMicFrame=0,previousMidi=null;
  const $=id=>host.querySelector(`#${id}`);
  const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}};
  const swaraLabel=note=>note.offset===12?'Upper Sa':note.name+note.variant.slice(1);
  const code=note=>note.offset===12?"S'":note.variant.replace(/[₁₂₃]/g,digit);

  function render(){
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">YOUR PRACTICE SESSION</p><h1>Build your own phrases.</h1><p id="session-source" class="session-source" hidden></p></div>
      <div class="session-builder"><div class="session-fields">
        ${selectionFields('session',state)}
        <label>Tempo (BPM)<input id="session-tempo" type="number" min="30" max="180" step="1" inputmode="numeric"></label>
      </div><label class="session-notes-label" for="session-notes">Swaras</label>
      <textarea id="session-notes" rows="3" spellcheck="false" placeholder="S R2 G3 P D2 S'&#10;S' D2 P G3 R2 S"></textarea>
      <div id="session-swatches" class="session-swatches" aria-label="Add a swara"></div>
      <p class="field-note">Put each line on a new row. One beat per swara or hold (~). S' means Upper Sa.</p>
      <p id="session-error" class="session-error" role="alert" hidden></p>
      <div class="session-actions"><button id="session-play" class="primary-button" type="button">Play and sing <span aria-hidden="true">→</span></button><button id="session-stop" class="secondary-button" type="button" disabled>Stop</button><label class="session-mic-label"><input id="session-mic" type="checkbox" checked> Show my sung note</label></div>
      <p id="session-status" class="session-status" role="status">Listen to each line, then sing it for the same number of beats.</p>
      <div class="session-stage"><div class="session-stage-top"><span class="label">CURRENT SWARA</span><span id="session-count">—</span></div><strong id="session-current">—</strong><div id="session-sequence" class="session-sequence"></div><div class="session-progress"><i id="session-progress-fill"></i></div><p id="session-heard">Your note: —</p></div></div>`;
    $('session-base').value=String(state.base);$('session-raga').value=state.raga;$('session-tempo').value=String(state.tempo);$('session-notes').value=state.notes;
    $('session-base').onchange=()=>{state.base=Number($('session-base').value);save();refreshPreview();onSelection?.({base:state.base,raga:state.raga});};
    $('session-raga').onchange=()=>{state.raga=$('session-raga').value;save();renderSwatches();refreshPreview();onSelection?.({base:state.base,raga:state.raga});};
    $('session-tempo').oninput=()=>{state.tempo=Number($('session-tempo').value);save();refreshPreview();};
    $('session-notes').oninput=()=>{state.notes=$('session-notes').value;state.source='';$('session-source').hidden=true;save();refreshPreview();};
    $('session-mic').onchange=()=>{$('session-heard').hidden=!$('session-mic').checked;};
    $('session-swatches').onclick=event=>{const button=event.target.closest('[data-code]');if(!button)return;const input=$('session-notes');const prefix=input.value;input.value=prefix?`${prefix}${prefix.endsWith('\n')?'':' '}${button.dataset.code}`:button.dataset.code;state.notes=input.value;state.source='';$('session-source').hidden=true;save();refreshPreview();input.focus();};
    $('session-play').onclick=start;
    $('session-stop').onclick=()=>stop('Stopped.');
    renderSwatches();refreshPreview();$('session-heard').hidden=!$('session-mic').checked;
    if(state.source){$('session-source').textContent=state.source;$('session-source').hidden=false;}
  }
  function renderSwatches(){
    $('session-swatches').innerHTML=RAGAS[state.raga].notes.map(note=>`<button type="button" data-code="${code(note)}" aria-label="Add ${swaraLabel(note)}">${code(note)}</button>`).join('');
  }
  function readLines(){
    if(!Number.isInteger(state.tempo)||state.tempo<30||state.tempo>180)throw new Error('Choose a tempo from 30 to 180 BPM.');
    const rows=state.notes.split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
    if(!rows.length)throw new Error('Enter at least one line of swaras.');
    const lines=rows.map(row=>({indices:parseSwaraSequence(row,RAGAS[state.raga]),tokens:sequenceTokens(row)}));
    if(lines.reduce((count,line)=>count+line.indices.length,0)>64)throw new Error('Use 64 beats or fewer in one session.');
    return lines;
  }
  function refreshPreview(){
    if(!running){$('session-current').textContent='—';$('session-progress-fill').style.width='0';$('session-heard').textContent='Your note: —';$('session-status').textContent='Listen to each line, then sing it for the same number of beats.';}
    try{
      const lines=readLines(),notes=RAGAS[state.raga].notes;
      $('session-error').hidden=true;
      $('session-sequence').innerHTML=lines.map((line,lineIndex)=>`<div class="session-score-line"><b>Line ${lineIndex+1}</b>${line.indices.map((i,n)=>`<span data-line="${lineIndex}" data-beat="${n}">${line.tokens[n]==='~'?'Hold '+swaraLabel(notes[i]):swaraLabel(notes[i])}</span>`).join('')}</div>`).join('');
      const beats=lines.reduce((sum,line)=>sum+line.indices.length,0);
      $('session-count').textContent=`${lines.length} line${lines.length===1?'':'s'} · ${beats} beats each way`;
    }catch(error){
      $('session-sequence').innerHTML='';$('session-count').textContent='—';
      if(state.notes.trim()){$('session-error').textContent=error.message;$('session-error').hidden=false;}
      else $('session-error').hidden=true;
    }
  }
  function stop(message=''){
    runId++;running=false;cancelAnimationFrame(frame);frame=0;micController?.abort();micController=null;
    if(micActive){sound.releaseMic();micActive=false;micBuffer=null;}
    sound.stopNotes();
    const play=$('session-play'),halt=$('session-stop');
    if(play){play.disabled=false;halt.disabled=true;for(const id of ['session-base','session-raga','session-tempo','session-notes','session-mic'])$(id).disabled=false;}
    if(message&&$('session-status'))$('session-status').textContent=message;
  }
  async function start(){
    let lines;
    try{lines=readLines();}catch(error){$('session-error').textContent=error.message;$('session-error').hidden=false;return;}
    stop();const token=++runId;
    $('session-error').hidden=true;$('session-play').disabled=true;$('session-stop').disabled=false;
    for(const id of ['session-base','session-raga','session-tempo','session-notes','session-mic'])$(id).disabled=true;
    $('session-status').textContent='Preparing your phrase…';
    const notes=RAGAS[state.raga].notes;
    try{
      await sound.unlock();
      if(token!==runId)return;
      let micWarning='';
      if($('session-mic').checked){
        micController=new AbortController();
        try{await sound.microphone(micController.signal);if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
        catch(error){if(token!==runId)return;micWarning='Microphone unavailable; the session will still play.';}
      }
      const ctx=sound.ctx,beat=60/state.tempo,startAt=ctx.currentTime+.15;
      const timeline=[];
      let cursor=startAt;
      lines.forEach((line,lineIndex)=>{
        const lineDuration=line.indices.length*beat;
        timeline.push({lineIndex,refStart:cursor,refEnd:cursor+lineDuration,singStart:cursor+lineDuration+.25,singEnd:cursor+lineDuration*2+.25});
        cursor+=lineDuration*2+.5;
      });
      timeline.forEach(({lineIndex,refStart})=>{
        const line=lines[lineIndex],segments=[];
        line.indices.forEach((index,beatIndex)=>{
          if(line.tokens[beatIndex]==='~'&&segments.length)segments.at(-1).beats++;
          else segments.push({midi:state.base+notes[index].offset,variant:notes[index].variant,beatIndex,beats:1});
        });
        segments.forEach(({midi,beatIndex,beats})=>sound.scheduleReference(midi,refStart+beatIndex*beat,beats*beat));
      });
      running=true;$('session-status').textContent=micWarning||'Listen to line 1.';
      const animate=()=>{
        if(!running||token!==runId)return;
        const now=ctx.currentTime;
        if(now>=timeline.at(-1).singEnd){$('session-progress-fill').style.width='100%';stop('Session complete. Play it again or change the notes.');return;}
        const part=timeline.find(item=>now<item.singEnd+.25);
        if(part){
          const line=lines[part.lineIndex],listening=now<part.refEnd,singing=now>=part.singStart;
          const phaseStart=listening?part.refStart:part.singStart;
          const current=Math.max(0,Math.min(line.indices.length-1,Math.floor((now-phaseStart)/beat)));
          $('session-current').textContent=swaraLabel(notes[line.indices[current]]);
          $('session-count').textContent=`Line ${part.lineIndex+1} of ${lines.length} · ${listening?'Listen':singing?'Sing':'Get ready'}`;
          $('session-status').textContent=listening?`Listen to line ${part.lineIndex+1}.`:singing?`Sing line ${part.lineIndex+1} now.`:'Get ready to sing.';
          $('session-progress-fill').style.width=`${100*Math.max(0,Math.min(1,(now-startAt)/(timeline.at(-1).singEnd-startAt)))}%`;
          host.querySelectorAll('[data-line][data-beat]').forEach(el=>el.classList.toggle('current',Number(el.dataset.line)===part.lineIndex&&Number(el.dataset.beat)===current));
          if(!singing)$('session-heard').textContent='Your note: —';
        }
        if(micActive&&part&&now>=part.singStart&&now<part.singEnd&&now-lastMicFrame>.07){
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
  function loadPattern({base,raga,notes,title}){
    stop();state={...state,base,raga,notes,source:title};save();render();
  }
  function syncSelection({base,raga}){
    if(state.base===base&&state.raga===raga)return;
    state.base=base;state.raga=raga;state.source='';save();
    if($('session-base')){
      $('session-base').value=String(base);$('session-raga').value=raga;
      $('session-source').hidden=true;renderSwatches();refreshPreview();
    }
  }
  return {render,stop,loadPattern,start,syncSelection};
}
