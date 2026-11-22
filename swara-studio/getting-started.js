import {noteName,median} from './music.js?v=20261122-9';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-8';

export function createGettingStarted({sound,getSettings,onSelection,onSound,onDone}){
  const host=document.getElementById('getting-started-view');
  let active=null,pitchMessage='',voiceMessage='';
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function render(){
    const settings=getSettings();
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">GETTING STARTED</p><h1>Find your starting sound.</h1></div>
      <div class="start-intro">Find a comfortable Sa, then choose your own “aaa” voice or piano for practice.</div>
      <button class="text-button start-skip-top" type="button" data-skip ${active?'disabled':''}>Use piano for now <span aria-hidden="true">→</span></button>
      <div class="start-grid">
        <section class="start-card"><span class="start-number">01</span><h2>Find a comfortable Sa</h2><p>Make an easy “aaaa” sound for three seconds at a comfortable pitch. You do not need to know how to sing a note. We’ll use it to suggest your starting Sa, which you can change anytime.</p>
          <button class="primary-button" type="button" ${active?'data-cancel':'data-find-pitch'}>${active?'Cancel recording':'Make an “aaaa” sound'} <span aria-hidden="true">${active?'■':'→'}</span></button>
          <p id="pitch-status" class="start-action-status" role="status"></p>
          <div class="start-selects">${selectionFields('start',settings)}</div>
        </section>
        <section class="start-card"><span class="start-number">02</span><h2>Hear exercises in your voice</h2><p>Load the notes made from your sustained “aaa” recording. The same vowel plays at every practice pitch, without spoken swara names.</p>
          <button class="secondary-button" type="button" data-import ${active?'disabled':''}>Choose my “aaa” notes</button><input id="start-voice-file" type="file" accept=".wav,audio/wav" hidden>
          <p id="voice-status" class="start-action-status" role="status"></p>
          <div class="start-sound-choice" role="group" aria-label="Exercise sound"><span>Exercise sound</span><button type="button" data-sound="piano" aria-pressed="${settings.sound==='piano'}" ${active?'disabled':''}>Piano</button><button type="button" data-sound="voice" aria-pressed="${settings.sound==='voice'}" ${active?'disabled':''}>My “aaa” voice</button></div>
          <p class="start-private">${sound.hasVoiceBank()?'Your “aaa” notes are ready on this device.':'Piano is ready. To use your voice, choose the private notes file.'} Your voice file stays in this browser and is never uploaded.</p>
        </section>
        <section class="start-card start-purpose"><span class="start-number">03</span><h2>Listen, sense, recall</h2><p>Practice Sarali Varasai to learn the patterns. Use Sense to name the notes you hear. Use Recall to sing a named note after hearing only Sa. Together, these skills sharpen pitch accuracy.</p></section>
      </div>
      <div class="start-actions"><button class="primary-button" type="button" data-start-practice ${active?'disabled':''}>Start practicing <span aria-hidden="true">→</span></button><button class="secondary-button" type="button" data-skip ${active?'disabled':''}>Use piano for now</button></div>`;
    host.querySelector('#pitch-status').textContent=pitchMessage;
    host.querySelector('#voice-status').textContent=voiceMessage;
  }
  function stop(){active?.controller.abort();active=null;sound.releaseMic();sound.stopNotes();}
  async function findPitch(){
    if(active)return;
    const task={controller:new AbortController()};active=task;pitchMessage='Connecting to microphone…';render();
    try{
      await sound.unlock();await sound.microphone(task.controller.signal);
      if(active!==task)return;
      sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;
      const wave=new Float32Array(4096),heard=[],start=performance.now();
      while(performance.now()-start<3000){
        if(task.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
        sound.analyser.getFloatTimeDomainData(wave);
        const hz=detectLivePitch(wave,sound.ctx.sampleRate);
        if(hz&&hz>=60&&hz<=1100)heard.push(hz);
        host.querySelector('#pitch-status').textContent=`Keep making “aaaa” · ${Math.max(1,Math.ceil(3-(performance.now()-start)/1000))}s`;
        await wait(70);
      }
      if(heard.length<10)throw new Error('We could not hear a steady pitch. Move closer to the microphone and try again.');
      const sung=69+12*Math.log2(median(heard)/440);
      const closest=SHRUTHIS.reduce((best,value)=>Math.abs(value-sung)<Math.abs(best-sung)?value:best,SHRUTHIS[0]);
      active=null;sound.releaseMic();onSelection({base:closest,raga:getSettings().raga});
      pitchMessage=`Your comfortable pitch was near ${noteName(Math.round(sung))}. Base shruthi is now ${noteName(closest)}. You can change it below or in settings.`;
    }catch(error){if(error.name!=='AbortError')pitchMessage=error.message||'Pitch check could not finish. Try again.';}
    finally{if(active===task){active=null;sound.releaseMic();}render();}
  }
  host.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-cancel]')){stop();pitchMessage='Pitch check cancelled.';render();return;}
    if(active)return;
    if(button.matches('[data-find-pitch]')){findPitch();return;}
    if(button.matches('[data-import]')){host.querySelector('#start-voice-file').click();return;}
    if(button.matches('[data-sound]')){onSound(button.dataset.sound);voiceMessage=button.dataset.sound==='voice'&&!sound.hasVoiceBank()?'Choose your “aaa” notes file first. Piano will play until then.':'';render();return;}
    if(button.matches('[data-skip]')){onSound('piano');onDone();return;}
    if(button.matches('[data-start-practice]'))onDone();
  });
  host.addEventListener('change',async event=>{
    if(event.target.matches('#start-voice-file')){
      const file=event.target.files[0];if(!file)return;
      voiceMessage='Loading your “aaa” notes…';render();
      try{const saved=await sound.importVoiceBank(file);onSound('voice');voiceMessage=saved?'Your “aaa” notes are ready.':'Your “aaa” notes are ready for this tab. Browser storage is unavailable.';}
      catch(error){voiceMessage=error.message||'Could not load the voice notes.';}
      render();return;
    }
    if(active||!event.target.matches('#start-base,#start-raga'))return;
    onSelection({base:Number(host.querySelector('#start-base').value),raga:host.querySelector('#start-raga').value});
  });
  render();
  return {render,stop};
}
