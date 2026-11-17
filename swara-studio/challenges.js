import {RAGAS,centsBetween,detectPitch,scorePitch,swaraHz} from './music.js?v=20261116-13';

const GAMES=[
  {id:'detective',name:'Sa Detective',kind:'SWARASTHANA',description:'Hear anchor Sa, find the mystery swara, then sing it.'},
  {id:'impostor',name:'Which note moved?',kind:'SWARASTHANA',description:'Two short phrases differ by one swara. Find its place.'},
  {id:'ladder',name:'Blind ladder',kind:'SWARASTHANA',description:'Remember a short sequence and sing it without a reference.'},
  {id:'blackout',name:'Beat blackout',kind:'TAALAM',description:'Keep Ādi tāla going when the audible pulse disappears.'},
  {id:'echo',name:'Konnakol echo',kind:'TAALAM',description:'Hear a rhythm, then tap back its ta ka or ta ka dhi mi pattern.'},
  {id:'landing',name:'Land on Sa',kind:'SWARA + TAALAM',description:'Sing one swara per beat and arrive on Sa at the next first beat.'}
];
const ACTIONS=['Clap','Little finger','Ring finger','Middle finger','Clap','Wave','Clap','Wave'];
const pick=items=>items[Math.floor(Math.random()*items.length)];
const shuffle=items=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const wait=(ms,signal)=>new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Cancelled','AbortError'));const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},Math.max(0,ms));const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};signal.addEventListener('abort',cancel,{once:true});});

