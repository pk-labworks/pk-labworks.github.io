const SWARAS = [
  ['Sa','Shadja / Sa'],['Ri₁','Shuddha Rishabha / komal Re'],['Ri₂','Chatushruti Rishabha / Re'],
  ['Ga₂','Sadharana Gandhara / komal Ga'],['Ga₃','Antara Gandhara / Ga'],['Ma₁','Shuddha Madhyama / Ma'],
  ['Ma₂','Prati Madhyama / tivra Ma'],['Pa','Panchama / Pa'],['Da₁','Shuddha Dhaivata / komal Dha'],
  ['Da₂','Chatushruti Dhaivata / Dha'],['Ni₂','Kaisiki Nishada / komal Ni'],['Ni₃','Kakali Nishada / Ni']
];
const NOTE_NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const $=id=>document.getElementById(id);
const tonic=$('tonic'), scale=$('scale'), canvas=$('trace'), ctx=canvas.getContext('2d');
let audioContext, analyser, stream, samples, animation, listening=false, previousMidi=null, lastGood=0, lastAnalysis=0, lastDraw=0;
let history=[];
const WINDOW_MS=2_000,VIEW_MIN=0,VIEW_MAX=12,VIEW_SPAN=12,GRAPH_FRAME_MS=1000/30;
for(let midi=48;midi<=71;midi++){const option=document.createElement('option');option.value=midi;option.textContent=`${NOTE_NAMES[midi%12]}${Math.floor(midi/12)-1}`;if(midi===60)option.selected=true;tonic.append(option)}
SWARAS.forEach(([name,description],i)=>{const item=document.createElement('div');item.className='scale-item';item.innerHTML=`<strong>${name}</strong><span>${description.split(' / ')[1]}</span>`;item.dataset.index=i;scale.append(item)});
function setStatus(message){$('status').textContent=message}
function resetReadout(){ $('swara').textContent='—';$('swara-name').textContent='Your note will appear here';$('western').textContent='—';$('frequency').textContent='— Hz';$('cents').textContent='Sing a steady note to see its tuning';$('tuning-dot').style.left='50%';document.querySelectorAll('.scale-item').forEach(el=>el.classList.remove('active')) }
function noteName(midi){return NOTE_NAMES[((midi%12)+12)%12]+(Math.floor(midi/12)-1)}
function swaraName(offset){return offset===12?'Sa+1':SWARAS[offset][0]}
function detectPitch(data,sampleRate){
  let rms=0;for(let i=0;i<data.length;i++)rms+=data[i]*data[i];rms=Math.sqrt(rms/data.length);if(rms<0.012)return null;
  const minLag=Math.floor(sampleRate/2100),maxLag=Math.min(Math.floor(sampleRate/55),Math.floor(data.length/2));
  const differences=new Float32Array(maxLag+1),normalized=new Float32Array(maxLag+1);let running=0,best=-1;
  for(let lag=1;lag<=maxLag;lag++){
    let sum=0;for(let i=0;i<data.length-lag;i++){const delta=data[i]-data[i+lag];sum+=delta*delta}
    differences[lag]=sum;running+=sum;
    if(lag<minLag)continue;
    normalized[lag]=sum*lag/(running||1);
  }
  for(let lag=minLag;lag<maxLag;lag++){
    if(normalized[lag]<0.16){best=lag;while(best+1<maxLag && normalized[best+1]<normalized[best])best++;break}
  }
  if(best<0)return null;
  const a=differences[best-1],b=differences[best],c=differences[best+1];
  const shift=(a-c)/(2*(a-2*b+c)||1);const frequency=sampleRate/(best+Math.max(-.5,Math.min(.5,shift)));
  return Number.isFinite(frequency)?frequency:null;
}
function showPitch(frequency){
  const exactMidi=69+12*Math.log2(frequency/440);let midi=Math.round(exactMidi);
  if(previousMidi!==null && Math.abs(exactMidi-previousMidi)<.58)midi=previousMidi;
  previousMidi=midi;lastGood=performance.now();
  const index=((midi-Number(tonic.value))%12+12)%12;
  $('swara').textContent=SWARAS[index][0];$('swara-name').textContent=SWARAS[index][1];$('western').textContent=noteName(midi);$('frequency').textContent=`${frequency.toFixed(1)} Hz`;
  const cents=Math.round((exactMidi-midi)*100);$('cents').textContent=Math.abs(cents)<5?'In tune':`${Math.abs(cents)} cents ${cents<0?'flat':'sharp'}`;$('tuning-dot').style.left=`${Math.max(4,Math.min(96,50+cents*.82))}%`;
  document.querySelectorAll('.scale-item').forEach((el,i)=>el.classList.toggle('active',i===index));
  history.push({midi:exactMidi,time:performance.now()});
}
function drawTrace(now=performance.now()){
  const ratio=window.devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h)return;
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio)}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  const left=62,right=w-18,top=20,bottom=h-35,plotW=right-left,plotH=bottom-top;
  const playhead=left+plotW*.78,historyWidth=playhead-left;
  const yFor=offset=>bottom-(offset-VIEW_MIN)/VIEW_SPAN*plotH;
  const xFor=time=>playhead-(now-time)/WINDOW_MS*historyWidth;
  const tonicMidi=Number(tonic.value);
  history=history.filter(point=>point.time>=now-WINDOW_MS);
  ctx.font='10px system-ui, sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let offset=VIEW_MIN;offset<=VIEW_MAX;offset++){
    const y=yFor(offset),isSa=offset===0||offset===12;
    ctx.strokeStyle=isSa?'#738675':'#334339';ctx.lineWidth=isSa?1.5:1;
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    const label=swaraName(offset);
    ctx.fillStyle=isSa?'#dfb481':'#a7b8a7';ctx.fillText(label,left-9,y);
  }
  ctx.textBaseline='alphabetic';ctx.textAlign='center';
  for(let elapsed=2;elapsed>=0;elapsed-=.5){
    const x=playhead-elapsed/2*historyWidth;
    if(elapsed===0)continue;
    ctx.strokeStyle='#34453a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
    ctx.fillStyle='#96a897';ctx.font='11px system-ui, sans-serif';
    ctx.fillText(`−${elapsed}s`,x,h-11);
  }
  ctx.strokeStyle='#bdd0b099';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(playhead,top);ctx.lineTo(playhead,bottom);ctx.stroke();
  ctx.fillStyle='#d8bb93';ctx.font='11px system-ui, sans-serif';ctx.fillText('now',playhead,h-11);
  if(!history.length)return;
  ctx.save();ctx.beginPath();ctx.rect(left,top,historyWidth,plotH);ctx.clip();
  ctx.strokeStyle='#e6b17a';ctx.lineWidth=2.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  let previous=null,last=null;
  for(const sample of history){
    const offset=sample.midi-tonicMidi;
    if(offset<VIEW_MIN||offset>VIEW_MAX){previous=null;continue}
    const point={x:xFor(sample.time),y:yFor(offset),offset,time:sample.time};
    if(previous&&point.time-previous.time<=350&&Math.abs(point.offset-previous.offset)<=6)ctx.lineTo(point.x,point.y);
    else ctx.moveTo(point.x,point.y);
    previous=point;last=point;
  }
  if(last&&now-last.time<200)ctx.lineTo(playhead,last.y);
  ctx.stroke();
  ctx.restore();
  if(last&&now-last.time<200){ctx.fillStyle='#1b251f';ctx.strokeStyle='#f6d1a4';ctx.lineWidth=3;ctx.beginPath();ctx.arc(playhead,last.y,6,0,Math.PI*2);ctx.fill();ctx.stroke()}
}
function tick(){if(!listening)return;const now=performance.now();if(now-lastAnalysis>=55){lastAnalysis=now;analyser.getFloatTimeDomainData(samples);const frequency=detectPitch(samples,audioContext.sampleRate);if(frequency)showPitch(frequency);else if(now-lastGood>700){resetReadout();previousMidi=null}}if(now-lastDraw>=GRAPH_FRAME_MS-1){drawTrace(now);lastDraw=now}animation=requestAnimationFrame(tick)}
async function start(){
  if(!navigator.mediaDevices?.getUserMedia){setStatus('Microphone access requires a modern browser on localhost.');return}
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();const source=audioContext.createMediaStreamSource(stream);analyser=audioContext.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser);samples=new Float32Array(analyser.fftSize);listening=true;lastDraw=0;lastGood=performance.now();$('button-text').textContent='Stop listening';$('button-icon').textContent='■';$('listen').classList.add('active');$('signal').textContent='MIC ON';$('signal').classList.add('on');setStatus('Listening. Sing or hum a steady note.');tick()}catch(error){setStatus(error.name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser and try again.':`Could not start microphone: ${error.message}`)}
}
async function stop(){listening=false;cancelAnimationFrame(animation);stream?.getTracks().forEach(track=>track.stop());await audioContext?.close();stream=null;audioContext=null;previousMidi=null;$('button-text').textContent='Start listening';$('button-icon').textContent='●';$('listen').classList.remove('active');$('signal').textContent='MIC OFF';$('signal').classList.remove('on');setStatus('Microphone stopped.');resetReadout()}
$('listen').addEventListener('click',()=>listening?stop():start());$('clear').addEventListener('click',()=>{history=[];drawTrace()});tonic.addEventListener('change',()=>{history=[];resetReadout();drawTrace()});window.addEventListener('resize',()=>drawTrace());drawTrace();
