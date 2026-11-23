import {livePitchReading} from './swara-live-core.js?v=20261121-1';

const part=(host,prefix,name)=>host.querySelector(`#${prefix}-live-${name}`);

export function liveReadoutMarkup(prefix){
  return `<section class="swara-live-readout line-live-readout" aria-label="Current sung pitch"><div class="swara-live-note-row"><div><strong id="${prefix}-live-note" class="line-live-note" aria-live="polite">—</strong><span id="${prefix}-live-name" class="line-live-name">Your note will appear here</span></div><div class="swara-live-western"><strong id="${prefix}-live-western" class="line-live-western">—</strong><span id="${prefix}-live-hz" class="line-live-hz">— Hz</span></div></div><div class="swara-live-tuning"><span>FLAT</span><div class="swara-live-tuning-track"><i></i><i id="${prefix}-live-dot"></i></div><span>SHARP</span></div><p id="${prefix}-live-cents" class="line-live-cents">Sing to see your tuning</p></section>`;
}

export function clearLiveReadout(host,prefix){
  if(!part(host,prefix,'note'))return;
  part(host,prefix,'note').textContent='—';
  part(host,prefix,'name').textContent='Your note will appear here';
  part(host,prefix,'western').textContent='—';
  part(host,prefix,'hz').textContent='— Hz';
  part(host,prefix,'cents').textContent='Sing to see your tuning';
  part(host,prefix,'dot').style.left='50%';
}

export function showLiveReadout(host,prefix,frequency,base,previousMidi){
  const reading=livePitchReading(frequency,base,previousMidi);
  part(host,prefix,'note').textContent=reading.swara;
  part(host,prefix,'name').textContent=reading.fullName;
  part(host,prefix,'western').textContent=reading.western;
  part(host,prefix,'hz').textContent=`${frequency.toFixed(1)} Hz`;
  part(host,prefix,'cents').textContent=reading.tuning;
  part(host,prefix,'dot').style.left=`${reading.tuningPosition}%`;
  return reading.midi;
}
