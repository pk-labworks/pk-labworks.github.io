import {noteName} from './music.js?v=20261116-13';

// Shared Swara Live tracker, adapted to Swara Studio's selected Sa and visual palette.
export const LIVE_SWARAS=[
  ['Sa','Shadja / Sa'],['Ri₁','Shuddha Rishabha / komal Re'],['Ri₂','Chatushruti Rishabha / Re'],
  ['Ga₂','Sadharana Gandhara / komal Ga'],['Ga₃','Antara Gandhara / Ga'],['Ma₁','Shuddha Madhyama / Ma'],
  ['Ma₂','Prati Madhyama / tivra Ma'],['Pa','Panchama / Pa'],['Da₁','Shuddha Dhaivata / komal Dha'],
  ['Da₂','Chatushruti Dhaivata / Dha'],['Ni₂','Kaisiki Nishada / komal Ni'],['Ni₃','Kakali Nishada / Ni']
];
export const LIVE_WINDOW_MS=2000,LIVE_GRAPH_FRAME_MS=1000/30;

export function detectLivePitch(data,sampleRate){
  let rms=0;for(let i=0;i<data.length;i++)rms+=data[i]*data[i];rms=Math.sqrt(rms/data.length);if(rms<.012)return null;
  const minLag=Math.floor(sampleRate/2100),maxLag=Math.min(Math.floor(sampleRate/55),Math.floor(data.length/2));
  const differences=new Float32Array(maxLag+1),normalized=new Float32Array(maxLag+1);let running=0,best=-1;
  for(let lag=1;lag<=maxLag;lag++){
    let sum=0;for(let i=0;i<data.length-lag;i++){const delta=data[i]-data[i+lag];sum+=delta*delta;}
    differences[lag]=sum;running+=sum;
    if(lag<minLag)continue;
    normalized[lag]=sum*lag/(running||1);
  }
  for(let lag=minLag;lag<maxLag;lag++){
    if(normalized[lag]<.16){best=lag;while(best+1<maxLag&&normalized[best+1]<normalized[best])best++;break;}
  }
  if(best<0)return null;
  const a=differences[best-1],b=differences[best],c=differences[best+1];
  const shift=(a-c)/(2*(a-2*b+c)||1),frequency=sampleRate/(best+Math.max(-.5,Math.min(.5,shift)));
  return Number.isFinite(frequency)?frequency:null;
}

export function livePitchReading(frequency,tonicMidi,previousMidi=null){
  const exactMidi=69+12*Math.log2(frequency/440);
  let midi=Math.round(exactMidi);
  if(previousMidi!==null&&Math.abs(exactMidi-previousMidi)<.58)midi=previousMidi;
  const offset=midi-tonicMidi,index=((offset%12)+12)%12;
  const [shortName,fullName]=LIVE_SWARAS[index];
  const swara=offset===12?'Upper Sa':offset<0?`Lower ${shortName}`:offset>12?`Higher ${shortName}`:shortName;
  const cents=Math.round((exactMidi-midi)*100);
  return {exactMidi,midi,index,swara,fullName,western:noteName(midi),frequency,cents,
    tuning:Math.abs(cents)<5?'In tune':`${Math.abs(cents)} cents ${cents<0?'flat':'sharp'}`,
    tuningPosition:Math.max(4,Math.min(96,50+cents*.82))};
}

export function drawLiveTrace(canvas,history,tonicMidi,now=performance.now(),options={}){
  if(!canvas)return;
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height)return;
  const ratio=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  }
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const left=Math.min(78,Math.max(50,width*.22)),right=width-14,top=17,bottom=height-32;
  const plotWidth=Math.max(1,right-left),plotHeight=Math.max(1,bottom-top);
  const playhead=left+plotWidth*.78,historyWidth=playhead-left;
  const yFor=offset=>bottom-offset/12*plotHeight;
  const xFor=time=>playhead-(now-time)/LIVE_WINDOW_MS*historyWidth;
  const labelAt=options.labelAt||((offset)=>offset===12?'Upper Sa':LIVE_SWARAS[offset][0]);
  const inRaga=options.inRaga||(()=>false);
  ctx.font='10px sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let offset=0;offset<=12;offset++){
    const y=yFor(offset),highlight=offset===0||offset===12||inRaga(offset);
    ctx.strokeStyle=highlight?'#c9d9c1':'#e4e9df';ctx.lineWidth=highlight?1.4:1;
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    ctx.fillStyle=highlight?'#476d4b':'#839184';ctx.fillText(labelAt(offset),left-8,y);
  }
  if(Number.isFinite(options.targetOffset)){
    const y=yFor(options.targetOffset),band=Math.max(2,(options.toleranceCents||25)/100/12*plotHeight);
    ctx.fillStyle='#dce9d1';ctx.fillRect(left,y-band,plotWidth,band*2);
    ctx.strokeStyle='#729363';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
  }
  ctx.textBaseline='alphabetic';ctx.textAlign='center';
  for(let elapsed=2;elapsed>0;elapsed-=.5){
    const x=playhead-elapsed/2*historyWidth;
    ctx.strokeStyle='#e5e9df';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
    ctx.fillStyle='#869586';ctx.font='10px sans-serif';ctx.fillText(`−${elapsed}s`,x,height-9);
  }
  ctx.strokeStyle='#9db59b';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(playhead,top);ctx.lineTo(playhead,bottom);ctx.stroke();
  ctx.fillStyle='#5e7d5f';ctx.fillText('now',playhead,height-9);
  ctx.save();ctx.beginPath();ctx.rect(left,top,historyWidth,plotHeight);ctx.clip();
  ctx.strokeStyle='#b27752';ctx.lineWidth=2.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  let previous=null,last=null;
  for(const sample of history){
    if(sample.time<now-LIVE_WINDOW_MS||sample.time>now+100)continue;
    const offset=sample.midi-tonicMidi;
    if(offset<0||offset>12){previous=null;continue;}
    const point={x:xFor(sample.time),y:yFor(offset),offset,time:sample.time};
    if(previous&&point.time-previous.time<=350&&Math.abs(point.offset-previous.offset)<=6)ctx.lineTo(point.x,point.y);
    else ctx.moveTo(point.x,point.y);
    previous=point;last=point;
  }
  if(last&&now-last.time<200)ctx.lineTo(playhead,last.y);
  ctx.stroke();ctx.restore();
  if(last&&now-last.time<200){
    ctx.fillStyle='#315640';ctx.strokeStyle='#f8f5ec';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(playhead,last.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(Number.isFinite(options.playingOffset)){
    ctx.fillStyle='#456e4b';ctx.beginPath();ctx.arc(right-8,yFor(options.playingOffset),5,0,Math.PI*2);ctx.fill();
  }
}