export function createChallenges({sound,getSettings,getNotes,onSettings}){
  const root=document.getElementById('challenges-view');
  let game='detective',phase='ready',round=null,controller=null,tapTimes=[],timers=[],sampleTimer=null,tempo=60;
  let wins={};
  try{const saved=JSON.parse(localStorage.getItem('swara-studio-challenges-v1')||'{}');if([60,72,84].includes(saved.tempo))tempo=saved.tempo;if(saved.wins&&typeof saved.wins==='object')for(const {id} of GAMES)wins[id]=Math.max(0,Math.min(999,Number(saved.wins[id])||0));}catch{}
  const $=id=>root.querySelector(`#${id}`);
  const notes=()=>getNotes();
  const settings=()=>getSettings();
  const name=index=>notes()[index].name;
  const duration=()=>Number(settings().duration);
  const pitchTolerance=()=>({beginner:35,intermediate:25,advanced:15})[settings().level]||35;
  const beatMs=()=>60000/tempo;
  const gameInfo=()=>GAMES.find(item=>item.id===game);
  const active=()=>!['ready','result','answer','sing_ready'].includes(phase);
  function remember(){try{localStorage.setItem('swara-studio-challenges-v1',JSON.stringify({tempo,wins}));}catch{}}
  function shell(){
    root.innerHTML=`<p class="eyebrow">THE PLAYFUL PRACTICE ROOM</p><h1 class="progress-intro">Little games. Deeper listening.</h1><p class="page-description">Six short challenges for swarasthanas and Ādi tāla. Start slowly; the app will add a little more after successful rounds.</p><div class="challenge-toolbar"><span><strong id="challenge-raga"></strong> · Sa <span id="challenge-sa"></span></span><label for="challenge-tempo">Tāla tempo <select id="challenge-tempo"><option value="60">60 BPM</option><option value="72">72 BPM</option><option value="84">84 BPM</option></select></label></div><div class="challenge-layout"><nav class="challenge-list" aria-label="Choose a challenge">${GAMES.map((item,i)=>`<button class="challenge-card" data-game="${item.id}" type="button"><span class="challenge-card-number">0${i+1}</span><span><small>${item.kind}</small><strong>${item.name}</strong><em>${item.description}</em></span><span class="challenge-card-score" data-score="${item.id}"></span></button>`).join('')}</nav><section class="challenge-stage"><span class="label" id="challenge-kind"></span><h2 id="challenge-title"></h2><p id="challenge-prompt"></p><div class="challenge-feedback" id="challenge-feedback" role="status" hidden></div><div class="challenge-display" id="challenge-display"></div><div class="challenge-options" id="challenge-options"></div><div class="challenge-controls"><button class="primary-button" id="challenge-primary" type="button">Start round <span>→</span></button><button class="secondary-button" id="challenge-secondary" type="button" hidden></button><button class="challenge-tap" id="challenge-tap" type="button" hidden>Tap each count</button></div><p class="challenge-status" id="challenge-status"></p></section></div>`;
    root.querySelector('.challenge-toolbar>span').insertAdjacentHTML('beforeend',' <button id="challenge-raga-change" type="button">Change raga</button>');
    root.addEventListener('click',onClick);
    $('challenge-tempo').addEventListener('change',event=>{tempo=Number(event.target.value);remember();reset();});
    render();
  }
  function render(){
    const info=gameInfo();
    root.querySelectorAll('[data-game]').forEach(button=>{button.classList.toggle('selected',button.dataset.game===game);button.setAttribute('aria-current',button.dataset.game===game?'true':'false');});
    root.querySelectorAll('[data-score]').forEach(el=>el.textContent=wins[el.dataset.score]?`${wins[el.dataset.score]} ✓`:'');
    $('challenge-raga').textContent=RAGAS[settings().raga]?.name||'';
    $('challenge-sa').textContent=`${Math.round(440*2**((settings().base-69)/12))} Hz`;
    $('challenge-tempo').value=String(tempo);
    $('challenge-kind').textContent=info.kind;
    $('challenge-title').textContent=info.name;
    $('challenge-prompt').textContent=info.description;
    $('challenge-feedback').hidden=true;
    $('challenge-options').innerHTML='';
    $('challenge-display').innerHTML=`<div class="challenge-placeholder"><span aria-hidden="true">${{detective:'♬',impostor:'↔',ladder:'◌',blackout:'◉',echo:'♫',landing:'↗'}[game]}</span><p>${{detective:'Listen to Sa, then a mystery note.',impostor:'Find the one place where the phrase changes.',ladder:'Remember the names before they disappear.',blackout:'Tap every count, even when the sound stops.',echo:'Listen on one beat; echo on the next.',landing:'Sing toward Sa on the next first beat.'}[game]}</p></div>`;
    $('challenge-primary').hidden=false;$('challenge-primary').innerHTML='<span>Start round</span><span>→</span>';
    $('challenge-secondary').hidden=true;$('challenge-secondary').disabled=false;$('challenge-tap').hidden=true;
    $('challenge-status').textContent=game==='blackout'?'Ādi tāla: clap, three finger counts, clap–wave, clap–wave.':game==='echo'?'Tap the syllables on screen. You may speak them aloud too.':'The selected raga supplies the swara names for this game.';
  }
  function updateFeedback(title,body,good=false){const el=$('challenge-feedback');el.hidden=false;el.classList.toggle('good',good);el.innerHTML=`<strong>${title}</strong><p>${body}</p>`;}
  function setPrimary(label){$('challenge-primary').hidden=false;$('challenge-primary').innerHTML=`<span>${label}</span><span>→</span>`;}
  function setSecondary(label){$('challenge-secondary').hidden=false;$('challenge-secondary').disabled=false;$('challenge-secondary').textContent=label;}
  function setStatus(label){$('challenge-status').textContent=label;}
  function setDisplay(html){$('challenge-display').innerHTML=html;}
  function clearAudio(){for(const timer of timers)clearTimeout(timer);timers=[];sound.stopNotes();}
  function stop(){controller?.abort();controller=null;clearAudio();if(sampleTimer){clearInterval(sampleTimer);sampleTimer=null;}sound.finishRecording();sound.releaseMic();$('challenge-tap').hidden=true;tapTimes=[];phase='ready';}
  function reset(){stop();round=null;render();}
  function clickTone(accent=false,soft=false){
    if(!sound.ctx)return;
    const ctx=sound.ctx,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    osc.type='sine';osc.frequency.value=accent?880:soft?520:660;
    gain.gain.setValueAtTime(soft?.04:.075,now);gain.gain.exponentialRampToValueAtTime(.001,now+.08);
    osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.085);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  function scheduleClick(delay,accent,signal){const timer=setTimeout(()=>{if(!signal.aborted)clickTone(accent);},delay);timers.push(timer);}
  async function playNote(index,signal){if(signal.aborted)return;sound.tone(swaraHz(settings().base,index,notes()),duration());await wait(duration()*1000,signal);}
  async function prepare(){controller=new AbortController();phase='preparing';$('challenge-feedback').hidden=true;$('challenge-options').innerHTML='';$('challenge-tap').hidden=true;setPrimary('Stop round');$('challenge-secondary').hidden=true;await sound.unlock();if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');return controller.signal;}
  function makeRound(){
    const available=notes().map((_,i)=>i);
    if(game==='detective')return {target:pick(available),namedCorrect:false};
    if(game==='impostor'){
      const first=Array.from({length:3},()=>pick(available));
      const moved=Math.floor(Math.random()*3),old=first[moved];
      const alternatives=available.filter(i=>i!==old).sort((a,b)=>Math.abs(notes()[a].offset-notes()[old].offset)-Math.abs(notes()[b].offset-notes()[old].offset));
      const second=[...first];second[moved]=pick(alternatives.slice(0,Math.min(2,alternatives.length)));
      return {first,second,moved};
    }
    if(game==='ladder')return {sequence:Array.from({length:(wins.ladder||0)>=3?3:2},()=>pick(available))};
    if(game==='blackout')return {};
    if(game==='echo')return {subdivisions:(wins.echo||0)>=2?pick([2,4]):2};
    const start=(wins.landing||0)>=3?pick([1,2]):1;
    return {sequence:[start,start+1,start+1,start,0]};
  }
  async function start(reuse=false){
    stop();round=reuse&&round?round:makeRound();
    try{
      const signal=await prepare();
      if(game==='detective')await detective(signal);
      else if(game==='impostor')await impostor(signal);
      else if(game==='ladder')await ladder(signal);
      else if(game==='blackout')await blackout(signal);
      else if(game==='echo')await echo(signal);
      else await landing(signal);
    }catch(error){if(error.name==='AbortError')return;stop();setPrimary('Try again');setStatus(error.name==='NotAllowedError'?'Microphone access was declined. Allow it in your browser settings to sing.':error.message||'This round could not start. Please try again.');}
  }
  async function detective(signal){
    phase='playing';setDisplay('<div class="challenge-mystery">Sa <span>→</span> ?</div>');setStatus('Anchor Sa is playing.');
    await playNote(0,signal);await wait(250,signal);setStatus('Listen to the mystery swara.');await playNote(round.target,signal);
    phase='answer';setPrimary('Replay');setSecondary('New round');
    const choices=(wins.detective||0)<3?shuffle([round.target,...shuffle(notes().map((_,i)=>i).filter(i=>i!==round.target)).slice(0,3)]):notes().map((_,i)=>i);
    $('challenge-options').innerHTML=choices.map(i=>`<button type="button" data-answer="${i}">${name(i)}</button>`).join('');
    setStatus('Name the mystery swara.');
  }
  function answerDetective(index){
    round.namedCorrect=index===round.target;phase='sing_ready';
    $('challenge-options').innerHTML='';setDisplay(`<div class="challenge-mystery">Sa <span>→</span> ${name(round.target)}</div>`);
    updateFeedback(round.namedCorrect?'You found it.':`It was ${name(round.target)}.`,round.namedCorrect?'Now find that same note with your voice.':`You chose ${name(index)}. Listen to the difference, then sing ${name(round.target)}.`,round.namedCorrect);
    setPrimary(`Sing ${name(round.target)}`);setSecondary('New round');setStatus(`Sing for ${settings().response} seconds. No reference will play.`);
  }
  async function impostor(signal){
    phase='playing';setDisplay('<div class="challenge-mystery">Phrase A <span>→</span> Phrase B</div>');
    setStatus('Anchor Sa is playing.');await playNote(0,signal);await wait(250,signal);
    for(const [label,phrase] of [['A',round.first],['B',round.second]]){
      setStatus(`Listen to phrase ${label}.`);
      for(let n=0;n<phrase.length;n++){await playNote(phrase[n],signal);if(n<phrase.length-1)await wait(180,signal);}
      if(label==='A')await wait(500,signal);
    }
    phase='answer';setPrimary('Replay');setSecondary('New round');
    $('challenge-options').innerHTML=[1,2,3].map(n=>`<button type="button" data-position="${n-1}">Note ${n}</button>`).join('');
    setStatus('Which position changed in phrase B?');
  }
  function answerImpostor(position){
    const correct=position===round.moved;
    finish(correct,correct?'You spotted the change.':`The change was at note ${round.moved+1}.`,`A: ${round.first.map(name).join(' · ')}<br>B: ${round.second.map(name).join(' · ')}`);
  }
  async function ladder(signal){
    phase='memorize';const sequence=round.sequence.map(name).join(' · ');
    setDisplay(`<div class="challenge-mystery">${sequence}</div>`);setStatus('Remember the order. These names will disappear.');
    for(let n=4;n>0;n--){$('challenge-primary').querySelector('span').textContent=`Hiding in ${n}s`;await wait(1000,signal);}
    phase='sing_ready';setDisplay('<div class="challenge-mystery">? · ?'+(round.sequence.length===3?' · ?':'')+'</div>');setPrimary('Sing from memory');setSecondary('Show names');setStatus(`Sing each swara for ${settings().response} seconds. The app will not play them.`);
  }
  function scoreTiming(expected,actual,toleranceMs){
    const remaining=[...actual];let hits=0;let sum=0;
    for(const time of expected){if(!remaining.length)break;let nearest=0;for(let i=1;i<remaining.length;i++)if(Math.abs(remaining[i]-time)<Math.abs(remaining[nearest]-time))nearest=i;const error=Math.abs(remaining[nearest]-time);if(error<=toleranceMs){hits++;sum+=error;remaining.splice(nearest,1);}}
    return {hits,total:expected.length,extras:Math.max(0,actual.length-hits),accuracy:Math.round(100*hits/Math.max(expected.length,actual.length)),average:hits?Math.round(sum/hits):null};
  }
  async function blackout(signal){
    phase='blackout';tapTimes=[];$('challenge-tap').hidden=false;$('challenge-tap').disabled=false;
    setDisplay('<div class="challenge-beat">1 <small>Clap</small></div>');
    const start=performance.now()+100,beat=beatMs();
    for(let i=0;i<24;i++){
      await wait(start+i*beat-performance.now(),signal);
      const cycle=Math.floor(i/8),position=i%8;
      round.cycle=cycle;round.position=position;
      if(cycle!==1)clickTone(position===0||position===4||position===6);
      setDisplay(cycle===1?'<div class="challenge-beat ghost">? <small>Keep counting</small></div>':`<div class="challenge-beat">${position+1}<small>${ACTIONS[position]}</small></div>`);
      setStatus(cycle===0?'Listen and tap all eight counts.':cycle===1?'The sound is gone. Keep the same pace and tap every count.':'Hear the pulse return. Keep tapping.');
    }
    await wait(start+24*beat-performance.now(),signal);
    const expected=Array.from({length:8},(_,i)=>start+(8+i)*beat),score=scoreTiming(expected,tapTimes,Math.min(220,beat*.25));
    const pass=score.hits>=6&&score.accuracy>=70;
    finish(pass,pass?'You kept the pulse through silence.':'The silent cycle drifted a little.',`You tapped ${score.hits} of 8 silent counts close to the beat.${score.extras?` ${score.extras} extra tap${score.extras===1?'':'s'}.`:''}${score.average!==null?` Average difference: ${score.average} ms.`:''} Try the hand pattern as you tap.`);
  }
  async function echo(signal){
    phase='echo';tapTimes=[];$('challenge-tap').hidden=false;
    $('challenge-tap').disabled=true;
    const subdivisions=round.subdivisions,syllables=subdivisions===2?'ta ka':'ta ka dhi mi',beat=beatMs(),start=performance.now()+2*beat+100;
    for(let count=2;count>0;count--){await wait(start-count*beat-performance.now(),signal);clickTone(count===2);setDisplay(`<div class="challenge-beat">${count}<small>Get ready</small></div>`);setStatus('Keep an even pulse. Listen on one beat and echo on the next.');}
    const expected=[];
    for(let i=0;i<8;i++){
      await wait(start+i*beat-performance.now(),signal);
      const yourTurn=i%2===1;
      round.yourTurn=yourTurn;
      $('challenge-tap').disabled=!yourTurn;
      clickTone(i===0||i===4,true);
      if(yourTurn){for(let n=0;n<subdivisions;n++)expected.push(start+i*beat+n*beat/subdivisions);setDisplay(`<div class="challenge-mystery">Your turn: ${syllables}</div>`);setStatus(`Tap ${subdivisions} even syllables before the next beat.`);}
      else{for(let n=0;n<subdivisions;n++)scheduleClick(n*beat/subdivisions,true,signal);setDisplay(`<div class="challenge-mystery">Listen: ${syllables}</div>`);setStatus('Listen now; echo on the next beat.');}
    }
    await wait(start+8*beat-performance.now(),signal);$('challenge-tap').disabled=true;
    const score=scoreTiming(expected,tapTimes,Math.min(200,beat/subdivisions*.7));
    const pass=score.accuracy>=70;
    finish(pass,pass?'Your syllables stayed with the beat.':'Give each syllable the same space.',`${score.hits} of ${score.total} taps matched the ${syllables} pattern.${score.extras?` ${score.extras} extra tap${score.extras===1?'':'s'}.`:''} Say the syllables aloud as you try again.`);
  }
  async function recordPitch(targets,secondsPerNote,signal,onProgress){
    await sound.microphone(signal);
    const samples=[],start=performance.now();
    sampleTimer=setInterval(()=>{if(!sound.analyser)return;const t=(performance.now()-start)/1000;const buffer=new Float32Array(sound.analyser.fftSize);sound.analyser.getFloatTimeDomainData(buffer);const result=detectPitch(buffer,sound.ctx.sampleRate);samples.push({t,hz:result?.hz||null});onProgress?.(t,result?.hz||null);},40);
    try{await wait(targets.length*secondsPerNote*1000,signal);}finally{clearInterval(sampleTimer);sampleTimer=null;sound.releaseMic();}
    return samples;
  }
  async function singChallenge(signal,targets,fromDetective=false){
    phase='recording';setPrimary('Stop round');$('challenge-secondary').hidden=true;$('challenge-feedback').hidden=true;
    const perNote=Number(settings().response);setStatus('Allow microphone access, then sing the named swara.');
    let lastPosition=-1;
    const samples=await recordPitch(targets,perNote,signal,(t,hz)=>{const position=Math.min(targets.length-1,Math.floor(t/perNote));const target=targets[position],deviation=hz?Math.round(centsBetween(hz,swaraHz(settings().base,target,notes()))):null;if(position!==lastPosition){setDisplay(`<div class="challenge-mystery">${name(target)} <small>${position+1} of ${targets.length}</small></div>`);lastPosition=position;}setStatus(deviation===null?'Listening for your voice…':Math.abs(deviation)<=pitchTolerance()?'Close to the center':deviation>0?`${Math.abs(deviation)} cents high · ease down`:`${Math.abs(deviation)} cents low · lift gently`);});
    const result=scorePitch(samples,targets,perNote,settings().base,pitchTolerance(),notes());
    if(fromDetective){const pass=round.namedCorrect&&result.pass;finish(pass,pass?'Your ear and voice found the same swara.':round.namedCorrect?'Your ear found it; try singing it again.':result.pass?'Your voice found it; listen for the name again.':'Listen once more, then try the pitch again.',`Naming: ${round.namedCorrect?'correct':'try again'} · Singing: ${result.accuracy}% of detected pitch frames near ${name(targets[0])}.`);}
    else finish(result.pass,result.pass?'You remembered the ladder.':'Keep the note order in mind and try again.',`${result.accuracy}% of detected pitch frames were near the target.${!result.voiced?' We did not hear enough steady voice to score the notes.':''} ${targets.map((target,i)=>`${name(target)} ${result.details[i].accuracy}%`).join(' · ')}`);
  }
  async function landing(signal){
    phase='landing';setPrimary('Stop round');$('challenge-secondary').hidden=true;
    await sound.microphone(signal);
    const beat=beatMs(),perNote=beat/1000,sequence=round.sequence,start=performance.now()+100,phraseStart=start+4*beat,samples=[];
    sampleTimer=setInterval(()=>{if(!sound.analyser)return;const t=(performance.now()-phraseStart)/1000;const buffer=new Float32Array(sound.analyser.fftSize);sound.analyser.getFloatTimeDomainData(buffer);const result=detectPitch(buffer,sound.ctx.sampleRate);samples.push({t,hz:result?.hz||null});},40);
    try{
      setDisplay(`<div class="challenge-phrase">${sequence.map((index,i)=>`<span>${i===4?'<small>LAND</small>':''}${name(index)}</span>`).join('')}</div>`);
      for(let i=0;i<9;i++){
        await wait(start+i*beat-performance.now(),signal);clickTone(i===0||i===4||i===8);
        if(i<4)setStatus(`Count in: ${4-i}. Keep Ādi tāla with your hand.`);
        else{const target=i-4;root.querySelectorAll('.challenge-phrase span').forEach((el,n)=>el.classList.toggle('current',n===target));setStatus(i===8?'Land on Sa now — the first beat of the next cycle!':`Sing ${name(sequence[target])} on beat ${i+1}.`);}
      }
      await wait(start+9*beat-performance.now(),signal);
    }finally{clearInterval(sampleTimer);sampleTimer=null;sound.releaseMic();}
    const result=scorePitch(samples,sequence,perNote,settings().base,pitchTolerance(),notes());
    const saTime=4*perNote,saHz=swaraHz(settings().base,0,notes());
    const landingFrame=samples.find(sample=>sample.hz&&sample.t>=saTime-.35&&sample.t<saTime+.5&&Math.abs(centsBetween(sample.hz,saHz))<=pitchTolerance());
    const error=landingFrame?Math.round((landingFrame.t-saTime)*1000):null;
    const onTime=error!==null&&Math.abs(error)<=300;
    const pass=result.pass&&onTime;
    finish(pass,pass?'You landed on Sa with the tala.':onTime?'Your timing found the first beat; work on the pitch shape.':'Keep the hand count steady and aim for Sa on one.',`Pitch: ${result.accuracy}% near the named swaras. Timing: ${error===null?'Sa was not heard near the first beat':`${Math.abs(error)} ms ${error<0?'early':'late'} on Sa`}.`);
  }
  function finish(pass,title,body){
    phase='result';clearAudio();$('challenge-tap').hidden=true;$('challenge-options').innerHTML='';
    if(pass){wins[game]=(wins[game]||0)+1;remember();root.querySelector(`[data-score="${game}"]`).textContent=`${wins[game]} ✓`;}
    updateFeedback(title,body,pass);setPrimary('New round');setSecondary('Try same round');setStatus(pass?'A good step forward. Try a new round when ready.':'Take another try at the same pattern.');
  }
  function onClick(event){
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    if(button.dataset.game){reset();game=button.dataset.game;render();return;}
    if(button.id==='challenge-raga-change'){onSettings();return;}
    if(button.dataset.answer!==undefined){answerDetective(Number(button.dataset.answer));return;}
    if(button.dataset.position!==undefined){answerImpostor(Number(button.dataset.position));return;}
    if(button.id==='challenge-tap'){if(phase==='blackout'&&round.cycle===1||phase==='echo'&&round.yourTurn)tapTimes.push(performance.now());return;}
    if(button.id==='challenge-primary'){
      if(active()){reset();return;}
      if(phase==='answer'){start(true);return;}
      if(phase==='sing_ready'){const targets=game==='detective'?[round.target]:round.sequence;const signal=controller?.signal;if(game==='ladder')setDisplay('<div class="challenge-mystery">? · ?'+(round.sequence.length===3?' · ?':'')+'</div>');if(signal)singChallenge(signal,targets,game==='detective').catch(handleError);return;}
      start(false);return;
    }
    if(button.id==='challenge-secondary'){
      if(phase==='sing_ready'&&game==='ladder'){setDisplay(`<div class="challenge-mystery">${round.sequence.map(name).join(' · ')}</div>`);setStatus('Look once more. The names will hide again in three seconds.');button.disabled=true;const timer=setTimeout(()=>{if(phase==='sing_ready'&&game==='ladder'){setDisplay('<div class="challenge-mystery">? · ?'+(round.sequence.length===3?' · ?':'')+'</div>');setStatus(`Sing each swara for ${settings().response} seconds.`);}button.disabled=false;},3000);timers.push(timer);return;}
      start(phase==='result');
    }
  }
  function handleError(error){if(error.name==='AbortError')return;stop();setPrimary('Try again');setStatus(error.name==='NotAllowedError'?'Microphone access was declined. Allow it in your browser settings to sing.':error.message||'The microphone could not start.');}
  shell();
  return {stop,render,reset};
}
