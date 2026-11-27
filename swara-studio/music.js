const NOTE_TYPES={
  S:{name:'Sa',variant:'S',offset:0},R1:{name:'Ri',variant:'R₁',offset:1},R2:{name:'Ri',variant:'R₂',offset:2},
  G2:{name:'Ga',variant:'G₂',offset:3},G3:{name:'Ga',variant:'G₃',offset:4},
  M1:{name:'Ma',variant:'M₁',offset:5},M2:{name:'Ma',variant:'M₂',offset:6},P:{name:'Pa',variant:'P',offset:7},
  D1:{name:'Da',variant:'D₁',offset:8},D2:{name:'Da',variant:'D₂',offset:9},
  N2:{name:'Ni',variant:'N₂',offset:10},N3:{name:'Ni',variant:'N₃',offset:11},
  upperSa:{name:'Upper Sa',variant:'Ṡ',offset:12}
};
const makeRaga=(id,name,type,description,keys,source)=>({
  id,name,type,description,source,
  notes:[...keys.map(key=>NOTE_TYPES[key]),NOTE_TYPES.upperSa]
});
export const RAGA_LIST=[
  makeRaga('mayamalavagowla','Mayamalavagowla','15th melakarta','Ri₁ and Da₁ each sit one pitch position above Sa and Pa.',['S','R1','G3','M1','P','D1','N3'],'https://www.karnatik.com/c0775.shtml'),
  makeRaga('kalyani','Kalyani','65th melakarta','Its Ma₂ sits one pitch position above the Ma₁ used in Sankarabharanam.',['S','R2','G3','M2','P','D2','N3'],'https://www.karnatik.com/c90049.shtml'),
  makeRaga('sankarabharanam','Sankarabharanam','29th melakarta','Listen for Ma₁ and Ni₃; changing Ma₁ to Ma₂ gives Kalyani’s scale.',['S','R2','G3','M1','P','D2','N3'],'https://www.karnatik.com/c9091.shtml'),
  makeRaga('harikambhoji','Harikambhoji','28th melakarta','Ni₂ sits one pitch position below Sankarabharanam’s Ni₃.',['S','R2','G3','M1','P','D2','N2'],'https://www.karnatik.com/c27516.shtml'),
  makeRaga('kharaharapriya','Kharaharapriya','22nd melakarta','Ga₂ and Ni₂ distinguish this scale from the Ga₃ and Ni₃ of Sankarabharanam.',['S','R2','G2','M1','P','D2','N2'],'https://www.karnatik.com/c1834.shtml'),
  makeRaga('mohanam','Mohanam','Five-note janya raga','Its ascent and descent use Sa, Ri₂, Ga₃, Pa, and Da₂; Ma and Ni are omitted.',['S','R2','G3','P','D2'],'https://www.karnatik.com/c0408.shtml')
];
export const RAGAS=Object.fromEntries(RAGA_LIST.map(raga=>[raga.id,raga]));
export const DEFAULT_RAGA='mayamalavagowla';
export function practiceSwaras(raga){
  const middleAndUpperSa=raga.notes.map(note=>({...note,register:note.offset===12?'upper':'middle'}));
  const lower=raga.notes.filter(note=>note.offset<12&&'PDN'.includes(note.variant[0]))
    .map(note=>({...note,name:`Lower ${note.name}`,offset:note.offset-12,register:'lower'}));
  const upper=raga.notes.filter(note=>note.offset<12&&'RGMP'.includes(note.variant[0]))
    .map(note=>({...note,name:`Upper ${note.name}`,offset:note.offset+12,register:'upper'}));
  return [...middleAndUpperSa,...lower,...upper];
}
export const PITCH_POSITION_LABELS=['Sa','R₁','R₂/G₁','R₃/G₂','G₃','M₁','M₂','Pa','D₁','D₂/N₁','D₃/N₂','N₃'];
export const midiHz = midi => 440 * 2 ** ((midi-69)/12);
const REFERENCE_HARMONICS=[1,.31,.14,.06];
const REFERENCE_HARMONIC_TOTAL=REFERENCE_HARMONICS.reduce((sum,part)=>sum+part,0);
const DRONE_BEAT_SECONDS=60/30;
export const centsBetween = (hz, target) => 1200*Math.log2(hz/target);
export const noteName = midi => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((Math.round(midi)%12)+12)%12] + (Math.floor(Math.round(midi)/12)-1);
export const swaraHz = (base,index,notes=RAGAS[DEFAULT_RAGA].notes) => midiHz(base+notes[index].offset);
export function nearestSwara(hz,base,notes=RAGAS[DEFAULT_RAGA].notes){
  const position=12*Math.log2(hz/midiHz(base));
  let best={index:0,cents:Infinity,octave:0};
  for(let octave=-2;octave<=2;octave++) for(let index=0;index<notes.length;index++){
    if(notes[index].offset===12&&octave!==0)continue;
    const cents=(position-notes[index].offset-octave*12)*100;
    if(Math.abs(cents)<Math.abs(best.cents)) best={index,cents,octave};
  }
  return best;
}
export function median(values){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;}
// YIN difference function with a cumulative mean normalized threshold.
// Search the voice range only; unvoiced frames and weak periodicity are rejected.
export function detectPitch(buffer,sampleRate){
  let energy=0,mean=0;
  for(const value of buffer)mean+=value;
  mean/=buffer.length;
  for(const value of buffer)energy+=(value-mean)**2;
  const rms=Math.sqrt(energy/buffer.length);
  if(rms<.008)return null;
  const maxTau=Math.min(Math.floor(sampleRate/65),Math.floor(buffer.length/2)-1);
  const minTau=Math.floor(sampleRate/1100);
  const window=buffer.length-maxTau;
  const diff=new Float32Array(maxTau+1);
  for(let tau=1;tau<=maxTau;tau++){
    let sum=0;for(let j=0;j<window;j++){const delta=buffer[j]-buffer[j+tau];sum+=delta*delta;}diff[tau]=sum;
  }
  let running=0;diff[0]=1;
  for(let tau=1;tau<=maxTau;tau++){running+=diff[tau];diff[tau]=running?diff[tau]*tau/running:1;}
  let found=-1;
  for(let tau=minTau;tau<maxTau;tau++){
    if(diff[tau]<.15){while(tau+1<maxTau&&diff[tau+1]<diff[tau])tau++;found=tau;break;}
  }
  if(found<0)return null;
  const a=diff[found-1],b=diff[found],c=diff[found+1];
  const denominator=2*(2*b-c-a);
  const refined=found+(denominator?(c-a)/denominator:0);
  return {hz:sampleRate/refined,confidence:1-b,rms};
}
export function scorePitch(samples,targets,secondsPerNote,base,tolerance,notes=RAGAS[DEFAULT_RAGA].notes){
  const details=targets.map((index,n)=>{
    // Ignore the first 250 ms of each response window to allow an onset/transition.
    const frames=samples.filter(p=>p.t>=n*secondsPerNote+.25&&p.t<(n+1)*secondsPerNote&&p.hz);
    const target=swaraHz(base,index,notes), deviations=frames.map(p=>centsBetween(p.hz,target));
    const center=median(deviations), spread=center===null?null:median(deviations.map(d=>Math.abs(d-center)));
    const accuracy=frames.length?Math.round(100*deviations.filter(d=>Math.abs(d)<=tolerance).length/frames.length):0;
    const coverage=Math.min(1,frames.length/((secondsPerNote-.25)*16));
    const held=frames.length>=8;
    return {index,accuracy:held?accuracy:0,cents:center,stability:spread,coverage,detected:held,pass:held&&accuracy>=70&&coverage>=.2};
  });
  const accuracy=Math.round(details.reduce((sum,d)=>sum+d.accuracy,0)/details.length);
  return {details,accuracy,pass:details.every(d=>d.pass),voiced:details.some(d=>d.detected)};
}
export class SoundEngine{
  constructor(){this.ctx=null;this.nodes=new Set();this.drone=null;this.droneBuffers=new Map();this.stream=null;this.recorder=null;this.chunks=[];this.source=null;this.analyser=null;this.recordUrl=null;this.clickBuffer=null;}
  async unlock(){this.ctx??=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state!=='running')await this.ctx.resume();}
  scheduleReference(midi,when,duration,volume=.19){return this.scheduleTone(midiHz(midi),when,duration,volume);}
  reference(midi,duration,variant='S',volume=.19){return this.scheduleReference(midi,this.ctx.currentTime,duration,volume);}
  tone(hz,duration,volume=.19){return this.scheduleTone(hz,this.ctx.currentTime,duration,volume);}
  scheduleTone(hz,when,duration,volume=.19){
    const ctx=this.ctx,master=ctx.createGain();master.connect(ctx.destination);
    const nodes=[];
    REFERENCE_HARMONICS.forEach((amplitude,h)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=hz*(h+1);osc.type='sine';gain.gain.value=amplitude/REFERENCE_HARMONIC_TOTAL;osc.connect(gain);gain.connect(master);osc.start(when);osc.stop(when+duration+.09);nodes.push(osc,gain);});
    master.gain.setValueAtTime(0,when);master.gain.linearRampToValueAtTime(volume,when+.035);
    master.gain.exponentialRampToValueAtTime(volume*.55,when+Math.min(duration*.5,1));
    master.gain.setValueAtTime(volume*.55,when+duration-.04);
    master.gain.linearRampToValueAtTime(0,when+duration+.06);
    const entry={master,nodes};this.nodes.add(entry);
    nodes[0].onended=()=>{master.disconnect();nodes.forEach(n=>n.disconnect());this.nodes.delete(entry);};
    return entry;
  }
  scheduleBeatClick(when,accent=false){
    const ctx=this.ctx;
    if(!this.clickBuffer){
      const length=Math.ceil(ctx.sampleRate*.03),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(length*.18));
      this.clickBuffer=buffer;
    }
    const source=ctx.createBufferSource(),master=ctx.createGain(),volume=accent?.16:.1;
    source.buffer=this.clickBuffer;source.connect(master);master.connect(ctx.destination);
    master.gain.setValueAtTime(0,when);
    master.gain.linearRampToValueAtTime(volume,when+.002);
    master.gain.exponentialRampToValueAtTime(.001,when+.03);
    source.start(when);source.stop(when+.031);
    const entry={master,nodes:[source]};this.nodes.add(entry);
    source.onended=()=>{master.disconnect();source.disconnect();this.nodes.delete(entry);};
  }
  scheduleClickTrack(startAt,beatSeconds,lineBeats,countInBeats=4){
    for(let i=0;i<countInBeats+lineBeats;i++)this.scheduleBeatClick(startAt+i*beatSeconds,i===0||i===countInBeats);
    return startAt+countInBeats*beatSeconds;
  }
  stopNotes(){for(const {nodes,master}of this.nodes){try{master.gain.cancelScheduledValues(this.ctx.currentTime);master.gain.setTargetAtTime(0,this.ctx.currentTime,.015);for(const n of nodes)if(n.stop)n.stop(this.ctx.currentTime+.06);}catch{}}}
  async toggleDrone(base,on){
    await this.unlock();
    this.stopDrone();
    if(!on)return;
    const ctx=this.ctx,source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=this.droneBuffer(base);
    source.loop=true;
    source.connect(gain);gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0,ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1,ctx.currentTime+.12);
    source.start();
    this.drone={source,gain};
  }
  droneBuffer(base){
    if(this.droneBuffers.has(base))return this.droneBuffers.get(base);
    const rate=this.ctx.sampleRate,perNote=Math.round(rate*DRONE_BEAT_SECONDS),buffer=this.ctx.createBuffer(1,perNote*3,rate),data=buffer.getChannelData(0);
    const releaseFrames=Math.ceil(rate*.06);
    [base-5,base,base].forEach((midi,noteIndex)=>{
      const hz=midiHz(midi);
      for(let sample=0;sample<perNote+releaseFrames;sample++){
        const t=sample/rate,decayAt=Math.min(DRONE_BEAT_SECONDS*.5,1),sustain=.19*.55;
        const envelope=t<.035?.19*t/.035:t<decayAt?.19*Math.exp(Math.log(.55)*(t-.035)/(decayAt-.035)):t<DRONE_BEAT_SECONDS-.04?sustain:sustain*(DRONE_BEAT_SECONDS+.06-t)/.1;
        let value=0;
        REFERENCE_HARMONICS.forEach((amplitude,index)=>{value+=amplitude/REFERENCE_HARMONIC_TOTAL*Math.sin(2*Math.PI*hz*(index+1)*t);});
        data[(noteIndex*perNote+sample)%data.length]+=value*Math.max(0,envelope);
      }
    });
    this.droneBuffers.set(base,buffer);
    return buffer;
  }
  stopDrone(){
    if(!this.drone||!this.ctx)return;
    const {source,gain}=this.drone,now=this.ctx.currentTime;
    this.drone=null;
    try{gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+.08);source.stop(now+.09);source.onended=()=>{source.disconnect();gain.disconnect();};}catch{source.disconnect();gain.disconnect();}
  }
  async microphone(signal){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access needs HTTPS or localhost in a supported browser.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    if(signal?.aborted){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Cancelled','AbortError');}
    this.stream=stream;this.source=this.ctx.createMediaStreamSource(this.stream);this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=2048;this.source.connect(this.analyser);
  }
  startRecording(){
    const chunks=[];this.chunks=chunks;this.recordingEnded=Promise.resolve(null);
    if(!this.stream||!window.MediaRecorder)return;
    const preferred=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    try{this.recorder=new MediaRecorder(this.stream,preferred?{mimeType:preferred}:undefined);}catch{return;}
    const recorder=this.recorder;
    this.recordingEnded=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{if(this.recordUrl)URL.revokeObjectURL(this.recordUrl);const blob=new Blob(chunks,{type:recorder.mimeType});this.recordUrl=blob.size?URL.createObjectURL(blob):null;resolve(this.recordUrl);};});
    recorder.start();
  }
  async finishRecording(){if(this.recorder?.state==='recording')this.recorder.stop();return this.recordingEnded;}
  releaseMic(){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.source?.disconnect();this.source=null;this.analyser=null;}
  shutdown(){this.stopNotes();this.stopDrone();this.finishRecording();this.releaseMic();}
}
