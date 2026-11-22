import {RAGAS,midiHz,noteName,median} from './music.js?v=20261122-7';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-7';

export function createGettingStarted({sound,getSettings,onSelection,onSound,onDone}){
  const host=document.getElementById('getting-started-view');
  let active=null,message='';
  const noteLabel=note=>note.offset===12?'Upper Sa':note.name+note.variant.slice(1);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function render(){
    const settings=getSettings(),notes=RAGAS[settings.raga].notes;
    const recorded=notes.filter(note=>sound.hasVoiceNote(settings.base+note.offset,note.variant)).length;
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">GETTING STARTED</p><h1>Find your starting sound.</h1></div>
      <div class="start-intro">Find a comfortable Sa, then choose your own voice or piano for practice.</div>
      <button class="text-button start-skip-top" type="button" data-skip ${active?'disabled':''}>Skip recordings and use piano <span aria-hidden="true">→</span></button>
      <div class="start-grid">
        <section class="start-card"><span class="start-number">01</span><h2>Find a comfortable Sa</h2><p>Sing “aaaa” at an easy pitch for three seconds. We’ll set the closest base shruthi as your starting Sa. You can change it anytime.</p>
          <button class="primary-button" type="button" data-find-pitch ${active?'disabled':''}>Sing “aaaa” <span aria-hidden="true">→</span></button>
          <div class="start-selects">${selectionFields('start',settings)}</div>
        </section>
        <section class="start-card"><span class="start-number">02</span><h2>Make exercises with your voice</h2><p>Record the swaras of ${RAGAS[settings.raga].name} at your chosen Sa. Hear a guide note, then sing and hold that note for four seconds. Your recordings are used at their original pitch.</p>
          <p class="start-count">${recorded} of ${notes.length} notes recorded for this shruthi and raga</p>
          <div class="start-notes">${notes.map(note=>{const midi=settings.base+note.offset,has=sound.hasVoiceNote(midi,note.variant);return `<div class="start-note"><span><strong>${noteLabel(note)}</strong><small>${noteName(midi)}${has?' · Recorded':''}</small></span><button class="secondary-button" type="button" data-hear="${midi}" ${active?'disabled':''}>Hear</button><button class="secondary-button" type="button" data-record="${midi}" ${active?'disabled':''}>${has?'Re-record':'Record'}</button></div>`;}).join('')}</div>
          <div class="start-sound-choice" role="group" aria-label="Exercise sound"><span>Exercise sound</span><button type="button" data-sound="piano" aria-pressed="${settings.sound==='piano'}" ${active?'disabled':''}>Piano</button><button type="button" data-sound="voice" aria-pressed="${settings.sound==='voice'}" ${active?'disabled':''}>My recordings</button></div>
          <p class="start-private">Recordings stay in this browser on this device. Piano plays any note you haven’t recorded. You can skip recording and use piano for every exercise.</p>
        </section>
        <section class="start-card start-purpose"><span class="start-number">03</span><h2>Listen, sense, recall</h2><p>Practice Sarali Varasai to learn the patterns. Use Sense to name the notes you hear. Use Recall to sing a named note after hearing only Sa. Together, these skills sharpen pitch accuracy.</p></section>
      </div>
      <p id="getting-status" class="start-status" role="status"></p>
      ${active?'<button class="secondary-button" type="button" data-cancel>Cancel recording</button>':''}
      <div class="start-actions"><button class="primary-button" type="button" data-start-practice ${active?'disabled':''}>Start practicing <span aria-hidden="true">→</span></button><button class="secondary-button" type="button" data-skip ${active?'disabled':''}>Skip recordings and use piano</button></div>`;
    host.querySelector('#getting-status').textContent=message;
  }

  function stop(){
    active?.controller.abort();active=null;
    sound.finishRecording();sound.releaseMic();sound.stopNotes();
  }

  async function listen(kind,midi){
    if(active)return;
    const task={controller:new AbortController()};active=task;message='';render();
    try{
      await sound.unlock();
      await sound.microphone(task.controller.signal);
      if(active!==task)return;
      sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;
      const wave=new Float32Array(4096),heard=[];
      if(kind==='note'){
        sound.startRecording();
        if(sound.recorder?.state!=='recording')throw new Error('This browser cannot record audio. You can still practice with piano.');
      }
      const seconds=kind==='note'?4:3,start=performance.now();
      while(performance.now()-start<seconds*1000){
        if(task.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
        sound.analyser.getFloatTimeDomainData(wave);
        const hz=detectLivePitch(wave,sound.ctx.sampleRate);
        if(hz&&hz>=60&&hz<=1100)heard.push(69+12*Math.log2(hz/440));
        const left=Math.max(1,Math.ceil(seconds-(performance.now()-start)/1000));
        const note=kind==='note'?RAGAS[getSettings().raga].notes.find(item=>getSettings().base+item.offset===midi):null;
        const status=host.querySelector('#getting-status');if(status)status.textContent=`Keep singing “${note?noteLabel(note):'aaaa'}” · ${left}s`;
        await wait(70);
      }
      if(kind==='note')await sound.finishRecording();
      if(heard.length<10)throw new Error('We could not hear a steady pitch. Move closer to the microphone and try again.');
      const sung=median(heard);
      if(kind==='pitch'){
        const closest=SHRUTHIS.reduce((best,value)=>Math.abs(value-sung)<Math.abs(best-sung)?value:best,SHRUTHIS[0]);
        active=null;sound.releaseMic();
        onSelection({base:closest,raga:getSettings().raga});
        message=`Your comfortable pitch was near ${noteName(Math.round(sung))}. Base shruthi is now ${noteName(closest)}. You can change it below or in settings.`;
      }else{
        if(Math.abs(sung-midi)>.7)throw new Error(`That sounded closer to ${noteName(Math.round(sung))}. Hear ${noteName(midi)} and record this swara again.`);
        const blob=new Blob(sound.chunks,{type:sound.recorder.mimeType});
        if(!blob.size)throw new Error('The recording was empty. Please try again.');
        const note=RAGAS[getSettings().raga].notes.find(item=>getSettings().base+item.offset===midi);
        await sound.saveVoiceNote(midi,note.variant,blob);
        active=null;sound.releaseMic();
        onSound('voice');
        message=`Recorded ${noteName(midi)}. Your voice will play for this note in exercises.`;
      }
    }catch(error){if(error.name!=='AbortError')message=error.message||'Recording could not finish. Try again.';}
    finally{if(active===task){active=null;await sound.finishRecording();sound.releaseMic();}render();}
  }

  host.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-cancel]')){stop();message='Recording cancelled.';render();return;}
    if(active)return;
    if(button.matches('[data-find-pitch]')){listen('pitch');return;}
    if(button.matches('[data-record]')){listen('note',Number(button.dataset.record));return;}
    if(button.matches('[data-hear]')){sound.unlock().then(()=>{sound.stopNotes();sound.tone(midiHz(Number(button.dataset.hear)),1.5);});return;}
    if(button.matches('[data-sound]')){onSound(button.dataset.sound);return;}
    if(button.matches('[data-skip]')){onSound('piano');onDone();return;}
    if(button.matches('[data-start-practice]'))onDone();
  });
  host.addEventListener('change',event=>{
    if(active||!event.target.matches('#start-base,#start-raga'))return;
    sound.stopNotes();
    onSelection({base:Number(host.querySelector('#start-base').value),raga:host.querySelector('#start-raga').value});
  });
  render();
  return {render,stop};
}
