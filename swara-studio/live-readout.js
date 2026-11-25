import {livePitchReading} from './swara-live-core.js?v=20261121-1';
import {midiHz} from './music.js?v=20261125-5';
import {pitchCircleMarkup,resetPitchCircle,updatePitchCircle} from './pitch-circle.js?v=20261125-1';

const part=(host,prefix,name)=>host.querySelector(`#${prefix}-live-${name}`);

export function liveReadoutMarkup(prefix){
  return `<section class="swara-live-readout line-live-readout" aria-label="Current sung pitch"><div class="swara-live-note-row"><div><strong id="${prefix}-live-note" class="line-live-note" aria-live="polite">—</strong><span id="${prefix}-live-name" class="line-live-name">Your note will appear here</span></div><div class="swara-live-western"><strong id="${prefix}-live-western" class="line-live-western">—</strong><span id="${prefix}-live-hz" class="line-live-hz">— Hz</span></div></div>${pitchCircleMarkup(prefix)}<p id="${prefix}-live-cents" class="line-live-cents">Sing to see your tuning</p></section>`;
}

export function clearLiveReadout(host,prefix,{preserveCircle=false}={}){
  if(!part(host,prefix,'note'))return;
  part(host,prefix,'note').textContent='—';
  part(host,prefix,'name').textContent='Your note will appear here';
  part(host,prefix,'western').textContent='—';
  part(host,prefix,'hz').textContent='— Hz';
  part(host,prefix,'cents').textContent='Sing to see your tuning';
  if(!preserveCircle)resetPitchCircle(host,prefix);
}

export function showLiveReadout(host,prefix,frequency,base,previousMidi,feedback={}){
  const reading=livePitchReading(frequency,base,previousMidi);
  part(host,prefix,'note').textContent=reading.swara;
  part(host,prefix,'name').textContent=reading.fullName;
  part(host,prefix,'western').textContent=reading.western;
  part(host,prefix,'hz').textContent=`${frequency.toFixed(1)} Hz`;
  const targetHz=feedback.targetHz||midiHz(reading.midi);
  const tuning=updatePitchCircle(host,prefix,{noteKey:feedback.noteKey??reading.midi,frequency,targetHz,sampleMs:feedback.sampleMs??60,durationMs:feedback.durationMs??3000,tolerance:feedback.tolerance??35});
  part(host,prefix,'cents').textContent=feedback.targetHz?(tuning.pitch==='correct'?'In tune with target':`${Math.abs(Math.round(tuning.cents))} cents ${tuning.cents>0?'sharp':'flat'} of target`):reading.tuning;
  return reading.midi;
}
