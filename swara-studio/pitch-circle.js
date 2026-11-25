import {centsBetween} from './music.js?v=20261125-5';

const circle=(host,prefix)=>host.querySelector(`#${prefix}-pitch-circle`);

export function pitchCircleMarkup(prefix){
  return `<div id="${prefix}-pitch-circle" class="pitch-feedback-circle" role="progressbar" aria-label="Pitch feedback for the current swara" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="No singing detected"><div class="pitch-fill-segments" aria-hidden="true"></div><span class="pitch-circle-label" aria-hidden="true">—</span></div>`;
}

export function resetPitchCircle(host,prefix){
  const el=circle(host,prefix);
  if(!el)return;
  el.dataset.noteKey='';
  el.dataset.elapsed='0';
  el.dataset.pitch='idle';
  el.querySelector('.pitch-fill-segments').replaceChildren();
  el.querySelector('.pitch-circle-label').textContent='—';
  el.setAttribute('aria-valuenow','0');
  el.setAttribute('aria-valuetext','No singing detected');
}

export function setPitchCircleNote(host,prefix,noteKey){
  const el=circle(host,prefix);
  if(!el||el.dataset.noteKey===String(noteKey))return;
  resetPitchCircle(host,prefix);
  el.dataset.noteKey=String(noteKey);
}

export function updatePitchCircle(host,prefix,{noteKey,frequency,targetHz,sampleMs,durationMs,tolerance}){
  const el=circle(host,prefix);
  if(!el||!Number.isFinite(targetHz)||targetHz<=0)return;
  setPitchCircleNote(host,prefix,noteKey);
  const cents=centsBetween(frequency,targetHz);
  const pitch=Math.abs(cents)<=tolerance?'correct':cents>0?'sharp':'flat';
  const previous=Number(el.dataset.elapsed)||0;
  const elapsed=Math.min(durationMs,previous+Math.max(0,Math.min(sampleMs,100)));
  el.dataset.elapsed=String(elapsed);
  const bottom=100*previous/durationMs,height=100*(elapsed-previous)/durationMs;
  if(height>0){
    const band=document.createElement('i');
    band.dataset.pitch=pitch;
    band.style.bottom=`${bottom}%`;
    band.style.height=`${height}%`;
    el.querySelector('.pitch-fill-segments').appendChild(band);
  }
  const label=pitch==='correct'?'In tune':pitch==='sharp'?'Sharp':'Flat';
  const percent=Math.round(100*elapsed/durationMs);
  el.dataset.pitch=pitch;
  el.querySelector('.pitch-circle-label').textContent=label;
  el.setAttribute('aria-valuenow',String(percent));
  el.setAttribute('aria-valuetext',`${percent}% filled · ${label}`);
  return {cents,pitch,label};
}

export function noteWindows(beats,targetFor){
  const windows=[];
  let start=0,targetHz=null;
  beats.forEach((beat,index)=>{
    if(index===0||!beat.hold){start=index;targetHz=targetFor(beat);}
    windows.push({start,targetHz});
  });
  windows.forEach(window=>{
    let end=window.start+1;
    while(end<beats.length&&windows[end].start===window.start)end++;
    window.beats=end-window.start;
  });
  return windows;
}
