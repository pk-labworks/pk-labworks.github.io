import {RAGA_LIST,RAGAS,DEFAULT_RAGA,PITCH_POSITION_LABELS,midiHz,swaraHz as swaraHzFor,noteName,nearestSwara as nearestSwaraFor,centsBetween,detectPitch,scorePitch as scorePitchFor,SoundEngine} from './music.js?v=20261116-13';
import {createChallenges} from './challenges.js?v=20261117-1';
import {createTools} from './tools.js?v=20261121-1';
const $=id=>document.getElementById(id);
const sound=new SoundEngine();
const defaults={base:56,raga:DEFAULT_RAGA,level:'beginner',duration:'3',response:3};
let settings={...defaults},history=[];
try{const stored=JSON.parse(localStorage.getItem('swara-studio-v1')||'{}');const s=stored.settings||{};settings={base:[54,55,56,57,58,59,60,61].includes(s.base)?s.base:56,raga:RAGAS[s.raga]?.notes?s.raga:DEFAULT_RAGA,level:['beginner','intermediate','advanced'].includes(s.level)?s.level:'beginner',duration:['3','5','10'].includes(s.duration)?s.duration:defaults.duration,response:[3,5,10].includes(Number(s.response))?Number(s.response):defaults.response};history=Array.isArray(stored.history)?stored.history.filter(h=>Number.isFinite(h.accuracy)&&h.accuracy>=0&&h.accuracy<=100&&Number.isFinite(h.time)&&Number.isInteger(h.step)&&h.step>=1&&h.step<=4&&Array.isArray(h.notes)&&h.notes.every(n=>Number.isInteger(n.index)&&n.index>=0&&n.index<8)).slice(-500):[];}catch{}
let SWARAS=RAGAS[settings.raga].notes;
const swaraHz=(base,index)=>swaraHzFor(base,index,SWARAS);
const nearestSwara=(hz,base)=>nearestSwaraFor(hz,base,SWARAS);
const scorePitch=(samples,targets,secondsPerNote,base,tolerance)=>scorePitchFor(samples,targets,secondsPerNote,base,tolerance,SWARAS);
let step=1,mode='sing',reference=[0],targets=[0],answers=[],lastSequence='',phase='idle',attempt=1,exercise=1,controller=null,samples=[],live=null,view='practice',drone=false,animation=0,recordStart=0,lastSample=0,activeTarget=0,playingIndex=null,totalSeconds=3,previewing=false,challenges=null,tools=null;
const titles={1:['THE FOUNDATIONS','One swara at a time.','Listen closely. Sing freely. Let your ear lead the way.'],2:['A STEP FORWARD','One note leads to another.','Hold two sounds in your mind, then find each swara.'],3:['MUSICAL MEMORY','Let three notes become one.','Listen for the shape of a phrase, then respond in order.']};
const isIdentification=()=>mode==='name';
const isMemory=()=>mode==='memory';
const idlePrompt=()=>isIdentification()?`Listen to anchor Sa, then name ${targets.length===1?'the swara':'the swaras in order'}.`:isMemory()?`Sing ${targets.length===1?'the swara':'the swaras in order'} from memory.`:`Play the ${targets.length===1?'swara':'swaras'}, then sing.`;
const answerPrompt=()=>answers.length===targets.length?'Ready to check your answer.':targets.length===1?'Name the swara you heard.':`Name swara ${answers.length+1} of ${targets.length}.`;
const busy=()=>!['idle','result'].includes(phase);
const tolerance=()=>({beginner:35,intermediate:25,advanced:15})[settings.level];
const noteReadout=index=>`${SWARAS[index].variant} · ${noteName(settings.base+SWARAS[index].offset)} · ${swaraHz(settings.base,index).toFixed(2)} Hz`;
function save(){try{localStorage.setItem('swara-studio-v1',JSON.stringify({settings,history:history.slice(-500)}));}catch{toast('Device storage is unavailable. This session will remain open, but progress may not be saved.');}}
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function referenceDuration(){return Number(settings.duration);}
function setPhase(next,label,time=''){
  phase=next;
  $('phase-label').textContent=label;
  $('phase-time').textContent=time;
  $('phase-dot').classList.toggle('active',busy()&&phase!=='answer');
  $('note-stage').classList.toggle('playing',next==='reference');
  $('note-stage').classList.toggle('recording',next==='recording');
  $('begin').innerHTML=busy()
    ?'<span>Stop practice</span><span aria-hidden="true">■</span>'
    :`<span>${isIdentification()?'Listen and name':isMemory()?'Sing from memory':`Sing the ${targets.length===1?'swara':'swaras'}`}</span><span aria-hidden="true">→</span>`;
  const playLabel=next==='reference'?'Stop playing':`Play the ${targets.length===1?'swara':'swaras'}`;
  $('preview-note').querySelector('span').textContent=playLabel;
  $('preview-note').setAttribute('aria-label',next==='reference'?'Stop playing the swaras':playLabel);
  $('preview-note').hidden=isMemory()||isIdentification()&&next!=='answer'&&next!=='reference';
  $('answer-controls').hidden=next!=='answer';
  for(const id of ['settings-open','shruthi-open','raga-open'])$(id).disabled=busy();
  $('preview-note').disabled=busy()&&phase!=='reference'&&phase!=='answer';
}
function updateConfig(){
  $('shruthi-label').textContent=noteName(settings.base);$('shruthi-hz').textContent=midiHz(settings.base).toFixed(2)+' Hz';$('level-tag').textContent=settings.level[0].toUpperCase()+settings.level.slice(1);
  $('raga-label').textContent=RAGAS[settings.raga].name;$('raga-type').textContent=RAGAS[settings.raga].type;
  for(const[id,value]of Object.entries({'shruthi-select':settings.base,'raga-select':settings.raga,'level-select':settings.level,'duration-select':settings.duration,'response-select':settings.response}))$(id).value=String(value);
  updateDaily();
}
function selectRaga(id){
  if(!RAGAS[id]?.notes)return;
  settings.raga=id;SWARAS=RAGAS[id].notes;
  samples=[];live=null;playingIndex=null;attempt=1;
  updateConfig();renderExercise();save();
  if(view==='library')renderLibrary();
  if(view==='progress')renderProgress();
  challenges?.reset();
  tools?.reset();
}
function chooseExercise(){
  for(let attempt=0;attempt<12;attempt++){
    const notes=SWARAS.map((_,index)=>index);
    for(let i=notes.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [notes[i],notes[j]]=[notes[j],notes[i]];
    }
    targets=notes.slice(0,step);
    const key=`${step}:${targets.join(',')}`;
    if(key!==lastSequence){lastSequence=key;break;}
  }
  reference=[...targets];
  activeTarget=0;
}
function renderExercise(newSequence=true){
  if(newSequence)chooseExercise();totalSeconds=Number(settings.response)*targets.length;const [eyebrow,title,description]=titles[step];$('step-eyebrow').textContent=`STEP 0${step} / ${eyebrow}`;$('page-title').textContent=title;$('page-title').classList.toggle('long-title',step>1);$('page-description').textContent=isMemory()?{1:'See the swara, then find it with your voice.',2:'See two swaras and sing them in order without a reference.',3:'See three swaras and sing them in order without a reference.'}[step]:description;
  const concealed=isIdentification();
  const count=targets.length;
  const heading=concealed?`Listen and name ${count===1?'the swara':'the swaras'}.`:isMemory()?`Sing ${count===1?'the swara':'the swaras'} from memory.`:`Listen and sing ${count===1?'the swara':'the swaras'}.`;
  const instruction=concealed
    ?`Hear anchor Sa first, then ${count===1?'name the mystery swara':'name the mystery swaras in order'}.`
    :isMemory()?`Without a reference, sing ${targets.map(i=>SWARAS[i].name).join(' · ')}${count>1?' in order':''}. Hold each note for ${settings.response} seconds.`
    :`Play the ${count===1?'reference':'sequence'}, then sing ${targets.map(i=>SWARAS[i].name).join(' · ')}${count>1?' in order':''}. Hold each note for ${settings.response} seconds.`;
  $('exercise-title').textContent=heading;$('exercise-instruction').textContent=instruction;$('exercise-count').textContent=`EXERCISE ${String(exercise).padStart(2,'0')}`;
  document.querySelector('.practice-layout').classList.toggle('listening-only',concealed);
  $('target-name').textContent=concealed?'?':SWARAS[reference[0]].name;
  $('note-kicker').textContent=concealed?'LISTEN CLOSELY':isMemory()?'FROM MEMORY':'YOUR REFERENCE';
  $('target-western').textContent=concealed?'Trust your listening.':isMemory()?'No reference will play.':noteReadout(reference[0]);
  $('sequence').hidden=count===1&&!concealed;
  $('sequence').innerHTML=targets.map(i=>`<span>${concealed?'?':SWARAS[i].name}</span>`).join('');
  $('duration-caption').textContent=concealed?`Anchor Sa + ${referenceDuration()}s per swara · name in order`:isMemory()?`${settings.response}s${count>1?' / note':''} singing · no reference sound`:`${referenceDuration()}s per reference swara · ${settings.response}s${count>1?' / note':''} singing`;
  $('exercise-panel').classList.remove('show-result');$('answer-options').hidden=true;$('feedback').hidden=true;answers=[];setChartNote(reference[0],concealed);setPhase('idle',idlePrompt());resetReadings();drawChart();
}
function setChartNote(index,concealed=false){const label=concealed?'Mystery swara':`${SWARAS[index].name} ${SWARAS[index].variant} · ${noteName(settings.base+SWARAS[index].offset)}`;if($('chart-note').textContent===label)return;$('chart-note').textContent=label;drawChart();}
function resetReadings(){$('detected-note').textContent='—';$('detected-hz').innerHTML='— <small>Hz</small>';$('detected-cents').innerHTML='— <small>cents</small>';$('live-status').textContent='Ready when you are';$('signal-dot').classList.remove('on');}
function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Cancelled','AbortError'));const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}
function throwIfAborted(signal){if(signal.aborted)throw new DOMException('Cancelled','AbortError');}
async function countDown(seconds,label,signal){const start=performance.now();while(performance.now()-start<seconds*1000){const remaining=Math.ceil(seconds-(performance.now()-start)/1000);$('phase-label').textContent=label;$('phase-time').textContent=`${remaining}s`;await wait(Math.min(100,seconds*1000-(performance.now()-start)),signal);}}
async function playReferences(indices,signal,conceal=false){
  throwIfAborted(signal);
  const duration=referenceDuration();
  setPhase('reference',conceal?'Listen to anchor Sa.':'Listen to the reference.');
  try{
    if(conceal){
      $('note-kicker').textContent='ANCHOR SA';$('target-name').textContent='Sa';$('target-western').textContent='Your starting pitch.';
      sound.tone(swaraHz(settings.base,0),duration);
      await countDown(duration,'Anchor Sa.',signal);
      await wait(250,signal);
      throwIfAborted(signal);
      $('note-kicker').textContent='LISTEN CLOSELY';$('target-name').textContent='?';$('target-western').textContent='Trust your listening.';
    }
    for(let n=0;n<indices.length;n++){
      throwIfAborted(signal);
      const index=indices[n];
      if(!conceal){
        setChartNote(index);
        $('target-name').textContent=SWARAS[index].name;
        $('target-western').textContent=noteReadout(index);
        playingIndex=index;
        drawChart();
      }
      sound.tone(swaraHz(settings.base,index),duration);
      const label=conceal?`Listen to swara ${n+1} of ${indices.length}.`:`Listen to ${SWARAS[index].name}.`;
      await countDown(duration,label,signal);
      if(n<indices.length-1)await wait(250,signal);
    }
  }finally{
    playingIndex=null;
    drawChart();
    if(conceal&&isIdentification()){$('note-kicker').textContent='LISTEN CLOSELY';$('target-name').textContent='?';$('target-western').textContent='Trust your listening.';}
  }
}
async function preview(){
  if(phase==='reference'&&!previewing){cancelExercise();return;}
  if(previewing){sound.stopNotes();controller?.abort();previewing=false;const answering=isIdentification()&&!$('answer-options').hidden;setPhase(answering?'answer':'idle',answering?answerPrompt():idlePrompt());return;}
  if(busy()&&phase!=='answer')return;
  const wasAnswer=phase==='answer';
  controller=new AbortController();
  const signal=controller.signal;
  previewing=true;
  try{
    await sound.unlock();
    throwIfAborted(signal);
    await playReferences(reference,signal,isIdentification());
    throwIfAborted(signal);
    setPhase(wasAnswer?'answer':'idle',wasAnswer?answerPrompt():'Ready to sing it back.');
  }catch(e){
    if(e.name!=='AbortError')toast('Audio could not start. Please try again.');
  }finally{previewing=false;}
}
async function begin(){
  if(previewing){sound.stopNotes();controller?.abort();previewing=false;setPhase('idle','Ready to sing.');}
  else if(busy()){cancelExercise();return;}
  controller=new AbortController();const signal=controller.signal;samples=[];live=null;lastSample=0;previewing=false;answers=[];updateAnswerEntry();$('exercise-panel').classList.remove('show-result');$('feedback').hidden=true;$('answer-options').hidden=true;resetReadings();
  try{
    setPhase('preparing',isIdentification()?'Preparing the reference.':'Waiting for microphone access…');await sound.unlock();throwIfAborted(signal);
    if(drone){sound.stopDrone();drone=false;updateDroneButton();}
    if(!isIdentification()){await sound.microphone(signal);if(signal.aborted)return;}
    $('chart-empty').hidden=isIdentification();drawChart();
    if(isIdentification()){await playReferences(reference,signal,true);setPhase('answer',answerPrompt());$('answer-options').hidden=false;$('answer-options').innerHTML=SWARAS.map((s,i)=>`<button data-answer="${i}">${s.name}</button>`).join('');updateAnswerEntry();return;}
    setPhase('recording',`Sing ${SWARAS[targets[0]].name}.`);$('note-kicker').textContent=isMemory()?'SING FROM MEMORY':'YOUR TURN TO SING';sound.startRecording();recordStart=performance.now();activeTarget=0;$('chart-empty').hidden=true;
    captureFrame();await wait(totalSeconds*1000,signal);cancelAnimationFrame(animation);animation=0;
    const recording=await sound.finishRecording();sound.releaseMic();
    const result=scorePitch(samples,targets,Number(settings.response),settings.base,tolerance());finishResult(result,recording);
  }catch(e){if(signal.aborted||e.name==='AbortError')return;cancelAnimationFrame(animation);sound.stopNotes();await sound.finishRecording();sound.releaseMic();setPhase('idle','Microphone is not available.');const message=e.name==='NotAllowedError'?'Microphone access was declined. Enable it in your browser’s site settings, then begin again. You can still use the listening exercises.':e.name==='NotFoundError'?'No microphone was found. Connect a microphone, then try again.':e.name==='NotReadableError'?'Your microphone is busy. Close other recording apps and try again.':e.message||'Audio could not start. Please try again.';toast(message);$('live-status').textContent='Check microphone access';}
}
function captureFrame(){
  if(phase!=='recording'||!sound.analyser)return;
  const now=performance.now(),t=(now-recordStart)/1000;const current=Math.min(targets.length-1,Math.floor(t/settings.response));activeTarget=current;
  if(now-lastSample>=50){lastSample=now;const buffer=new Float32Array(sound.analyser.fftSize);sound.analyser.getFloatTimeDomainData(buffer);const result=detectPitch(buffer,sound.ctx.sampleRate);live=result?{hz:result.hz,t,index:targets[current]}:null;samples.push({t,hz:live?.hz||null,index:targets[current]});updateLive();drawChart();}
  setChartNote(targets[current]);$('target-name').textContent=SWARAS[targets[current]].name;$('target-western').textContent=noteReadout(targets[current]);
  $('phase-label').textContent=`Sing ${SWARAS[targets[current]].name}${targets.length>1?` · note ${current+1} of ${targets.length}`:''}.`;$('phase-time').textContent=`${Math.max(0,Math.ceil(totalSeconds-t))}s`;
  [...$('sequence').children].forEach((el,i)=>el.classList.toggle('current',current===i));animation=requestAnimationFrame(captureFrame);
}
function updateLive(){
  if(!live){$('detected-note').textContent='—';$('detected-hz').innerHTML='— <small>Hz</small>';$('detected-cents').innerHTML='— <small>cents</small>';$('live-status').textContent='Listening for your voice…';$('signal-dot').classList.remove('on');return;}
  const nearest=nearestSwara(live.hz,settings.base),cents=centsBetween(live.hz,swaraHz(settings.base,live.index));
  $('detected-note').textContent=Math.abs(nearest.cents)>60?'Outside raga':SWARAS[nearest.index].name+(nearest.octave<0?' (lower)':nearest.octave>0?' (upper)':'');$('detected-hz').innerHTML=`${live.hz.toFixed(1)} <small>Hz</small>`;$('detected-cents').innerHTML=`${cents>0?'+':''}${Math.round(cents)} <small>cents</small>`;$('live-status').textContent=Math.abs(cents)<=tolerance()?'Finding the center':cents>0?'A little high · ease down':'A little low · lift gently';$('signal-dot').classList.add('on');
}
function cancelExercise(){controller?.abort();cancelAnimationFrame(animation);sound.stopNotes();sound.finishRecording();sound.releaseMic();previewing=false;playingIndex=null;setPhase('idle','Practice paused. Choose an action when ready.');$('answer-options').hidden=true;$('signal-dot').classList.remove('on');drawChart();}
function answer(index){
  if(phase!=='answer'||answers.length>=targets.length)return;
  answers.push(index);
  updateAnswerEntry();
}
function updateAnswerEntry(){
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
  setPhase('result',result.pass?'A good note to build on.':isMemory()?'Try the swara again from memory.':'Listen again. There’s room to grow.');$('note-kicker').textContent=isMemory()?'FROM MEMORY':'YOUR REFERENCE';$('begin').innerHTML='<span>Try again</span><span aria-hidden="true">↻</span>';$('sequence').querySelectorAll('span').forEach(el=>el.classList.remove('current'));
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
  else if(result.pass)body=isMemory()?`You found ${targets.map(i=>SWARAS[i].name).join(' · ')} without hearing a reference. Keep that sound in mind for the next exercise.`:targets.length===1?`You held ${SWARAS[targets[0]].name} close to the reference. Keep your breath easy and aim for the same steady sound on your next note.`:'You found the notes in this phrase. Keep listening for smooth, deliberate transitions as the sequence becomes familiar.';
  else{const d=result.details.find(d=>!d.pass);const note=SWARAS[d.index].name;if(!d.detected)body=`We didn’t hear a sustained ${note} in its response window. Follow the note cue and hold each swara until the next prompt.`;else if(Math.abs(d.cents)>700)body=`Your ${note} landed in a different register from the target. ${isMemory()?'Recall its pitch':'Listen to the octave'}, then try again. Choose a more comfortable base shruthi if needed.`;else if(Math.abs(d.cents)>tolerance())body=`Your ${note} was about ${Math.abs(Math.round(d.cents))} cents ${d.cents>0?'high':'low'}. ${d.cents>0?'Ease down':'Lift gently'} toward the target, then hold it steady.`;else body=`You found ${note}, but it drifted during the hold. ${isMemory()?'Try again':'Listen again'}, keep your breath relaxed, and aim for a steadier line.`;if(attempt>=3)body+=' You’ve given this note three tries. Take a breath or move to a different note.';}
  $('exercise-panel').classList.add('show-result');$('feedback').hidden=false;$('feedback').innerHTML=`<h3>${heading}</h3><p>${body}</p>${result.identification?'':`<div class="feedback-stat">${result.accuracy}% of detected pitch frames within ±${tolerance()} cents${!result.voiced?' · No reliable voice detected':''}</div>`}<div class="result-notes">${result.details.map(d=>`<span>${SWARAS[d.index].name} · ${d.detected?d.accuracy+'%':'not heard'}${d.stability!==null&&d.stability!==undefined?' · '+Math.round(d.stability)+'¢ variation':''}</span>`).join('')}</div><div class="feedback-actions"><button class="primary-button" id="next-exercise">Next exercise <span>→</span></button><button class="secondary-button" id="retry-exercise">${isMemory()?'Try again':'Listen & retry'}</button>${recording?'<audio controls aria-label="Listen to your recording"></audio>':''}</div>`;
  if(recording)$('feedback').querySelector('audio').src=recording;
  $('next-exercise').onclick=nextExercise;$('retry-exercise').onclick=()=>{attempt++;begin();};
  $('live-status').textContent=result.identification?'Answer saved':result.pass?'A steady step forward':'Practice saved';$('signal-dot').classList.remove('on');
}
function nextExercise(){
  cancelExercise();exercise++;attempt=1;
  samples=[];renderExercise();$('chart-empty').hidden=false;
}
function updateDaily(){const today=new Date().toDateString();const n=history.filter(h=>new Date(h.time).toDateString()===today).length;$('today-count').innerHTML=`${n} <span>/ 8</span>`;$('goal-ring').style.strokeDashoffset=String(125.67*(1-Math.min(n/8,1)));}
function updateDroneButton(){$('drone-toggle').setAttribute('aria-pressed',String(drone));$('drone-status').textContent=drone?'On':'Off';}
function drawChart(){
  const canvas=$('pitch-chart'),bounds=canvas.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);
  const c=canvas.getContext('2d');c.scale(dpr,dpr);
  const w=bounds.width,h=bounds.height,left=53,right=w-12,top=13,bottom=h-25;
  const baseHz=midiHz(settings.base);
  const pitchOffset=hz=>12*Math.log2(hz/baseHz);
  const yForOffset=offset=>bottom-Math.max(0,Math.min(12,offset))/12*(bottom-top);
  const xForTime=time=>left+Math.max(0,Math.min(totalSeconds,time))/totalSeconds*(right-left);
  c.clearRect(0,0,w,h);

  // Twelve octave positions; some have two Carnatic swara names.
  PITCH_POSITION_LABELS.forEach((label,offset)=>{
    const y=yForOffset(offset),inRaga=SWARAS.some(note=>note.offset===offset);
    c.strokeStyle=inRaga?'#d3dfcf':'#e9ebe5';c.lineWidth=1;
    c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();
    c.fillStyle=inRaga?'#426746':'#9aa59a';
    c.font='8px "DM Sans", sans-serif';c.textAlign='left';
    c.fillText(label,offset===0?15:1,y+3);
  });
  c.fillStyle='#426746';c.font='8px "DM Sans", sans-serif';c.fillText('Upper Sa',1,top+3);

  // Each response window shows its own target at the correct pitch.
  targets.forEach((index,n)=>{
    const x0=left+n/targets.length*(right-left),x1=left+(n+1)/targets.length*(right-left);
    const y=yForOffset(SWARAS[index].offset),band=Math.max(2,tolerance()/100*(bottom-top)/12);
    c.fillStyle='#dce9d1';c.fillRect(x0,y-band,x1-x0,band*2);
    c.strokeStyle='#729363';c.lineWidth=2;c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();
  });
  if(targets.length>1)for(let n=1;n<targets.length;n++){
    const x=left+n/targets.length*(right-left);
    c.setLineDash([2,4]);c.strokeStyle='#cbd5c3';c.lineWidth=1;
    c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();
  }
  c.setLineDash([]);
  c.fillStyle='#a1aa99';c.font='8px "DM Mono", monospace';
  for(let n=0;n<=totalSeconds;n+=Math.max(1,Math.ceil(totalSeconds/6))){c.fillText(n+'s',xForTime(n)-3,h-6);}

  let previous=null;
  for(const sample of samples){
    if(!sample.hz){previous=null;continue;}
    const offset=pitchOffset(sample.hz),point={x:xForTime(sample.t),y:yForOffset(offset)};
    if(previous){c.strokeStyle='#b27752';c.lineWidth=2;c.lineCap='round';c.beginPath();c.moveTo(previous.x,previous.y);c.lineTo(point.x,point.y);c.stroke();}
    previous=point;
  }
  if(phase==='recording'&&live){
    const offset=pitchOffset(live.hz),x=xForTime(live.t),y=yForOffset(offset);
    c.fillStyle='#a96947';c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fill();
    if(offset<0||offset>12){c.font='13px "DM Sans", sans-serif';c.fillText(offset>12?'↑':'↓',x+6,y+(offset>12?6:2));}
  }
  if(phase==='reference'&&playingIndex!==null){
    const y=yForOffset(SWARAS[playingIndex].offset);
    c.fillStyle='#456e4b';c.beginPath();c.arc(right-9,y,5,0,Math.PI*2);c.fill();
  }
}
function showView(next){if(view!==next){if(busy())cancelExercise();if(view==='challenges')challenges?.reset();if(view==='tools')tools?.stop();sound.stopNotes();if(['challenges','tools'].includes(next)&&drone){sound.stopDrone();drone=false;updateDroneButton();}}view=next;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${next}-view`);document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===next);el.setAttribute('aria-current',el.dataset.view===next?'page':'false');});if(next==='progress')renderProgress();if(next==='library')renderLibrary();if(next==='practice')requestAnimationFrame(drawChart);if(next==='tools')tools?.render();}
function renderProgress(){
  const ragaHistory=history.filter(entry=>(entry.raga||DEFAULT_RAGA)===settings.raga&&entry.notes.every(note=>note.index<SWARAS.length));
  const count=ragaHistory.length,avg=count?Math.round(ragaHistory.reduce((s,h)=>s+h.accuracy,0)/count):0;const dates=new Set(ragaHistory.map(h=>new Date(h.time).toDateString()));
  let content=`<p class="eyebrow">YOUR PRACTICE JOURNAL</p><h1 class="progress-intro">Small steps, lasting progress.</h1><p class="page-description">Your ${RAGAS[settings.raga].name} practice on this device.</p>`;
  if(!count){content+='<div class="empty-progress"><div><h2>Your first note starts the story.</h2><p>Complete a practice exercise to see your pitch accuracy and the swaras to revisit.</p></div><button class="primary-button" data-back-practice>Begin practice <span>→</span></button></div>';}
  else{
    content+=`<div class="progress-stats"><div><span class="label">ATTEMPTS</span><strong>${count}</strong></div><div><span class="label">AVERAGE ACCURACY</span><strong>${avg}%</strong></div><div><span class="label">DAYS OF PRACTICE</span><strong>${dates.size}</strong></div></div>`;
    const stats=SWARAS.map((s,i)=>{const notes=ragaHistory.flatMap(h=>h.notes).filter(n=>n.index===i);return {...s,index:i,count:notes.length,accuracy:notes.length?Math.round(notes.reduce((a,n)=>a+n.accuracy,0)/notes.length):null,stability:notes.filter(n=>Number.isFinite(n.stability)).length?Math.round(notes.filter(n=>Number.isFinite(n.stability)).reduce((a,n)=>a+n.stability,0)/notes.filter(n=>Number.isFinite(n.stability)).length):null};});
    const recent=ragaHistory.slice(-5);const ready=recent.length===5&&recent.every(h=>h.pass);const recommendedStep=ready?Math.min(recent.at(-1).step+1,3):1;
    content+=`<div class="recommendation"><p><strong>${ready?'Ready for a new kind of listening.':`Keep listening with a fresh sequence.`}</strong>${ready?'Your last five attempts met the accuracy target. Explore the next step on your learning path.':`The app will choose the next swaras for you. Replay the sequence as often as you need.`}</p><button class="primary-button" id="recommended-practice" data-rec-step="${recommendedStep}">Continue practice <span>→</span></button></div><h2 class="section-title">A closer look at each swara</h2><table class="data-table"><thead><tr><th>SWARA</th><th>ATTEMPTS</th><th>ACCURACY</th><th>PITCH VARIATION</th></tr></thead><tbody>${stats.map(s=>`<tr><td>${s.name} <small>${s.variant}</small></td><td>${s.count||'—'}</td><td>${s.accuracy===null?'—':s.accuracy+'%'}</td><td>${s.stability===null?'—':s.stability+' cents'}</td></tr>`).join('')}</tbody></table><h2 class="section-title">Recent practice</h2><table class="data-table"><thead><tr><th>WHEN</th><th>EXERCISE</th><th>SHRUTHI</th><th>ACCURACY</th></tr></thead><tbody>${[...ragaHistory].reverse().slice(0,15).map(h=>`<tr><td>${new Date(h.time).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</td><td>${({sing:'Singing',name:'Naming',memory:'From memory',repeat:'Singing',next:'Singing',identify:'Naming'})[h.mode]||'Practice'} · Step ${h.step} · ${h.notes.map(n=>SWARAS[n.index].name).join(' ')}</td><td>${noteName(h.base)}</td><td>${h.accuracy}%</td></tr>`).join('')}</tbody></table><p class="field-note">Pitch accuracy is the proportion of detected voice frames within the selected tolerance. Variation is the median pitch spread. This journal stays on this browser and device.</p>`;
  }$('progress-view').innerHTML=content;
  $('progress-view').querySelector('[data-back-practice]')?.addEventListener('click',()=>showView('practice'));
  $('recommended-practice')?.addEventListener('click',e=>{const b=e.currentTarget;step=Number(b.dataset.recStep);mode='sing';syncPath();renderExercise();showView('practice');});
}
function renderLibrary(){
  const cards=RAGA_LIST.map(raga=>{
    const selected=raga.id===settings.raga;
    const ascent=raga.notes.map(note=>note.variant).join(' ');
    const descent=[...raga.notes].reverse().map(note=>note.variant).join(' ');
    return `<article class="raga-card${selected?' selected':''}"><div class="raga-card-heading"><span class="label">${raga.type}</span>${selected?'<span class="raga-current">Selected</span>':''}</div><h2>${raga.name}</h2><p>${raga.description}</p><div class="raga-scale"><span>Ārohaṇa</span><strong>${ascent}</strong><span>Avarohaṇa</span><strong>${descent}</strong></div><div class="raga-actions"><button class="secondary-button" data-practice-raga="${raga.id}" aria-label="Practice ${raga.name}">${selected?'Continue practice':'Practice this raga'} <span aria-hidden="true">→</span></button><a href="${raga.source}" target="_blank" rel="noopener noreferrer">Scale source ↗</a></div></article>`;
  }).join('');
  $('library-view').innerHTML=`<p class="eyebrow">THE SWARA LIBRARY</p><h1 class="progress-intro">Choose a raga.</h1><p class="page-description">Explore the note sets, then practice listening, naming, or singing in the selected raga.</p><p class="library-note">Seven swara names share twelve pitch positions in an octave. A raga chooses specific variants; Mohanam uses five swaras.</p><div class="raga-grid">${cards}</div><h2 class="section-title">Notes in ${RAGAS[settings.raga].name}</h2><table class="data-table"><thead><tr><th>SWARA</th><th>VARIANT</th><th>WESTERN NOTE</th><th>FREQUENCY</th><th>LISTEN</th></tr></thead><tbody>${SWARAS.map((s,i)=>`<tr><td>${s.name}</td><td>${s.variant}</td><td>${noteName(settings.base+s.offset)}</td><td>${swaraHz(settings.base,i).toFixed(2)} Hz</td><td><button class="secondary-button" data-library-note="${i}" aria-label="Listen to ${s.name}">▷</button></td></tr>`).join('')}</tbody></table><p class="field-note">Pitches are relative to your selected Sa (${noteName(settings.base)}) and use equal temperament. These exercises use plain notes; characteristic phrases, gamakas, and intonation need guided listening beyond this pitch chart.</p>`;
  $('library-view').querySelectorAll('[data-practice-raga]').forEach(button=>button.onclick=()=>{selectRaga(button.dataset.practiceRaga);showView('practice');});
  $('library-view').querySelectorAll('[data-library-note]').forEach(b=>b.onclick=async()=>{await sound.unlock();sound.stopNotes();sound.tone(swaraHz(settings.base,Number(b.dataset.libraryNote)),referenceDuration());});
}
function syncPath(){document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===step));document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.mode===mode));b.textContent=b.dataset.mode==='memory'?'Sing from memory':`${b.dataset.mode==='sing'?'Sing':'Name'} the ${step===1?'swara':'swaras'}`;});}
function openSettings(){if(busy())return;if(view==='challenges')challenges?.reset();if(view==='tools')tools?.stop();updateConfig();$('settings-dialog').showModal();}
for(const id of ['settings-open','shruthi-open','raga-open'])$(id).onclick=openSettings;
$('settings-dialog').querySelector('form').addEventListener('submit',event=>{if(event.submitter?.value!=='save')return;settings.base=Number($('shruthi-select').value);settings.level=$('level-select').value;settings.duration=$('duration-select').value;settings.response=Number($('response-select').value);if(drone)sound.toggleDrone(settings.base,true);selectRaga($('raga-select').value);toast('Your practice settings are saved.');});
$('help-open').onclick=()=>$('help-dialog').showModal();
$('drone-toggle').onclick=async()=>{if(busy()){toast('The drone is paused during pitch evaluation. Try it between exercises.');return;}try{drone=!drone;await sound.toggleDrone(settings.base,drone);updateDroneButton();}catch{drone=false;updateDroneButton();toast('Audio could not start. Try again.');}};
$('answer-options').onclick=e=>{const b=e.target.closest('[data-answer]');if(b)answer(Number(b.dataset.answer));};
$('answer-undo').onclick=()=>{if(phase==='answer'&&answers.length){answers.pop();updateAnswerEntry();}};
$('answer-clear').onclick=()=>{if(phase==='answer'&&answers.length){answers=[];updateAnswerEntry();}};
$('answer-submit').onclick=submitAnswer;
$('begin').onclick=()=>{if(phase==='result')attempt++;begin();};$('preview-note').onclick=preview;
// Tabs follow standard keyboard behavior as well as pointer interaction.
const tabs=[...document.querySelectorAll('[data-mode]')];tabs.forEach((b,i)=>{b.onclick=()=>{if(mode===b.dataset.mode)return;cancelExercise();mode=b.dataset.mode;attempt=1;samples=[];syncPath();renderExercise(false);$('chart-empty').hidden=false;};b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[index].focus();tabs[index].click();}};});
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{cancelExercise();step=Number(b.dataset.step);mode='sing';attempt=1;samples=[];syncPath();renderExercise();showView('practice');$('chart-empty').hidden=false;});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
document.querySelector('.brand').onclick=e=>{e.preventDefault();showView('practice');};
new ResizeObserver(()=>drawChart()).observe($('pitch-chart'));
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(busy())cancelExercise();challenges?.reset();tools?.stop();sound.stopDrone();drone=false;updateDroneButton();}});
window.addEventListener('pagehide',()=>sound.shutdown());
challenges=createChallenges({sound,getSettings:()=>settings,getNotes:()=>SWARAS,onSettings:openSettings});
tools=createTools({sound,getSettings:()=>settings,getNotes:()=>SWARAS,onSettings:openSettings});
updateConfig();syncPath();renderExercise();
