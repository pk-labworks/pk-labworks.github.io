import {RAGAS} from './music.js?v=20261116-13';
import {selectionFields} from './selection.js?v=20261122-1';

// The source lesson uses seven scale degrees. Missing degrees become holds so
// five-note ragas keep the same eight-beat Aadi taalam shape.
const PATTERNS=[
  ['s r g m | p d | n S','S n d p | m g | r s'],
  ['s r - s r - | s r | g m','s r g m | p d | n S','S n - S n - | S n | d p','S n d p | m g | r s'],
  ['s r g - s | r g - | s r','s r g m | p d | n S','S n d - S | n d - | S n','S n d p | m g | r s'],
  ['s r g m - | s r | g m -','s r g m | p d | n S','S n d p - | S n | d p -','S n d p | m g | r s'],
  ['s r g m | p , - | s r','s r g m | p d | n S','S n d p | m , - | S n','S n d p | m g | r s'],
  ['s r g m | p d - | s r','s r g m | p d | n S','S n d p | m g - | S n','S n d p | m g | r s'],
  ['s r g m | p d | n ,','s r g m | p d | n S','S n d p | m g | r ,','S n d p | m g | r s'],
  ['s r g m | p m | g r','s r g m | p d | n S','S n d p | m p | d n','S n d p | m g | r s'],
  ['s r g m | p m | d p','s r g m | p d | n S','S n d p | m p | g m','S n d p | m g | r s'],
  ['s r g m | p , | g m','p , , , | p , | , ,','g m p d | n d | p m','g m p - g | m g | r s'],
  ['S , n d | n , | d p','d , p m | p , | p ,','g m p d | n d | p m','g m p - g | m g | r s'],
  ['S S n d | n n | d p','d d p m | p , | p ,','g m p d | n d | p m','g m p - g | m g | r s'],
  ['s r g r | g , - | g m','p m p , - | d p | d ,','m p d p | d n | d p','m p d p | m g | r s'],
  ['s r g m | p , | p ,','d d p , | m m | p ,','d n S , | S n | d p','S n d p | m g | r s']
];

const code=note=>note.offset===12?"S'":note.variant.replace(/[₁₂₃]/g,n=>({'₁':'1','₂':'2','₃':'3'})[n]);

function adaptLine(line,raga){
  let previous=null;
  return line.split('|').map(bar=>bar.trim().split(/\s+/).flatMap(token=>{
    if(token==='-')return [];
    if(token===',')return previous?[{code:'~',label:'—',hold:true}]:[];
    const note=token==='S'?raga.notes.at(-1):raga.notes.find(item=>item.offset!==12&&item.variant[0].toLowerCase()===token);
    if(!note){
      if(previous)return [{code:'~',label:'—',hold:true}];
      const degrees='srgmpdn',target=degrees.indexOf(token);
      const nearest=raga.notes.filter(item=>item.offset!==12).sort((a,b)=>Math.abs(degrees.indexOf(a.variant[0].toLowerCase())-target)-Math.abs(degrees.indexOf(b.variant[0].toLowerCase())-target))[0];
      previous=nearest;
      return [{code:code(nearest),label:nearest.variant,hold:false}];
    }
    previous=note;
    return [{code:code(note),label:note.offset===12?'Ṡ':note.variant,hold:false}];
  })).filter(bar=>bar.length);
}

export function saraliPattern(ragaId,index){
  const raga=RAGAS[ragaId];
  if(!raga||!Number.isInteger(index)||index<0||index>=PATTERNS.length)throw new Error('Choose a Sarali Varasai pattern.');
  const lines=PATTERNS[index].map(line=>adaptLine(line,raga));
  return {lines,notes:lines.map(bars=>bars.flat().map(beat=>beat.code).join(' ')).join('\n')};
}

export function createSaraliVarasai({getSettings,onPractice,onSelection}){
  const host=document.getElementById('sarali-view');
  let selected=0;
  function render(){
    const settings=getSettings(),raga=RAGAS[settings.raga],pattern=saraliPattern(settings.raga,selected);
    host.innerHTML=`<div class="session-heading"><p class="eyebrow">LEARNING PATH · 01</p><h1>Sarali Varasai.</h1></div>
      <div class="sarali-panel"><div class="sarali-top">${selectionFields('sarali',settings)}</div>
      <p class="sarali-scale">${raga.notes.map(note=>note.variant).join(' &nbsp; ')}</p>
      <p class="sarali-instruction">Aadi taalam. Listen to one line, then sing it for the same number of beats.</p>
      <div class="sarali-picker" role="group" aria-label="Sarali Varasai patterns">${PATTERNS.map((_,i)=>`<button type="button" data-pattern="${i}" aria-pressed="${i===selected}">${String(i+1).padStart(2,'0')}</button>`).join('')}</div>
      <div class="sarali-score"><h2>Pattern ${String(selected+1).padStart(2,'0')}</h2>${pattern.lines.map((bars,line)=>`<div class="sarali-score-line"><span class="sarali-line-number">${line+1}</span>${bars.map(bar=>`<span class="sarali-bar">${bar.map(beat=>`<span class="${beat.hold?'hold':''}" aria-label="${beat.hold?'Hold previous swara':beat.label}">${beat.label}</span>`).join('')}</span>`).join('')}</div>`).join('')}</div>
      <button id="sarali-practice" class="primary-button" type="button">Play and sing pattern <span aria-hidden="true">→</span></button>
      <p class="sarali-source">Adapted from “Sarali Varisai” in <em>karnATik Beginners’ Lessons Notation</em> (Rani, 2002). Missing swaras are held for one beat in five-note ragas.</p></div>`;
    for(const id of ['sarali-base','sarali-raga'])host.querySelector(`#${id}`).onchange=()=>onSelection({base:Number(host.querySelector('#sarali-base').value),raga:host.querySelector('#sarali-raga').value});
    host.querySelectorAll('[data-pattern]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.pattern);render();});
    host.querySelector('#sarali-practice').onclick=()=>onPractice({base:settings.base,raga:settings.raga,notes:pattern.notes,title:`Sarali Varasai · Pattern ${String(selected+1).padStart(2,'0')}`});
  }
  render();
  return {render};
}
