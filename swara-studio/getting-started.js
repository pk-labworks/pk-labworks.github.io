import {SPOKEN_SWARAS,noteName,median} from './music.js?v=20261122-8';
import {detectLivePitch} from './swara-live-core.js?v=20261121-1';
import {selectionFields,SHRUTHIS} from './selection.js?v=20261122-8';

export function createGettingStarted({sound,getSettings,onSelection,onSound,onDone}){
  const host=document.getElementById('getting-started-view');
  let active=null,pitchMessage='',voiceFeedback=null;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function render(){
    const settings=getSettings();
    const recorded=SPOKEN_SWARAS.filter(syllable=>sound.hasVoiceNote(syllable)).length;
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">GETTING STARTED</p><h1>Find your starting sound.</h1></div>
      <div class="start-intro">Find a comfortable Sa, then choose your own voice or piano for practice.</div>
      <button class="text-button start-skip-top" type="button" data-skip ${active?'disabled':''}>Skip recordings and use piano <span aria-hidden="true">→</span></button>
      <div class="start-grid">
        <section class="start-card"><span class="start-number">01</span><h2>Find a comfortable Sa</h2><p>Make an easy “aaaa” sound for three seconds at a comfortable pitch. You do not need to know how to sing a note. We’ll use it to suggest your starting Sa, which you can change anytime.</p>
          <button class="primary-button" type="button" ${active?.kind==='pitch'?'data-cancel':`data-find-pitch ${active?'disabled':''}`}>${active?.kind==='pitch'?'Cancel recording':'Make an “aaaa” sound'} <span aria-hidden="true">${active?.kind==='pitch'?'■':'→'}</span></button>
          <p id="pitch-status" class="start-action-status" role="status"></p>
          <div class="start-selects">${selectionFields('start',settings)}</div>
        </section>
        <section class="start-card"><span class="start-number">02</span><h2>Make exercises with your voice</h2><p>Say each swara in your normal speaking voice. Draw out the vowel for about a second, as in “Saa.” You do not need to sing. The app tunes each recording to the exercise notes.</p>
          <p class="start-count">${recorded} of 7 spoken swaras recorded</p>
          <div class="start-notes">${SPOKEN_SWARAS.map(syllable=>{
            const isRecording=active?.kind==='voice'&&active.syllable===syllable;
            const has=sound.hasVoiceNote(syllable);
            return `<div class="start-note-wrap"><div class="start-note"><span><strong>${syllable}</strong><small>${has?'Recorded':'Ready to record'}</small></span><button class="secondary-button" type="button" ${isRecording?'data-cancel':`data-record="${syllable}" ${active?'disabled':''}`}>${isRecording?'Cancel recording':has?'Re-record':'Record'}</button></div>${isRecording||voiceFeedback?.syllable===syllable?`<p class="start-note-feedback" data-voice-status="${syllable}" role="status"></p>`:''}</div>`;
          }).join('')}</div>
          <div class="start-sound-choice" role="group" aria-label="Exercise sound"><span>Exercise sound</span><button type="button" data-sound="piano" aria-pressed="${settings.sound==='piano'}" ${active?'disabled':''}>Piano</button><button type="button" data-sound="voice" aria-pressed="${settings.sound==='voice'}" ${active?'disabled':''}>My recordings</button></div>
          <p class="start-private">Recordings stay in this browser on this device. Piano plays any swara you have not recorded. You can skip recording and use piano for every exercise.</p>
        </section>
        <section class="start-card start-purpose"><span class="start-number">03</span><h2>Listen, sense, recall</h2><p>Practice Sarali Varasai to learn the patterns. Use Sense to name the notes you hear. Use Recall to sing a named note after hearing only Sa. Together, these skills sharpen pitch accuracy.</p></section>
      </div>
      <div class="start-actions"><button class="primary-button" type="button" data-start-practice ${active?'disabled':''}>Start practicing <span aria-hidden="true">→</span></button><button class="secondary-button" type="button" data-skip ${active?'disabled':''}>Skip recordings and use piano</button></div>`;
    host.querySelector('#pitch-status').textContent=pitchMessage;
    if(voiceFeedback)host.querySelector(`[data-voice-status="${voiceFeedback.syllable}"]`)?.replaceChildren(document.createTextNode(voiceFeedback.text));
  }

  function stop(){
    active?.controller.abort();active=null;
    sound.finishRecording();sound.releaseMic();sound.stopNotes();
  }

  function status(task,text){
    const selector=task.kind==='pitch'?'#pitch-status':`[data-voice-status="${task.syllable}"]`;
    const target=host.querySelector(selector);if(target)target.textContent=text;
  }

  async function listen(kind,syllable){
    if(active)return;
    const task={kind,syllable,controller:new AbortController()};active=task;
    if(kind==='pitch')pitchMessage='Connecting to microphone…';
    else voiceFeedback={syllable,text:'Connecting to microphone…'};
    render();
    try{
      await sound.unlock();
      await sound.microphone(task.controller.signal);
      if(active!==task)return;
      sound.analyser.fftSize=4096;sound.analyser.smoothingTimeConstant=0;
      const wave=new Float32Array(4096),heard=[];
      if(kind==='voice'){
        status(task,`Get ready to say ${syllable}…`);
        await wait(500);
        if(task.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
        sound.startRecording();
        if(sound.recorder?.state!=='recording')throw new Error('This browser cannot record audio. You can still practice with piano.');
      }
      const seconds=kind==='voice'?2.5:3,start=performance.now();
      while(performance.now()-start<seconds*1000){
        if(task.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
        sound.analyser.getFloatTimeDomainData(wave);
        const hz=detectLivePitch(wave,sound.ctx.sampleRate);
        if(hz&&hz>=60&&hz<=1100)heard.push({hz,time:(performance.now()-start)/1000});
        const left=Math.max(1,Math.ceil(seconds-(performance.now()-start)/1000));
        status(task,kind==='voice'?`Say “${syllable}” now · ${left}s`:`Keep making “aaaa” · ${left}s`);
        await wait(70);
      }
      if(kind==='voice')await sound.finishRecording();
      if(heard.length<(kind==='voice'?3:10))throw new Error(kind==='voice'?'We could not hear a voiced syllable. Say it again and stretch the vowel for about a second.':'We could not hear a steady pitch. Move closer to the microphone and try again.');
      const sourceHz=median(heard.map(item=>item.hz));
      if(kind==='pitch'){
        const sung=69+12*Math.log2(sourceHz/440);
        const closest=SHRUTHIS.reduce((best,value)=>Math.abs(value-sung)<Math.abs(best-sung)?value:best,SHRUTHIS[0]);
        active=null;sound.releaseMic();
        onSelection({base:closest,raga:getSettings().raga});
        pitchMessage=`Your comfortable pitch was near ${noteName(Math.round(sung))}. Base shruthi is now ${noteName(closest)}. You can change it below or in settings.`;
      }else{
        const blob=new Blob(sound.chunks,{type:sound.recorder.mimeType});
        if(!blob.size)throw new Error('The recording was empty. Please say the swara again.');
        await sound.saveVoiceNote(syllable,blob,sourceHz,{start:heard[0].time,end:heard.at(-1).time});
        active=null;sound.releaseMic();
        voiceFeedback={syllable,text:`Recorded ${syllable}. Your spoken voice will play at the exercise pitch.`};
        onSound('voice');
      }
    }catch(error){
      if(error.name!=='AbortError'){
        if(kind==='pitch')pitchMessage=error.message||'Pitch check could not finish. Try again.';
        else voiceFeedback={syllable,text:error.message||'Recording could not finish. Try again.'};
      }
    }finally{
      if(active===task){active=null;await sound.finishRecording();sound.releaseMic();}
      render();
    }
  }

  host.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-cancel]')){
      const task=active;stop();
      if(task?.kind==='pitch')pitchMessage='Pitch check cancelled.';
      else if(task?.kind==='voice')voiceFeedback={syllable:task.syllable,text:'Recording cancelled.'};
      render();return;
    }
    if(active)return;
    if(button.matches('[data-find-pitch]')){listen('pitch');return;}
    if(button.matches('[data-record]')){listen('voice',button.dataset.record);return;}
    if(button.matches('[data-sound]')){onSound(button.dataset.sound);return;}
    if(button.matches('[data-skip]')){onSound('piano');onDone();return;}
    if(button.matches('[data-start-practice]'))onDone();
  });
  host.addEventListener('change',event=>{
    if(active||!event.target.matches('#start-base,#start-raga'))return;
    onSelection({base:Number(host.querySelector('#start-base').value),raga:host.querySelector('#start-raga').value});
  });
  render();
  return {render,stop};
}
