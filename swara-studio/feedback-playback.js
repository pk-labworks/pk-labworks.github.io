export function playbackButtons(answerLabel='Play what you sang',available=true){
  return `<div class="feedback-playback"><button type="button" class="secondary-button" data-play-requested>Play asked notes</button><button type="button" class="secondary-button" data-play-answer ${available?'':'disabled'}>${answerLabel}</button></div>`;
}

export function attachFeedbackPlayback(container,{sound,playRequested,playAnswer,recording,onError}){
  const requested=container.querySelector('[data-play-requested]');
  const answer=container.querySelector('[data-play-answer]');
  let active=null,audio=null,timer=0,generation=0;
  const stop=()=>{
    generation++;
    clearTimeout(timer);
    if(audio){audio.pause();audio.currentTime=0;audio=null;}
    sound.stopNotes();
    if(active){active.textContent=active.dataset.label;active=null;}
  };
  async function play(button,sequence){
    if(active===button){stop();return;}
    stop();active=button;button.dataset.label=button.textContent;button.textContent='Stop';
    const current=generation;
    try{
      if(sequence){
        await sound.unlock();
        if(current!==generation)return;
        const seconds=sequence();
        timer=setTimeout(()=>{if(current===generation)stop();},Math.max(0,seconds)*1000+150);
      }else{
        audio=new Audio(recording);
        audio.onended=()=>{if(current===generation)stop();};
        await audio.play();
      }
    }catch{
      if(current===generation){stop();onError?.();}
    }
  }
  requested.onclick=()=>play(requested,playRequested);
  answer.onclick=()=>play(answer,playAnswer||null);
  return stop;
}
