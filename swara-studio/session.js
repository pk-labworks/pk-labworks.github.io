import {RAGAS,practiceSwaras,midiHz,centsBetween} from './music.js?v=20261125-5';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {liveReadoutMarkup,clearLiveReadout,showLiveReadout} from './live-readout.js?v=20261127-1';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-8';
import {countInForLine} from './tempo-guide.js?v=20261125-7';
import {noteWindows,setPitchCircleNote} from './pitch-circle.js?v=20261125-1';

const STORAGE_KEY='swara-studio-custom-session-v1';
const SAVED_KEY='swara-studio-saved-exercises-v1';
const MAX_BEATS=128;
const MAX_SAVED=25;
const PASSING_LINE_SCORE=60;
const digit=letter=>({'₁':'1','₂':'2','₃':'3'})[letter]||letter;
const sequenceTokens=text=>text.replace(/upper\s+sa/gi,'UpperSa').replace(/[₁₂₃]/g,digit).split(/[\s,;|]+/).filter(Boolean);

export function parseSwaraSequence(text,raga){
  const notes=practiceSwaras(raga);
  const tokens=sequenceTokens(text);
  if(!tokens.length)throw new Error('Enter at least one swara.');
  if(tokens.length>MAX_BEATS)throw new Error(`Use ${MAX_BEATS} swaras or fewer in one session.`);
  const sequence=tokens.map((raw,position)=>{
    if(raw==='~'){
      if(position===0)throw new Error('A hold (~) needs a swara before it.');
      return null;
    }
    const token=raw.toUpperCase().replace(/[’‘]/g,"'");
    if(/^(UPPERSA|S['^+.]|SA['^+.])$/.test(token))return notes.findIndex(note=>note.offset===12);
    if(token==='S'||token==='SA')return 0;
    const match=token.match(/^(R|RI|G|GA|M|MA|P|PA|D|DA|N|NI)([123])?([_'])?$/);
    if(!match)throw new Error(`“${raw}” at position ${position+1} is not a swara. Use the swaras shown below.`);
    const letter=match[1][0],variant=match[2],register=match[3]==='_'?'lower':match[3]==="'"?'upper':'middle';
    const index=notes.findIndex(note=>note.register===register&&note.variant[0]===letter&&(!variant||note.variant.slice(1).replace(/[₁₂₃]/g,digit)===variant));
    if(index<0)throw new Error(`“${raw}” is not in ${raga.name}. Choose swaras shown below.`);
    return index;
  });
  sequence.forEach((index,position)=>{if(index===null)sequence[position]=sequence[position-1];});
  return sequence;
}

export function scorePhraseLine(samples,indices,beat,base,notes,tolerance){
  const onset=Math.min(.12,beat*.18);
  const details=indices.map((index,position)=>{
    const voiced=samples.filter(sample=>sample.hz&&sample.t>=position*beat+onset&&sample.t<(position+1)*beat);
    const target=midiHz(base+notes[index].offset);
    const accurate=voiced.filter(sample=>Math.abs(centsBetween(sample.hz,target))<=tolerance).length;
    const coverage=Math.min(1,voiced.length/Math.max(2,(beat-onset)*8));
    return {index,score:voiced.length?Math.round(100*accurate/voiced.length*coverage):0,detected:voiced.length>0};
  });
  const average=Math.round(details.reduce((sum,note)=>sum+note.score,0)/details.length);
  const score=details.some(note=>note.score<PASSING_LINE_SCORE)?Math.min(average,PASSING_LINE_SCORE-1):average;
  return {score,details};
}

export function saveExerciseRecord(exercises,record){
  const index=exercises.findIndex(exercise=>exercise.id===record.id);
  if(index<0&&exercises.length>=MAX_SAVED)throw new Error('You can save up to 25 exercises. Delete one to make room.');
  const next=[...exercises];
  if(index<0)next.push(record);else next[index]=record;
  return next;
}

export const shouldRepeatLine=(score,attempt)=>score<PASSING_LINE_SCORE&&attempt<3;

export function createPracticeSession({sound,getSettings,onSelection}){
  const host=document.getElementById('session-view');
  const defaults=()=>({base:getSettings().base,raga:getSettings().raga,tempo:50,notes:'',name:'',savedId:null,source:''});
  let savedExercises=[];
  try{
    const stored=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');
    if(Array.isArray(stored))savedExercises=stored.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.name.length<=60&&SHRUTHIS.includes(item.base)&&RAGAS[item.raga]&&Number.isInteger(item.tempo)&&item.tempo>=30&&item.tempo<=180&&typeof item.notes==='string'&&item.notes.length<=8192).slice(0,MAX_SAVED);
  }catch{}
  let state=defaults();
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved&&SHRUTHIS.includes(saved.base)&&RAGAS[saved.raga]&&Number.isInteger(saved.tempo)&&saved.tempo>=30&&saved.tempo<=180&&typeof saved.notes==='string'&&saved.notes.length<=8192){state={...defaults(),...saved,base:getSettings().base,raga:getSettings().raga};delete state.sound;}
  }catch{}
  if(!savedExercises.some(exercise=>exercise.id===state.savedId))state.savedId=null;
  let running=false,runId=0,frame=0,micController=null,micActive=false,micBuffer=null,lastMicFrame=0,previousMidi=null,lastVoiceAt=0;
  const $=id=>host.querySelector(`#${id}`);
  const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}};
  const setError=message=>{$('session-error').textContent=message;$('session-error').hidden=false;};
  const swaraLabel=note=>note.offset===12?'Upper Sa':note.name+note.variant.slice(1);
  const code=note=>note.offset===12?"S'":note.variant.replace(/[₁₂₃]/g,digit)+(note.register==='lower'?'_':note.register==='upper'?"'":'');

  function render(){
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">YOUR PRACTICE SESSION</p><h1>Build your own phrases.</h1><p id="session-source" class="session-source" hidden></p></div>
      <div class="session-builder"><div class="saved-exercises"><div class="saved-exercises-heading"><strong>Saved exercises</strong><span id="session-saved-count">0 / 25</span></div><div class="saved-exercises-controls"><select id="session-saved" aria-label="Choose a saved exercise"><option value="">Choose a saved exercise…</option></select><button id="session-new" class="secondary-button" type="button">New</button><button id="session-delete" class="secondary-button" type="button" disabled>Delete</button></div><p>Choose an exercise to load its notes, raga, shruthi, and tempo.</p></div><div class="session-fields">
        ${selectionFields('session',state)}
        <label>Tempo (BPM)<input id="session-tempo" type="number" min="30" max="180" step="1" inputmode="numeric"></label>
      </div><label class="session-notes-label" for="session-notes">Swaras</label>
      <textarea id="session-notes" rows="3" spellcheck="false" placeholder="P_ D2_ S R2 G3 P&#10;S' R2' G3' P' G3' R2'"></textarea>
      <div id="session-swatches" class="session-swatches" aria-label="Add a swara"></div>
      <p class="field-note">Put each line on a new row. One beat per swara or hold (~). Use _ for lower notes (P_) and ' for upper notes (S', R2').</p>
      <div class="session-save-row"><label for="session-name">Exercise name<input id="session-name" type="text" maxlength="60" placeholder="e.g., Mohanam ascent"></label><button id="session-save" class="secondary-button" type="button">Save exercise</button></div>
      <p id="session-error" class="session-error" role="alert" hidden></p>
      <div class="session-actions"><button id="session-play" class="primary-button" type="button">Listen and Sing <span aria-hidden="true">→</span></button><button id="session-just-sing" class="secondary-button" type="button">Sing</button><button id="session-stop" class="secondary-button" type="button" disabled>Stop</button><label class="session-mic-label"><input id="session-mic" type="checkbox" checked> Show my sung note</label></div>
      <p id="session-status" class="session-status" role="status">Listen and Sing plays each line first. Sing gives a four-beat count-in at the start, then beat clicks at the set tempo without swara playback.</p>
      <div id="session-stage" class="session-stage"><div class="session-stage-top"><span class="label">CURRENT SWARA</span><span id="session-count">—</span></div><strong id="session-current">—</strong><div id="session-sequence" class="session-sequence"></div><div id="session-line-feedback" class="pattern-line-feedback" role="status" aria-live="polite" hidden></div><div class="session-progress"><i id="session-progress-fill"></i></div>${liveReadoutMarkup('session')}</div><div id="session-results" class="session-results" hidden></div></div>`;
    $('session-base').value=String(state.base);$('session-raga').value=state.raga;$('session-tempo').value=String(state.tempo);$('session-notes').value=state.notes;$('session-name').value=state.name||'';
    $('session-base').onchange=()=>{state.base=Number($('session-base').value);save();refreshPreview();onSelection?.({base:state.base,raga:state.raga});};
    $('session-raga').onchange=()=>{state.raga=$('session-raga').value;save();renderSwatches();refreshPreview();onSelection?.({base:state.base,raga:state.raga});};
    $('session-tempo').oninput=()=>{state.tempo=Number($('session-tempo').value);save();refreshPreview();};
    $('session-notes').oninput=()=>{state.notes=$('session-notes').value;state.source='';$('session-source').hidden=true;save();refreshPreview();};
    $('session-name').oninput=()=>{state.name=$('session-name').value;save();};
    $('session-swatches').onclick=event=>{const button=event.target.closest('[data-code]');if(!button)return;const input=$('session-notes');const prefix=input.value;input.value=prefix?`${prefix}${prefix.endsWith('\n')?'':' '}${button.dataset.code}`:button.dataset.code;state.notes=input.value;state.source='';$('session-source').hidden=true;save();refreshPreview();input.focus();};
    $('session-play').onclick=()=>start();
    $('session-just-sing').onclick=()=>start({justSing:true});
    $('session-stop').onclick=()=>stop('Stopped.');
    $('session-saved').onchange=()=>{if($('session-saved').value)loadSavedExercise($('session-saved').value);};
    $('session-new').onclick=newExercise;
    $('session-delete').onclick=deleteSavedExercise;
    $('session-save').onclick=saveCurrentExercise;
    renderSavedExercises();renderSwatches();refreshPreview();
    if(state.source){$('session-source').textContent=state.source;$('session-source').hidden=false;}
  }
  function renderSavedExercises(){
    const select=$('session-saved');
    select.replaceChildren(new Option('Choose a saved exercise…',''),...[...savedExercises].reverse().map(exercise=>new Option(exercise.name,exercise.id)));
    select.value=state.savedId||'';
    $('session-saved-count').textContent=`${savedExercises.length} / ${MAX_SAVED}`;
    $('session-save').textContent=state.savedId?'Save changes':'Save exercise';
    $('session-delete').disabled=!state.savedId;
  }
  function saveCurrentExercise(){
    try{
      readLines();
      const existing=savedExercises.find(exercise=>exercise.id===state.savedId);
      const name=($('session-name').value.trim()||existing?.name||`Exercise ${savedExercises.length+1}`).slice(0,60);
      const id=existing?.id||(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const record={id,name,base:state.base,raga:state.raga,tempo:state.tempo,notes:state.notes,updatedAt:Date.now()};
      const next=saveExerciseRecord(savedExercises,record);
      localStorage.setItem(SAVED_KEY,JSON.stringify(next));
      savedExercises=next;state.name=name;state.savedId=id;state.source='';save();
      $('session-name').value=name;$('session-source').hidden=true;$('session-error').hidden=true;
      renderSavedExercises();$('session-status').textContent=`Saved “${name}”. Choose it from Saved exercises any time.`;
    }catch(error){setError(error.name==='QuotaExceededError'?'Device storage is full. Free up space before saving another exercise.':error.message||'The exercise could not be saved.');}
  }
  function loadSavedExercise(id){
    if(running)return;
    const exercise=savedExercises.find(item=>item.id===id);
    if(!exercise)return;
    state={...state,...exercise,savedId:id,source:''};save();render();
    onSelection?.({base:state.base,raga:state.raga});
  }
  function newExercise(){
    if(running)return;
    state={...state,name:'',notes:'',savedId:null,source:''};save();render();$('session-notes').focus();
  }
  function deleteSavedExercise(){
    const exercise=savedExercises.find(item=>item.id===state.savedId);
    if(!exercise||!window.confirm(`Delete “${exercise.name}” from this device?`))return;
    try{
      const next=savedExercises.filter(item=>item.id!==exercise.id);
      localStorage.setItem(SAVED_KEY,JSON.stringify(next));
      savedExercises=next;state.savedId=null;save();renderSavedExercises();
      $('session-status').textContent=`Deleted “${exercise.name}”. The notes remain in the editor until you start a new exercise.`;
    }catch{setError('The exercise could not be deleted from this device.');}
  }
  function renderSwatches(){
    const notes=practiceSwaras(RAGAS[state.raga]);
    $('session-swatches').innerHTML=['lower','middle','upper'].map(register=>`<div class="session-swatch-group"><span>${register==='middle'?'Middle octave':register==='lower'?'Lower Pa–Sa':'Upper Sa–Pa'}</span>${notes.filter(note=>note.register===register).map(note=>`<button type="button" data-code="${code(note)}" aria-label="Add ${swaraLabel(note)}">${code(note)}</button>`).join('')}</div>`).join('');
  }
  function readLines(){
    if(!Number.isInteger(state.tempo)||state.tempo<30||state.tempo>180)throw new Error('Choose a tempo from 30 to 180 BPM.');
    const rows=state.notes.split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
    if(!rows.length)throw new Error('Enter at least one line of swaras.');
    const lines=rows.map(row=>({indices:parseSwaraSequence(row,RAGAS[state.raga]),tokens:sequenceTokens(row)}));
    if(lines.reduce((count,line)=>count+line.indices.length,0)>MAX_BEATS)throw new Error(`Use ${MAX_BEATS} beats or fewer in one session.`);
    return lines;
  }
  function refreshPreview(){
    if(!running){$('session-current').textContent='—';$('session-progress-fill').style.width='0';clearLiveReadout(host,'session');previousMidi=null;$('session-status').textContent='Listen and Sing plays each line first. Sing gives a four-beat count-in at the start, then beat clicks at the set tempo without swara playback.';$('session-line-feedback').hidden=true;$('session-results').hidden=true;}
    try{
      const lines=readLines(),notes=practiceSwaras(RAGAS[state.raga]);
      $('session-error').hidden=true;
      $('session-sequence').innerHTML=lines.map((line,lineIndex)=>`<div class="session-score-line" data-score-line="${lineIndex}"><b>Line ${lineIndex+1}</b>${line.indices.map((i,n)=>`<span data-line="${lineIndex}" data-beat="${n}">${line.tokens[n]==='~'?'Hold '+swaraLabel(notes[i]):swaraLabel(notes[i])}</span>`).join('')}</div>`).join('');
      const beats=lines.reduce((sum,line)=>sum+line.indices.length,0);
      $('session-count').textContent=`${lines.length} line${lines.length===1?'':'s'} · ${beats} beats each way`;
    }catch(error){
      $('session-sequence').innerHTML='';$('session-count').textContent='—';
      if(state.notes.trim()){$('session-error').textContent=error.message;$('session-error').hidden=false;}
      else $('session-error').hidden=true;
    }
  }
  function showLineWindow(lineIndex){
    host.querySelectorAll('.session-score-line').forEach(row=>{
      const index=Number(row.dataset.scoreLine);
      row.hidden=Math.abs(index-lineIndex)>1;
      row.classList.toggle('active-line',index===lineIndex);
    });
  }
  function stop(message=''){
    runId++;running=false;cancelAnimationFrame(frame);frame=0;micController?.abort();micController=null;
    if(micActive){sound.releaseMic();micActive=false;micBuffer=null;}
    sound.stopNotes();
    host.querySelectorAll('.session-score-line').forEach(row=>{row.hidden=false;row.classList.remove('active-line');});
    clearLiveReadout(host,'session');previousMidi=null;
    const readout=host.querySelector('.line-live-readout');if(readout)readout.hidden=true;
    const play=$('session-play'),halt=$('session-stop');
    if(play){play.disabled=false;$('session-just-sing').disabled=false;halt.disabled=true;for(const id of ['session-base','session-raga','session-tempo','session-notes','session-name','session-mic','session-saved','session-new','session-save'])$(id).disabled=false;$('session-delete').disabled=!state.savedId;}
    if(message&&$('session-status'))$('session-status').textContent=message;
  }
  async function waitUntil(time,token){
    while(sound.ctx.currentTime<time){
      if(token!==runId)throw new DOMException('Stopped','AbortError');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(token!==runId)throw new DOMException('Stopped','AbortError');
  }
  function scheduleLine(line,notes,beat,startAt){
    const segments=[];
    line.indices.forEach((index,beatIndex)=>{
      if(line.tokens[beatIndex]==='~'&&segments.length)segments.at(-1).beats++;
      else segments.push({midi:state.base+notes[index].offset,beatIndex,beats:1});
    });
    segments.forEach(({midi,beatIndex,beats})=>sound.scheduleReference(midi,startAt+beatIndex*beat,beats*beat));
  }
  async function runPhase({line,lineIndex,lineCount,attempt,maxAttempts,phase,beat,notes,token,startAt}){
    const duration=line.indices.length*beat,samples=[];
    const windows=noteWindows(line.indices.map((index,position)=>({index,hold:line.tokens[position]==='~'})),item=>midiHz(state.base+notes[item.index].offset));
    const tuningTolerance=({beginner:35,intermediate:25,advanced:15})[getSettings().level]||35;
    showLineWindow(lineIndex);
    host.querySelector('.line-live-readout').hidden=phase!=='sing'||!$('session-mic').checked;
    if(phase==='reference'){clearLiveReadout(host,'session');previousMidi=null;lastVoiceAt=0;}
    if(phase==='sing'){clearLiveReadout(host,'session');previousMidi=null;lastVoiceAt=0;}
    const animate=()=>{
      if(!running||token!==runId)return;
      const now=sound.ctx.currentTime,elapsed=Math.max(0,now-startAt);
      const current=Math.min(line.indices.length-1,Math.floor(elapsed/beat));
      const window=windows[current],noteKey=`${lineIndex}:${attempt}:${window.start}`;
      if(phase==='sing')setPitchCircleNote(host,'session',noteKey);
      $('session-current').textContent=swaraLabel(notes[line.indices[current]]);
      $('session-count').textContent=`Line ${lineIndex+1} of ${lineCount} · ${phase==='reference'?'Listen':'Sing'}${maxAttempts>1?` · try ${attempt} of ${maxAttempts}`:''}`;
      $('session-progress-fill').style.width=`${Math.min(100,100*elapsed/duration)}%`;
      host.querySelectorAll('[data-line][data-beat]').forEach(el=>el.classList.toggle('current',Number(el.dataset.line)===lineIndex&&Number(el.dataset.beat)===current));
      if(phase==='sing'&&micActive&&now>=startAt&&now-lastMicFrame>=.06){
        lastMicFrame=now;sound.analyser.getFloatTimeDomainData(micBuffer);
        const hz=detectLivePitch(micBuffer,sound.ctx.sampleRate);
        samples.push({t:elapsed,hz:hz||null});
        if(hz){previousMidi=showLiveReadout(host,'session',hz,state.base,previousMidi,{noteKey,targetHz:window.targetHz,durationMs:window.beats*beat*1000,sampleMs:60,tolerance:tuningTolerance});lastVoiceAt=now;}
        else if(now-lastVoiceAt>.7){clearLiveReadout(host,'session',{preserveCircle:true});previousMidi=null;}
      }
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    try{await waitUntil(startAt+duration,token);}finally{cancelAnimationFrame(frame);frame=0;}
    return samples;
  }
  function showResults(results,notes,scored,tolerance,{justSing=false}={}){
    const hostResults=$('session-results');
    hostResults.hidden=false;
    if(!scored){hostResults.innerHTML='<h2>Practice complete</h2><p>Turn on “Show my sung note” and allow microphone access to get a score and note guidance.</p>';hostResults.scrollIntoView({block:'nearest'});return;}
    const best=results.map(result=>result.attempts.reduce((winner,attempt)=>!winner||attempt.score>winner.score?attempt:winner,null));
    const score=Math.round(best.reduce((sum,line)=>sum+line.score,0)/best.length);
    const weakLines=best.map((line,index)=>({line,index})).filter(({line})=>line.score<60).map(({index})=>index+1);
    hostResults.innerHTML=`<h2>Session score: ${score}%</h2><p>${justSing?'One attempt':'Best attempt'} on each line · pitch within ±${tolerance} cents of the target.</p><div class="session-result-lines">${best.map((line,index)=>{
      const weak=[...new Set(line.details.filter(note=>note.score<60).map(note=>swaraLabel(notes[note.index])))];
      return `<div><strong>Line ${index+1}: ${line.score}%</strong><span>${results[index].attempts.length} ${results[index].attempts.length===1?'attempt':'attempts'}${weak.length?` · Practice ${weak.join(', ')}`:' · Well done'}</span></div>`;
    }).join('')}</div><p class="session-guidance">${weakLines.length?`Practice ${weakLines.length===1?'line':'lines'} ${weakLines.join(', ')} again, focusing on the notes listed above.`:'All lines reached 60%. Keep practicing at a comfortable tempo.'}</p>${justSing&&weakLines.length?'<button id="session-guided-retry" class="primary-button" type="button">Listen and Sing</button>':''}`;
    if(justSing&&weakLines.length)$('session-guided-retry').onclick=()=>start();
    hostResults.scrollIntoView({block:'nearest'});
  }
  async function start({justSing=false}={}){
    let lines;
    try{lines=readLines();}catch(error){setError(error.message);return;}
    stop();const token=++runId;
    $('session-error').hidden=true;$('session-results').hidden=true;$('session-results').innerHTML='';$('session-line-feedback').hidden=true;
    $('session-play').disabled=true;$('session-just-sing').disabled=true;$('session-stop').disabled=false;
    for(const id of ['session-base','session-raga','session-tempo','session-notes','session-name','session-mic','session-saved','session-new','session-save','session-delete'])$(id).disabled=true;
    $('session-status').textContent='Preparing your phrase…';
    const notes=practiceSwaras(RAGAS[state.raga]),beat=60/state.tempo,tolerance=({beginner:35,intermediate:25,advanced:15})[getSettings().level]||35;
    try{
      await sound.unlock();if(token!==runId)return;
      if(justSing||$('session-mic').checked){
        micController=new AbortController();
        try{await sound.microphone(micController.signal);if(token!==runId){sound.releaseMic();return;}sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;micBuffer=new Float32Array(4096);micActive=true;previousMidi=null;}
        catch{if(token!==runId)return;if(justSing)throw new Error('Allow microphone access to use Sing and receive feedback.');$('session-status').textContent='Microphone unavailable. You can still listen and sing, without a score.';}
      }
      const scored=micActive,results=[];running=true;
      showLineWindow(0);
      $('session-stage').scrollIntoView({block:'center'});
      if(justSing){$('session-status').textContent=`Count in at ${state.tempo} BPM.`;$('session-current').textContent='Get ready';$('session-count').textContent=`Line 1 of ${lines.length} · Sing`;}
      for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
        const line=lines[lineIndex],attempts=[],maxAttempts=justSing?1:(scored?3:1);
        for(let attempt=1;attempt<=maxAttempts;attempt++){
          $('session-line-feedback').hidden=true;
          if(!justSing){
            const refStart=sound.ctx.currentTime+.1;
            scheduleLine(line,notes,beat,refStart);
            clearLiveReadout(host,'session');
            $('session-status').textContent=`Listen to line ${lineIndex+1}${attempt>1?` again (try ${attempt} of 3)`:''}.`;
            await runPhase({line,lineIndex,lineCount:lines.length,attempt,maxAttempts,phase:'reference',beat,notes,token,startAt:refStart});
            await waitUntil(sound.ctx.currentTime+.25,token);
          }
          const singStart=justSing
            ?await countInForLine({sound,beat,lineBeats:line.indices.length,countInBeats:lineIndex===0?4:0,waitUntil,token,onBeat:remaining=>{
              showLineWindow(lineIndex);
              $('session-line-feedback').hidden=true;
              $('session-current').textContent=String(remaining);
              $('session-count').textContent=`Line ${lineIndex+1} of ${lines.length} · Count in · ${state.tempo} BPM`;
              $('session-status').textContent=`Sing line ${lineIndex+1} after ${remaining} ${remaining===1?'beat':'beats'}.`;
            }})
            :sound.ctx.currentTime+.1;
          $('session-status').textContent=`Sing line ${lineIndex+1} now.`;
          const samples=await runPhase({line,lineIndex,lineCount:lines.length,attempt,maxAttempts,phase:'sing',beat,notes,token,startAt:singStart});
          host.querySelector('.line-live-readout').hidden=true;
          if(scored){
            const result=scorePhraseLine(samples,line.indices,beat,state.base,notes,tolerance);
            attempts.push(result);
            const weak=[...new Set(result.details.filter(note=>note.score<60).map(note=>swaraLabel(notes[note.index])))];
            const retry=!justSing&&shouldRepeatLine(result.score,attempt);
            const advance=lineIndex===lines.length-1?'See your session score.':'Continue to the next line.';
            $('session-line-feedback').innerHTML=`<strong>Line ${lineIndex+1}: ${result.score}%</strong><span>${justSing?'Sing':`Try ${attempt} of ${maxAttempts}`}</span><p>${weak.length?`Practice ${weak.join(', ')}. `:''}${retry?'Listen and sing this line again.':justSing&&result.score<60?`${advance} You can practice with Listen and Sing.`:advance}</p>`;
            $('session-line-feedback').hidden=false;
            $('session-line-feedback').scrollIntoView({block:'nearest'});
            await waitUntil(sound.ctx.currentTime+1.2,token);
            if(!retry)break;
          }
        }
        results.push({attempts});
      }
      stop('Session complete.');showLineWindow(lines.length-1);showResults(results,notes,scored,tolerance,{justSing});
    }catch(error){if(token!==runId||error.name==='AbortError')return;stop(error.message||'The session could not start.');setError(error.message||'The session could not start.');}
  }
  render();
  function loadPattern({base,raga,notes,title}){
    stop();state={...state,base,raga,notes,name:'',savedId:null,source:title};save();render();
  }
  function syncSelection({base,raga}){
    if(state.base===base&&state.raga===raga)return;
    state.base=base;state.raga=raga;state.savedId=null;state.source='';save();
    if($('session-base')){
      $('session-base').value=String(base);$('session-raga').value=raga;
      $('session-source').hidden=true;renderSavedExercises();renderSwatches();refreshPreview();
    }
  }
  return {render,stop,loadPattern,start,syncSelection};
}
