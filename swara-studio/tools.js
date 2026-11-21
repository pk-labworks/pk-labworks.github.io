import {RAGAS,PITCH_POSITION_LABELS,midiHz,noteName} from './music.js?v=20261116-13';

export function createTools({sound,getSettings,getNotes,onSettings}){
  const host=document.getElementById('tools-view');
  let mode='see',selectedOffset=0,playingOffset=null,timer=null,requestId=0;
  const blackPitchClasses=new Set([1,3,6,8,10]);
  const isBlack=midi=>blackPitchClasses.has(((midi%12)+12)%12);
  const position=offset=>((offset%12)+12)%12;
  const ragaNote=offset=>getNotes().find(note=>note.offset===position(offset));
  const label=offset=>{
    if(offset===12)return 'Upper Sa';
    const note=ragaNote(offset);
    return note?note.name+note.variant.slice(1):PITCH_POSITION_LABELS[position(offset)];
  };
  const register=offset=>offset<0?'Lower octave':offset>=12?'Higher octave':'Middle octave';
  const detail=offset=>{
    const midi=getSettings().base+offset;
    const name=offset===12?'Upper Sa':ragaNote(offset)?.name||PITCH_POSITION_LABELS[position(offset)];
    return `<div class="tool-detail"><span class="label">SELECTED PITCH</span><strong>${name}</strong><span>${label(offset)} · ${register(offset)} · ${noteName(midi)} · ${midiHz(midi).toFixed(2)} Hz</span></div>`;
  };
  function stop(){
    requestId++;
    clearTimeout(timer);timer=null;
    if(playingOffset!==null)sound.stopNotes();
    playingOffset=null;
    host.querySelectorAll('.piano-key.playing').forEach(key=>key.classList.remove('playing'));
    const button=host.querySelector('#tool-stop');
    if(button)button.disabled=true;
  }
  function ladder(){
    return `<div class="tool-surface"><div class="tool-surface-heading"><div><h2>See the swara</h2><p>Choose a pitch to see its place above your Sa. Notes in ${RAGAS[getSettings().raga].name} are highlighted.</p></div><button class="secondary-button" id="tool-settings">Change shruthi or raga</button></div><div class="ladder-layout"><div class="pitch-ladder" aria-label="Twelve pitch positions from Sa to Upper Sa">${Array.from({length:13},(_,i)=>12-i).map(offset=>{
      const inRaga=offset===12||!!ragaNote(offset);
      const midi=getSettings().base+offset;
      return `<button type="button" class="ladder-row${inRaga?' in-raga':''}${selectedOffset===offset?' selected':''}" data-ladder="${offset}" aria-pressed="${selectedOffset===offset}" aria-label="${offset===12?'Upper Sa':PITCH_POSITION_LABELS[position(offset)]}, ${noteName(midi)}"><span class="ladder-position">${String(offset).padStart(2,'0')}</span><span class="ladder-line"></span><strong>${offset===12?'Upper Sa':PITCH_POSITION_LABELS[position(offset)]}</strong><small>${noteName(midi)}</small></button>`;
    }).join('')}</div><div class="ladder-side">${detail(selectedOffset)}<p>Each line is one semitone. The filled markers show swaras in your selected raga; the other positions are visible for comparison.</p><div class="tool-key"><i></i> In this raga <span></span> Other pitch positions</div></div></div></div>`;
  }
  function piano(){
    const base=getSettings().base,whiteWidth=58,blackWidth=38;
    const offsets=Array.from({length:25},(_,i)=>i-5);
    const firstBlack=isBlack(base-5),lastBlack=isBlack(base+19);
    const lead=firstBlack?blackWidth/2:0,trail=lastBlack?blackWidth/2:0;
    let whites=0;
    const centers=new Map();
    const keys=offsets.map(offset=>{
      const black=isBlack(base+offset),left=black?lead+whites*whiteWidth-blackWidth/2:lead+whites*whiteWidth;
      centers.set(offset,left+(black?blackWidth:whiteWidth)/2);
      if(!black)whites++;
      const inRaga=offset===12||!!ragaNote(offset);
      const keyLabel=label(offset),midi=base+offset;
      return `<button type="button" class="piano-key ${black?'black':'white'}${inRaga?' in-raga':''}${selectedOffset===offset?' selected':''}${playingOffset===offset?' playing':''}" data-key="${offset}" style="left:${left}px" aria-label="Play ${offset===12?'Upper Sa':keyLabel} in the ${register(offset).toLowerCase()}, ${noteName(midi)}, ${midiHz(midi).toFixed(2)} hertz" aria-pressed="${playingOffset===offset}" title="${register(offset)} · ${keyLabel} · ${noteName(midi)}"><span>${offset===12?'Upper Sa':keyLabel}</span></button>`;
    }).join('');
    const width=lead+whites*whiteWidth+trail;
    const rangeLabels=[['Lower Pa → Sa',-5,0],['Sa → Upper Sa',0,12],['Upper Sa → Pa',12,19]].map(([name,start,end])=>`<span style="left:${(centers.get(start)+centers.get(end))/2}px">${name}</span>`).join('');
    return `<div class="tool-surface"><div class="tool-surface-heading"><div><h2>Play the swara</h2><p>Tap any key to hear it for ${getSettings().duration} seconds. Tap it again or use Stop to end the sound.</p></div><button class="secondary-button" id="tool-settings">Change shruthi or raga</button></div><div class="piano-scroll" role="group" aria-label="Piano from lower Pa through middle Sa to higher Pa"><div class="piano-registers" style="width:${width}px">${rangeLabels}</div><div class="piano" style="width:${width}px">${keys}</div></div><div class="piano-footer">${detail(selectedOffset)}<button class="secondary-button" id="tool-stop" ${playingOffset===null?'disabled':''}>Stop playing ■</button></div><p class="tool-caption">All twelve pitch positions are playable. Green keys belong to ${RAGAS[getSettings().raga].name}; your Sa is ${noteName(base)}. Playback time follows Practice settings.</p></div>`;
  }
  function render(){
    host.innerHTML=`<p class="eyebrow">SWARA TOOLS</p><h1 class="progress-intro">Explore every pitch.</h1><p class="page-description">See where a swara sits, then hear it on a keyboard set to your shruthi.</p><div class="tool-tabs" role="tablist" aria-label="Swara tools"><button role="tab" data-tool="see" aria-selected="${mode==='see'}">See the swara</button><button role="tab" data-tool="play" aria-selected="${mode==='play'}">Play the swara</button></div>${mode==='see'?ladder():piano()}`;
  }
  function reset(){stop();selectedOffset=0;if(!host.hidden)render();}
  async function play(offset){
    if(playingOffset===offset){stop();render();return;}
    stop();selectedOffset=offset;
    const token=++requestId;
    try{
      await sound.unlock();
      if(token!==requestId||host.hidden||mode!=='play')return;
      const duration=Number(getSettings().duration);
      sound.tone(midiHz(getSettings().base+offset),duration);
      playingOffset=offset;render();
      timer=setTimeout(()=>{if(token===requestId){playingOffset=null;render();}},duration*1000+150);
    }catch{playingOffset=null;render();}
  }
  host.addEventListener('click',event=>{
    const tab=event.target.closest('[data-tool]');
    if(tab){if(mode!==tab.dataset.tool){stop();mode=tab.dataset.tool;if(mode==='see'&&(selectedOffset<0||selectedOffset>12))selectedOffset=position(selectedOffset);render();}return;}
    if(event.target.closest('#tool-settings')){stop();onSettings();return;}
    if(event.target.closest('#tool-stop')){stop();render();return;}
    const row=event.target.closest('[data-ladder]');
    if(row){selectedOffset=Number(row.dataset.ladder);render();return;}
    const key=event.target.closest('[data-key]');
    if(key)play(Number(key.dataset.key));
  });
  return {render,stop,reset};
}
