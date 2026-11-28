import {RAGA_LIST,RAGAS,DEFAULT_RAGA,practiceSwaras,swaraHz as swaraHzFor,centsBetween,noteName,scorePitch as scorePitchFor,SoundEngine} from './music.js?v=20261127-6';
import {detectLivePitch,livePitchReading} from './swara-live-core.js?v=20261121-1';
import {createTools} from './tools.js?v=20261128-1';
import {createPracticeSession} from './session.js?v=20261127-12';
import {createSaraliVarasai} from './sarali.js?v=20261127-12';
import {createAlankaras} from './alankara.js?v=20261127-12';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-8';
import {playbackButtons,attachFeedbackPlayback} from './feedback-playback.js?v=20261127-12';
const $=id=>document.getElementById(id);
const sound=new SoundEngine();
const defaultRanges=()=>Object.fromEntries([1,2,3].map(step=>[step,{lower:false,upper:false}]));
const readRanges=value=>Object.fromEntries([1,2,3].map(step=>[step,{lower:value?.[step]?.lower===true,upper:value?.[step]?.upper===true}]));
const defaults={base:56,raga:DEFAULT_RAGA,level:'beginner',duration:'3',response:3,ranges:defaultRanges(),sequential:false};
let settings={...defaults,ranges:defaultRanges()},history=[];
try{const stored=JSON.parse(localStorage.getItem('swara-studio-v1')||'{}');const s=stored.settings||{};settings={base:SHRUTHIS.includes(s.base)?s.base:56,raga:RAGAS[s.raga]?.notes?s.raga:DEFAULT_RAGA,level:['beginner','intermediate','advanced'].includes(s.level)?s.level:'beginner',duration:['3','5','10'].includes(s.duration)?s.duration:defaults.duration,response:[3,5,10].includes(Number(s.response))?Number(s.response):defaults.response,ranges:readRanges(s.ranges),sequential:s.sequential===true};history=Array.isArray(stored.history)?stored.history.filter(h=>Number.isFinite(h.accuracy)&&h.accuracy>=0&&h.accuracy<=100&&Number.isFinite(h.time)&&Number.isInteger(h.step)&&h.step>=1&&h.step<=4&&Array.isArray(h.notes)&&h.notes.every(n=>Number.isInteger(n.index)&&n.index>=0&&n.index<20)).slice(-500):[];}catch{}
let RAGA_NOTES=RAGAS[settings.raga].notes,SWARAS=practiceSwaras(RAGAS[settings.raga]);
const swaraHz=(base,index)=>swaraHzFor(base,index,SWARAS);
const scorePitch=(samples,targets,secondsPerNote,base,tolerance)=>scorePitchFor(samples,targets,secondsPerNote,base,tolerance,SWARAS);
let step=1,mode='sing',reference=[0],targets=[0],responseTargets=[0],answers=[],lastSequence='',sequenceCursor=0,phase='idle',attempt=1,exercise=1,controller=null,samples=[],view='practice',drone=false,animation=0,recordStart=0,lastSample=0,totalSeconds=3,pitchFillVoicedSeconds=0,pitchFillNote=-1,previewing=false,previewReturnPhase='idle',feedbackStop=null,tools=null,session=null,sarali=null,alankara=null,micBuffer=null;
const titles={1:['THE FOUNDATIONS','One swara at a time.','Listen closely. Sing freely. Let your ear lead the way.'],2:['A STEP FORWARD','One note leads to another.','Hold two sounds in your mind, then find each swara.'],3:['MUSICAL MEMORY','Let three notes become one.','Listen for the shape of a phrase, then respond in order.']};
const isIdentification=()=>mode==='name';
const isMemory=()=>mode==='memory';
const availableIndices=()=>SWARAS.map((note,index)=>({note,index})).filter(({note})=>note.register==='middle'||note.offset===12||settings.ranges[step][note.register]).map(({index})=>index);
const idlePrompt=()=>'';
const answerPrompt=()=>answers.length===targets.length?'Ready to check your answer.':targets.length===1?'Name the swara after Sa.':`Name swara ${answers.length+1} of ${targets.length} after Sa.`;
const senseCount=()=>({1:'one swara',2:'two swaras',3:'three swaras'})[step];
const senseOrder=()=>`Base Sa → ${senseCount()}`;
const busy=()=>!['idle','result'].includes(phase);
const tolerance=()=>({beginner:35,intermediate:25,advanced:15})[settings.level];
const noteReadout=index=>`${swaraLabel(index)} · ${noteName(settings.base+SWARAS[index].offset)} · ${swaraHz(settings.base,index).toFixed(2)} Hz`;
const swaraLabel=index=>SWARAS[index].offset===12?'Upper Sa':SWARAS[index].name+SWARAS[index].variant.slice(1);
function save(){try{localStorage.setItem('swara-studio-v1',JSON.stringify({settings,history:history.slice(-500)}));}catch{toast('Device storage is unavailable. This session will remain open, but progress may not be saved.');}}
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function referenceDuration(){return Number(settings.duration);}
function setPhase(next,label,time=''){
  phase=next;
  document.querySelector('.practice-layout').classList.toggle('showing-result',next==='result');
  $('exercise-panel').classList.toggle('show-answer',next==='answer');
  $('phase-label').textContent=label;
  $('phase-time').textContent=time;
  document.querySelector('.phase-strip').hidden=next==='idle'||next==='result';
  $('phase-dot').classList.toggle('active',busy()&&phase!=='answer');
  $('note-stage').classList.toggle('playing',next==='reference');
  $('note-stage').classList.toggle('recording',next==='recording');
  $('begin').innerHTML=busy()
    ?'<span>Stop practice</span><span aria-hidden="true">■</span>'
    :`<span>${isIdentification()?(next==='result'?'Try again':'Listen'):'Listen and Sing'}</span>`;
  const playLabel=next==='reference'?'Stop':'Play';
  $('preview-note').querySelector('span').textContent=playLabel;
  $('preview-note').setAttribute('aria-label',next==='reference'?'Stop playing the swaras':`Play the ${targets.length===1?'swara':'swaras'}`);
  $('preview-note').hidden=isMemory()||isIdentification()&&next!=='answer'&&next!=='reference'||mode==='sing'&&next!=='reference'&&next!=='result';
  $('answer-controls').hidden=next!=='answer';
  $('settings-open').disabled=busy();
  document.querySelectorAll('#practice-selection select').forEach(select=>select.disabled=busy());
  document.querySelectorAll('#octave-options input').forEach(input=>input.disabled=busy());
  $('preview-note').disabled=busy()&&phase!=='reference'&&phase!=='answer';
}
function updateConfig(){
  $('practice-selection').innerHTML=selectionFields('practice',settings);
  $('shruthi-select').innerHTML=SHRUTHIS.map(midi=>`<option value="${midi}">${noteName(midi)}</option>`).join('');
  $('level-tag').textContent=settings.level[0].toUpperCase()+settings.level.slice(1);
  for(const[id,value]of Object.entries({'shruthi-select':settings.base,'raga-select':settings.raga,'level-select':settings.level,'duration-select':settings.duration,'response-select':settings.response}))$(id).value=String(value);
  updateDaily();
}
function setSelection({base,raga}){
  if(busy()||!SHRUTHIS.includes(base)||!RAGAS[raga]?.notes)return;
  settings.base=base;settings.raga=raga;RAGA_NOTES=RAGAS[raga].notes;SWARAS=practiceSwaras(RAGAS[raga]);
  samples=[];attempt=1;sequenceCursor=0;
  if(drone)sound.toggleDrone(base,true).catch(()=>{drone=false;updateDroneButton();toast('Shruthi drone could not restart. Try again.');});
  updateConfig();renderExercise();save();
  if(view==='library')renderLibrary();
  if(view==='progress')renderProgress();
  tools?.reset();
  session?.syncSelection(settings);
  sarali?.render();
  alankara?.render();
}
function selectRaga(id){setSelection({base:settings.base,raga:id});}
function chooseExercise(){
  if(step===1&&settings.sequential){
    const notes=availableIndices().sort((a,b)=>SWARAS[a].offset-SWARAS[b].offset);
    targets=[notes[sequenceCursor%notes.length]];
    sequenceCursor++;
    reference=[...targets];
    return;
  }
  for(let attempt=0;attempt<12;attempt++){
    const notes=availableIndices();
    for(let i=notes.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [notes[i],notes[j]]=[notes[j],notes[i]];
    }
    targets=notes.slice(0,step);
    const key=`${step}:${targets.join(',')}`;
    if(key!==lastSequence){lastSequence=key;break;}
  }
  reference=[...targets];
}
function renderExercise(newSequence=true){
  stopComparison();
  if(newSequence)chooseExercise();responseTargets=mode==='sing'?[0,...targets]:[...targets];totalSeconds=Number(settings.response)*responseTargets.length;const [eyebrow,title,description]=titles[step];$('step-eyebrow').textContent=`STEP 0${step+3} / ${eyebrow}`;$('page-title').textContent=title;$('page-title').classList.toggle('long-title',step>1);$('page-description').textContent=isIdentification()?`You will hear your base Sa, then ${senseCount()}. Name only ${step===1?'the swara':'those swaras in order'} after Sa.`:isMemory()?{1:'Hear Sa, then sing the shown swara.',2:'Hear Sa, then sing the two shown swaras in order.',3:'Hear Sa, then sing the three shown swaras in order.'}[step]:description;
  $('sequential-option').hidden=step!==1;$('practice-sequential').checked=settings.sequential;
  $('include-lower').checked=settings.ranges[step].lower;$('include-upper').checked=settings.ranges[step].upper;
  const concealed=isIdentification();
  const count=targets.length;
  const heading=concealed?'Listen and Name':isMemory()?'Sing from Memory':'Listen and Sing';
  $('exercise-title').textContent=heading;$('exercise-count').textContent=`EXERCISE ${String(exercise).padStart(2,'0')}`;
  if(isMemory())document.querySelector('.panel-foot').after($('feedback'));
  else $('exercise-title').after($('feedback'));
  document.querySelector('.practice-layout').classList.toggle('listening-only',concealed);
  document.querySelector('.practice-layout').classList.toggle('memory-mode',isMemory());
  $('target-name').textContent=concealed?'?':SWARAS[reference[0]].name;
  $('note-kicker').textContent=concealed?'HEAR SA FIRST':isMemory()?'FROM MEMORY':'YOUR REFERENCE';
  $('target-western').textContent=concealed?senseOrder():isMemory()?'':noteReadout(reference[0]);
  $('sequence').hidden=responseTargets.length===1&&!concealed;
  $('sequence').innerHTML=responseTargets.map(i=>`<span>${concealed?'?':SWARAS[i].name}</span>`).join('');
  $('duration-caption').textContent=(step===1&&settings.sequential?'Low to high · ':'')+(concealed?`Base Sa + ${count} ${count===1?'swara':'swaras'} · ${referenceDuration()}s each`:isMemory()?`Sa plays ${referenceDuration()}s · ${settings.response}s${count>1?' / note':''} singing`:`Sa + ${count} ${count===1?'swara':'swaras'} · ${referenceDuration()}s each to hear · ${settings.response}s each to sing`);
  $('exercise-panel').classList.remove('show-result','memory-result');$('answer-options').hidden=true;$('feedback').hidden=true;answers=[];setPhase('idle',idlePrompt());resetPitchFill();
}
function resetPitchFill(){
  pitchFillVoicedSeconds=0;pitchFillNote=-1;
  $('pitch-fill-segments').replaceChildren();
  $('recall-fill').dataset.pitch='idle';
  $('recall-fill').setAttribute('aria-valuenow','0');
  $('recall-fill').setAttribute('aria-valuetext','No singing detected');
  $('pitch-feedback-state').textContent='';
}
function advancePitchFill(sampleMs,frequency,index){
  const cents=centsBetween(frequency,swaraHz(settings.base,index));
  const pitch=Math.abs(cents)<=tolerance()?'correct':cents>0?'sharp':'flat';
  const previous=100*pitchFillVoicedSeconds/settings.response;
  pitchFillVoicedSeconds=Math.min(settings.response,pitchFillVoicedSeconds+Math.max(0,Math.min(sampleMs,100))/1000);
  const filled=100*pitchFillVoicedSeconds/settings.response;
  if(filled>previous){
    const band=document.createElement('i');
    band.dataset.pitch=pitch;
    band.style.bottom=`${previous}%`;
    band.style.height=`${filled-previous}%`;
    $('pitch-fill-segments').appendChild(band);
  }
  const percent=Math.round(filled);
  $('recall-fill').dataset.pitch=pitch;
  $('recall-fill').setAttribute('aria-valuenow',String(percent));
  const label=pitch==='correct'?'In tune':pitch==='sharp'?'Sharp':'Flat';
  $('recall-fill').setAttribute('aria-valuetext',`${percent}% filled · ${label}`);
  $('pitch-feedback-state').textContent=label;
}
function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Cancelled','AbortError'));const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}
function throwIfAborted(signal){if(signal.aborted)throw new DOMException('Cancelled','AbortError');}
function stopComparison(){
  feedbackStop?.();feedbackStop=null;
}
function scheduleFeedbackNotes(indices){
  const duration=referenceDuration(),gap=.25,start=sound.ctx.currentTime+.05;
  sound.scheduleReference(settings.base,start,duration);
  indices.forEach((index,n)=>sound.scheduleReference(settings.base+SWARAS[index].offset,start+(n+1)*(duration+gap),duration));
  return (indices.length+1)*duration+indices.length*gap+.05;
}
async function countDown(seconds,label,signal){const start=performance.now();while(performance.now()-start<seconds*1000){const remaining=Math.ceil(seconds-(performance.now()-start)/1000);$('phase-label').textContent=label;$('phase-time').textContent=`${remaining}s`;await wait(Math.min(100,seconds*1000-(performance.now()-start)),signal);}}
async function playReferences(indices,signal,conceal=false){
  throwIfAborted(signal);
  const duration=referenceDuration();
  const anchored=conceal||mode==='sing';
  setPhase('reference',anchored?'Listen to base Sa.':'Listen to the reference.');
  try{
    if(anchored){
      $('note-kicker').textContent='BASE SA';$('target-name').textContent='Sa';$('target-western').textContent='Your base note.';
      sound.reference(settings.base,duration);
      await countDown(duration,'Base Sa.',signal);
      await wait(250,signal);
      throwIfAborted(signal);
      if(conceal){$('note-kicker').textContent='HEAR SA FIRST';$('target-name').textContent='?';$('target-western').textContent=senseOrder();}
      else $('note-kicker').textContent='YOUR REFERENCE';
    }
    for(let n=0;n<indices.length;n++){
      throwIfAborted(signal);
      const index=indices[n];
      if(!conceal){
        $('target-name').textContent=SWARAS[index].name;
        $('target-western').textContent=noteReadout(index);
      }
      sound.reference(settings.base+SWARAS[index].offset,duration,SWARAS[index].variant);
      const label=conceal?`Listen to swara ${n+1} of ${indices.length}.`:`Listen to ${SWARAS[index].name}.`;
      await countDown(duration,label,signal);
      if(n<indices.length-1)await wait(250,signal);
    }
  }finally{
    if(conceal&&isIdentification()){$('note-kicker').textContent='HEAR SA FIRST';$('target-name').textContent='?';$('target-western').textContent=senseOrder();}
  }
}
async function preview(){
  if(phase==='reference'&&!previewing){cancelExercise();return;}
  if(previewing){sound.stopNotes();controller?.abort();previewing=false;setPhase(previewReturnPhase,previewReturnPhase==='answer'?answerPrompt():idlePrompt());return;}
  if(busy()&&phase!=='answer')return;
  previewReturnPhase=phase==='answer'?'answer':phase==='result'?'result':'idle';
  controller=new AbortController();
  const signal=controller.signal;
  previewing=true;
  try{
    await sound.unlock();
    throwIfAborted(signal);
    await playReferences(reference,signal,isIdentification());
    throwIfAborted(signal);
    setPhase(previewReturnPhase,previewReturnPhase==='answer'?answerPrompt():previewReturnPhase==='result'?'Reference finished.':'Ready to sing it back.');
  }catch(e){
    if(e.name!=='AbortError')toast('Audio could not start. Please try again.');
  }finally{previewing=false;}
}
async function begin(){
  stopComparison();
  if(previewing){sound.stopNotes();controller?.abort();previewing=false;setPhase('idle',idlePrompt());}
  else if(busy()){cancelExercise();return;}
  controller=new AbortController();const signal=controller.signal;samples=[];lastSample=0;previewing=false;answers=[];updateAnswerEntry();$('exercise-panel').classList.remove('show-result','memory-result');$('feedback').hidden=true;$('answer-options').hidden=true;resetPitchFill();
  try{
    setPhase('preparing',isIdentification()?'Preparing the reference.':'Waiting for microphone access…');await sound.unlock();throwIfAborted(signal);
    if(!isIdentification()){await sound.microphone(signal);if(signal.aborted)return;sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;micBuffer=new Float32Array(sound.analyser.fftSize);}
    if(isIdentification()){await playReferences(reference,signal,true);setPhase('answer',answerPrompt());$('answer-options').hidden=false;$('answer-options').innerHTML=availableIndices().sort((a,b)=>SWARAS[a].offset-SWARAS[b].offset).map(i=>`<button data-answer="${i}">${swaraLabel(i)}</button>`).join('');updateAnswerEntry();return;}
    if(mode==='sing'){
      await playReferences(reference,signal);
      throwIfAborted(signal);
    }
    if(isMemory()){
      $('note-kicker').textContent='BASE SA';
      await playReferences([0],signal);
      throwIfAborted(signal);
      $('target-name').textContent=SWARAS[targets[0]].name;
      $('target-western').textContent='';
    }
    setPhase('recording',`Sing ${SWARAS[responseTargets[0]].name}.`);$('note-kicker').textContent=isMemory()?'SING FROM MEMORY':'YOUR TURN TO SING';sound.startRecording();recordStart=performance.now();
    captureFrame();await wait(totalSeconds*1000,signal);cancelAnimationFrame(animation);animation=0;
    const recording=await sound.finishRecording();sound.releaseMic();
    const result=scorePitch(samples,responseTargets,Number(settings.response),settings.base,tolerance());finishResult(result,recording);
  }catch(e){if(signal.aborted||e.name==='AbortError')return;cancelAnimationFrame(animation);sound.stopNotes();await sound.finishRecording();sound.releaseMic();setPhase('idle','Microphone is not available.');const message=e.name==='NotAllowedError'?'Microphone access was declined. Enable it in your browser’s site settings, then begin again. You can still use the listening exercises.':e.name==='NotFoundError'?'No microphone was found. Connect a microphone, then try again.':e.name==='NotReadableError'?'Your microphone is busy. Close other recording apps and try again.':e.message||'Audio could not start. Please try again.';toast(message);}
}
function captureFrame(){
  if(phase!=='recording'||!sound.analyser)return;
  const now=performance.now(),t=(now-recordStart)/1000;const current=Math.min(responseTargets.length-1,Math.floor(t/settings.response));
  if(current!==pitchFillNote){resetPitchFill();pitchFillNote=current;}
  if(now-lastSample>=50){
    const sampleMs=lastSample?now-lastSample:Math.min(now-recordStart,50);
    lastSample=now;sound.analyser.getFloatTimeDomainData(micBuffer);
    const frequency=detectLivePitch(micBuffer,sound.ctx.sampleRate);
    if(frequency)advancePitchFill(sampleMs,frequency,responseTargets[current]);
    samples.push({t,hz:frequency||null,index:responseTargets[current]});
  }
  $('target-name').textContent=SWARAS[responseTargets[current]].name;$('target-western').textContent=isMemory()?'':noteReadout(responseTargets[current]);
  $('phase-label').textContent=`Sing ${SWARAS[responseTargets[current]].name}${responseTargets.length>1?` · note ${current+1} of ${responseTargets.length}`:''}.`;$('phase-time').textContent=`${Math.max(0,Math.ceil(totalSeconds-t))}s`;
  [...$('sequence').children].forEach((el,i)=>el.classList.toggle('current',current===i));animation=requestAnimationFrame(captureFrame);
}
function cancelExercise(){
  controller?.abort();stopComparison();cancelAnimationFrame(animation);sound.stopNotes();sound.finishRecording();sound.releaseMic();previewing=false;
  $('note-kicker').textContent=isIdentification()?'HEAR SA FIRST':isMemory()?'FROM MEMORY':'YOUR REFERENCE';
  $('target-name').textContent=isIdentification()?'?':SWARAS[targets[0]].name;
  $('target-western').textContent=isIdentification()?senseOrder():isMemory()?'':noteReadout(targets[0]);
  setPhase('idle',idlePrompt());$('answer-options').hidden=true;resetPitchFill();
}
function answer(index){
  if(phase!=='answer'||answers.length>=targets.length)return;
  answers.push(index);
  updateAnswerEntry();
}
function updateAnswerEntry(){
  if(!isIdentification())return;
  [...$('sequence').children].forEach((el,i)=>{el.textContent=answers[i]===undefined?'?':SWARAS[answers[i]].name;el.classList.toggle('chosen',answers[i]!==undefined);});
  $('answer-undo').disabled=answers.length===0;
  $('answer-clear').disabled=answers.length===0;
  $('answer-submit').disabled=answers.length!==targets.length;
  if(phase==='answer')$('phase-label').textContent=answerPrompt();
}
function submitAnswer(){
  if(phase!=='answer'||answers.length!==targets.length)return;
  const details=targets.map((target,n)=>{
    const correct=answers[n]===target;
    return {index:target,accuracy:correct?100:0,pass:correct,cents:null,stability:null,detected:true};
  });
  $('target-name').textContent=targets.length===1?SWARAS[targets[0]].name:'✓';
  $('target-western').textContent=targets.map(i=>SWARAS[i].name).join(' · ');
  finishResult({accuracy:Math.round(details.reduce((sum,n)=>sum+n.accuracy,0)/details.length),pass:details.every(n=>n.pass),voiced:true,details,identification:true,answers:[...answers]});
}
function finishResult(result,recording=null){
  setPhase('result',result.pass?'A good note to build on.':isMemory()?'Try the swara again from memory.':'Listen again. There’s room to grow.');$('note-kicker').textContent=isMemory()?'FROM MEMORY':'YOUR REFERENCE';$('sequence').querySelectorAll('span').forEach(el=>el.classList.remove('current'));
  const entry={time:Date.now(),step,mode,raga:settings.raga,base:settings.base,level:settings.level,accuracy:result.accuracy,pass:result.pass,notes:result.details,voiced:result.voiced};history.push(entry);save();updateDaily();
  let heading=result.pass?'That’s the sound. Keep it with you.':!result.voiced?'Let’s find your voice.':isMemory()?'A small adjustment. Try again.':'A small adjustment. Another listen.';
  let body='';
  if(result.identification){
    const names=targets.map(i=>SWARAS[i].name).join(' · ');
    const heard=result.answers.map(i=>SWARAS[i].name).join(' · ');
    heading=result.pass?'Your ear found it.':'Listen to the sequence once more.';
    body=result.pass?`You named ${names} in the right order.`:`The sequence was ${names}. You named ${heard}. Replay it, then try again.`;
  }
  else if(!result.voiced)body=`We didn’t hear enough of a steady note to evaluate. Move a little closer to your microphone and sing a comfortable, sustained vowel.${isMemory()?' Try the named swara again.':' Play the swara again if you need a reminder.'}`;
  else if(result.pass)body=isMemory()?`You found ${targets.map(i=>SWARAS[i].name).join(' · ')} after hearing base Sa. Keep that sound in mind for the next exercise.`:'You sang the full sequence, starting with Sa. Keep listening for a smooth transition to each note.';
  else{const d=result.details.find(d=>!d.pass);const note=SWARAS[d.index].name;if(!d.detected)body=`We didn’t hear a sustained ${note} in its response window. Follow the note cue and hold each swara until the next prompt.`;else if(Math.abs(d.cents)>700)body=`Your ${note} landed in a different register from the target. ${isMemory()?'Recall its pitch':'Listen to the octave'}, then try again. Choose a more comfortable base shruthi if needed.`;else if(Math.abs(d.cents)>tolerance())body=`Your ${note} was about ${Math.abs(Math.round(d.cents))} cents ${d.cents>0?'high':'low'}. ${d.cents>0?'Ease down':'Lift gently'} toward the target, then hold it steady.`;else body=`You found ${note}, but it drifted during the hold. ${isMemory()?'Try again':'Listen again'}, keep your breath relaxed, and aim for a steadier line.`;if(attempt>=3)body+=' You’ve given this note three tries. Take a breath or move to a different note.';}
  const recallMarkup=isMemory()?`<div class="recall-heard"><h4>Hear the ${targets.length===1?'note':'notes'}</h4>${result.details.map((detail,position)=>{
    const label=swaraLabel(detail.index);
    const missed=!detail.pass&&detail.detected&&Number.isFinite(detail.cents);
    const reading=missed?livePitchReading(swaraHz(settings.base,detail.index)*2**(detail.cents/1200),settings.base):null;
    const message=reading?`You sang ${reading.swara} (${reading.western})${reading.tuning==='In tune'?'':` · ${reading.tuning}`}. The note was ${label}.`:label;
    return `<div><p>${targets.length>1?`Note ${position+1}: `:''}${message}</p></div>`;
  }).join('')}</div>`:'';
  const playback=isIdentification()?playbackButtons('Play your choices'):isMemory()?playbackButtons('Play what you sang',!!recording):'';
  $('exercise-panel').classList.add('show-result');$('exercise-panel').classList.toggle('memory-result',isMemory());$('feedback').hidden=false;$('feedback').innerHTML=`<h3>${heading}</h3><p>${body}</p>${result.identification?'':`<div class="feedback-stat">${result.accuracy}% of detected pitch frames within ±${tolerance()} cents${!result.voiced?' · No reliable voice detected':''}</div>`}${playback}<div class="result-notes">${result.details.map(d=>`<span>${SWARAS[d.index].name} · ${d.detected?d.accuracy+'%':'not heard'}${d.stability!==null&&d.stability!==undefined?' · '+Math.round(d.stability)+'¢ variation':''}</span>`).join('')}</div>${recallMarkup}<div class="feedback-actions"><button class="primary-button" id="next-exercise">Next exercise</button><button class="secondary-button" id="retry-exercise">${isMemory()?'Try again':'Listen & retry'}</button></div>`;
  if(playback)feedbackStop=attachFeedbackPlayback($('feedback'),{sound,playRequested:()=>scheduleFeedbackNotes(targets),playAnswer:isIdentification()?()=>scheduleFeedbackNotes(result.answers):null,recording,onError:()=>toast('The comparison could not play. Try again.')});
  $('next-exercise').onclick=nextExercise;$('retry-exercise').onclick=()=>{attempt++;if(mode==='sing'){renderExercise(false);begin();}else begin();};
}
function nextExercise(){
  cancelExercise();exercise++;attempt=1;
  samples=[];renderExercise();
  if(mode==='sing')begin();
}
function updateDaily(){const today=new Date().toDateString();const n=history.filter(h=>new Date(h.time).toDateString()===today).length;$('today-count').innerHTML=`${n} <span>/ 8</span>`;$('goal-ring').style.strokeDashoffset=String(125.67*(1-Math.min(n/8,1)));}
function updateDroneButton(){$('drone-toggle').setAttribute('aria-pressed',String(drone));$('drone-toggle').setAttribute('aria-label',`Shruthi drone: ${drone?'on':'off'}; lower Pa, Sa, Sa at 30 BPM`);$('drone-status').textContent=drone?'On':'Off';}
function showView(next){
  if(view!==next){
    if(busy())cancelExercise();
    if(view==='practice')stopComparison();
    if(view==='tools')tools?.stop();
    if(view==='session')session?.stop();
    if(view==='sarali')sarali?.stop();
    if(view==='alankara')alankara?.stop();
    sound.stopNotes();
  }
  view=next;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${next}-view`);
  document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===next&&!(next==='session'&&session?.isWarmup());el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');});
  syncPath();
  if(next==='progress')renderProgress();
  if(next==='library')renderLibrary();
  if(next==='tools')tools?.render();
  if(next==='sarali')sarali?.render();
  if(next==='alankara')alankara?.render();
}
function renderProgress(){
  const ragaHistory=history.filter(entry=>(entry.raga||DEFAULT_RAGA)===settings.raga&&entry.notes.every(note=>note.index<SWARAS.length));
  const count=ragaHistory.length,avg=count?Math.round(ragaHistory.reduce((s,h)=>s+h.accuracy,0)/count):0;const dates=new Set(ragaHistory.map(h=>new Date(h.time).toDateString()));
  let content=`<p class="eyebrow">YOUR PRACTICE JOURNAL</p><h1 class="progress-intro">Small steps, lasting progress.</h1><p class="page-description">Your ${RAGAS[settings.raga].name} practice on this device.</p>`;
  if(!count){content+='<div class="empty-progress"><div><h2>Your first note starts the story.</h2><p>Complete a practice exercise to see your pitch accuracy and the swaras to revisit.</p></div><button class="primary-button" data-back-practice>Begin practice</button></div>';}
  else{
    content+=`<div class="progress-stats"><div><span class="label">ATTEMPTS</span><strong>${count}</strong></div><div><span class="label">AVERAGE ACCURACY</span><strong>${avg}%</strong></div><div><span class="label">DAYS OF PRACTICE</span><strong>${dates.size}</strong></div></div>`;
    const stats=SWARAS.map((s,i)=>{const notes=ragaHistory.flatMap(h=>h.notes).filter(n=>n.index===i);return {...s,index:i,count:notes.length,accuracy:notes.length?Math.round(notes.reduce((a,n)=>a+n.accuracy,0)/notes.length):null,stability:notes.filter(n=>Number.isFinite(n.stability)).length?Math.round(notes.filter(n=>Number.isFinite(n.stability)).reduce((a,n)=>a+n.stability,0)/notes.filter(n=>Number.isFinite(n.stability)).length):null};});
    const recent=ragaHistory.slice(-5);const ready=recent.length===5&&recent.every(h=>h.pass);const recommendedStep=ready?Math.min(recent.at(-1).step+1,3):1;
    content+=`<div class="recommendation"><p><strong>${ready?'Ready for a new kind of listening.':`Keep listening with a fresh sequence.`}</strong>${ready?'Your last five attempts met the accuracy target. Explore the next step on your learning path.':`The app will choose the next swaras for you. Replay the sequence as often as you need.`}</p><button class="primary-button" id="recommended-practice" data-rec-step="${recommendedStep}">Continue practice</button></div><h2 class="section-title">A closer look at each swara</h2><table class="data-table"><thead><tr><th>SWARA</th><th>ATTEMPTS</th><th>ACCURACY</th><th>PITCH VARIATION</th></tr></thead><tbody>${stats.map(s=>`<tr><td>${s.name} <small>${s.variant}</small></td><td>${s.count||'—'}</td><td>${s.accuracy===null?'—':s.accuracy+'%'}</td><td>${s.stability===null?'—':s.stability+' cents'}</td></tr>`).join('')}</tbody></table><h2 class="section-title">Recent practice</h2><table class="data-table"><thead><tr><th>WHEN</th><th>EXERCISE</th><th>SHRUTHI</th><th>ACCURACY</th></tr></thead><tbody>${[...ragaHistory].reverse().slice(0,15).map(h=>`<tr><td>${new Date(h.time).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</td><td>${({sing:'Singing',name:'Naming',memory:'From memory',repeat:'Singing',next:'Singing',identify:'Naming'})[h.mode]||'Practice'} · Step ${h.step} · ${h.notes.map(n=>SWARAS[n.index].name).join(' ')}</td><td>${noteName(h.base)}</td><td>${h.accuracy}%</td></tr>`).join('')}</tbody></table><p class="field-note">Pitch accuracy is the proportion of detected voice frames within the selected tolerance. Variation is the median pitch spread. This journal stays on this browser and device.</p>`;
  }$('progress-view').innerHTML=content;
  $('progress-view').querySelector('[data-back-practice]')?.addEventListener('click',()=>showView('practice'));
  $('recommended-practice')?.addEventListener('click',e=>{const b=e.currentTarget;step=Number(b.dataset.recStep);mode='sing';syncPath();renderExercise();showView('practice');begin();});
}
function renderLibrary(){
  const cards=RAGA_LIST.map(raga=>{
    const selected=raga.id===settings.raga;
    const ascent=raga.notes.map(note=>note.variant).join(' ');
    const descent=[...raga.notes].reverse().map(note=>note.variant).join(' ');
    return `<article class="raga-card${selected?' selected':''}"><div class="raga-card-heading"><span class="label">${raga.type}</span>${selected?'<span class="raga-current">Selected</span>':''}</div><h2>${raga.name}</h2><p>${raga.description}</p><div class="raga-scale"><span>Ārohaṇa</span><strong>${ascent}</strong><span>Avarohaṇa</span><strong>${descent}</strong></div><div class="raga-actions"><button class="secondary-button" data-practice-raga="${raga.id}" aria-label="Practice ${raga.name}">${selected?'Continue practice':'Practice this raga'}</button><a href="${raga.source}" target="_blank" rel="noopener noreferrer">Scale source ↗</a></div></article>`;
  }).join('');
  $('library-view').innerHTML=`<p class="eyebrow">THE SWARA LIBRARY</p><h1 class="progress-intro">Choose a raga.</h1><p class="page-description">Explore the note sets, then practice listening, naming, or singing in the selected raga.</p><p class="library-note">Seven swara names share twelve pitch positions in an octave. A raga chooses specific variants; Mohanam uses five swaras.</p><div class="raga-grid">${cards}</div><h2 class="section-title">Notes in ${RAGAS[settings.raga].name}</h2><table class="data-table"><thead><tr><th>SWARA</th><th>VARIANT</th><th>WESTERN NOTE</th><th>FREQUENCY</th><th>LISTEN</th></tr></thead><tbody>${RAGA_NOTES.map((s,i)=>`<tr><td>${s.name}</td><td>${s.variant}</td><td>${noteName(settings.base+s.offset)}</td><td>${swaraHz(settings.base,i).toFixed(2)} Hz</td><td><button class="secondary-button" data-library-note="${i}" aria-label="Listen to ${s.name}">▷</button></td></tr>`).join('')}</tbody></table><p class="field-note">Pitches are relative to your selected Sa (${noteName(settings.base)}) and use equal temperament. These exercises use plain notes; characteristic phrases, gamakas, and intonation need guided listening beyond this pitch chart.</p>`;
  $('library-view').querySelectorAll('[data-practice-raga]').forEach(button=>button.onclick=()=>{selectRaga(button.dataset.practiceRaga);showView('practice');});
  $('library-view').querySelectorAll('[data-library-note]').forEach(b=>b.onclick=async()=>{await sound.unlock();sound.stopNotes();const note=SWARAS[Number(b.dataset.libraryNote)];sound.reference(settings.base+note.offset,referenceDuration(),note.variant);});
}
function syncPath(){document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',view==='practice'&&Number(b.dataset.step)===step));const warmup=document.querySelector('[data-warmup]'),active=view==='session'&&session?.isWarmup();warmup.classList.toggle('active',active);warmup.setAttribute('aria-current',active?'page':'false');document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.mode===mode));b.textContent=({sing:'Learn',name:'Sense',memory:'Recall'})[b.dataset.mode];});}
function openSettings(){if(busy())return;stopComparison();if(view==='tools')tools?.stop();if(view==='session')session?.stop();if(view==='sarali')sarali?.stop();if(view==='alankara')alankara?.stop();updateConfig();$('settings-dialog').showModal();}
$('settings-open').onclick=openSettings;
$('practice-selection').addEventListener('change',()=>setSelection({base:Number($('practice-base').value),raga:$('practice-raga').value}));
document.querySelectorAll('#octave-options input').forEach(input=>input.addEventListener('change',()=>{
  if(input.id==='practice-sequential'){
    settings.sequential=input.checked;sequenceCursor=0;exercise=1;
    cancelExercise();renderExercise();save();
    if(mode==='sing')begin();
    return;
  }
  settings.ranges[step][input.id==='include-lower'?'lower':'upper']=input.checked;
  cancelExercise();attempt=1;sequenceCursor=0;renderExercise();save();
  if(mode==='sing')begin();
}));
$('settings-dialog').querySelector('form').addEventListener('submit',event=>{if(event.submitter?.value!=='save')return;settings.level=$('level-select').value;settings.duration=$('duration-select').value;settings.response=Number($('response-select').value);setSelection({base:Number($('shruthi-select').value),raga:$('raga-select').value});toast('Your practice settings are saved.');});
$('help-open').onclick=()=>$('help-dialog').showModal();
$('drone-toggle').onclick=async()=>{const button=$('drone-toggle'),next=!drone;button.disabled=true;try{await sound.toggleDrone(settings.base,next);drone=next;updateDroneButton();}catch{drone=false;updateDroneButton();toast('Audio could not start. Try again.');}finally{button.disabled=false;}};
$('answer-options').onclick=e=>{const b=e.target.closest('[data-answer]');if(b)answer(Number(b.dataset.answer));};
$('answer-undo').onclick=()=>{if(phase==='answer'&&answers.length){answers.pop();updateAnswerEntry();}};
$('answer-clear').onclick=()=>{if(phase==='answer'&&answers.length){answers=[];updateAnswerEntry();}};
$('answer-submit').onclick=submitAnswer;
$('begin').onclick=()=>{if(phase==='result')attempt++;begin();};$('preview-note').onclick=preview;
// Tabs follow standard keyboard behavior as well as pointer interaction.
const tabs=[...document.querySelectorAll('[data-mode]')];tabs.forEach((b,i)=>{b.onclick=()=>{if(mode===b.dataset.mode)return;cancelExercise();mode=b.dataset.mode;attempt=1;samples=[];syncPath();renderExercise(false);if(mode==='sing')begin();};b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[index].focus();tabs[index].click();}};});
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{cancelExercise();step=Number(b.dataset.step);mode='sing';attempt=1;sequenceCursor=0;samples=[];syncPath();renderExercise();showView('practice');begin();});
document.querySelector('[data-warmup]').onclick=()=>{session.loadPattern({base:settings.base,raga:settings.raga,notes:'P_ S S',tempo:30,title:'Pa–Sa–Sa warmup'});showView('session');};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='session')session.openBuilder();showView(b.dataset.view);});
document.querySelector('.brand').onclick=e=>{e.preventDefault();showView('practice');};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(busy())cancelExercise();stopComparison();tools?.stop();session?.stop();sarali?.stop();alankara?.stop();}});
window.addEventListener('pagehide',()=>{stopComparison();session?.stop();sarali?.stop();alankara?.stop();sound.shutdown();});
tools=createTools({sound,getSettings:()=>settings,getNotes:()=>RAGA_NOTES,onSelection:setSelection});
session=createPracticeSession({sound,getSettings:()=>settings,onSelection:setSelection});
sarali=createSaraliVarasai({sound,getSettings:()=>settings,onSelection:setSelection});
alankara=createAlankaras({sound,getSettings:()=>settings,onSelection:setSelection});
updateConfig();updateDroneButton();syncPath();renderExercise();
