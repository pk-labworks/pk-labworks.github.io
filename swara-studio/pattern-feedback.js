import {scorePhraseLine} from './session.js?v=20261125-5';

const noteLabel=note=>note.offset===12?'Upper Sa':note.variant;

export function scorePatternLine(samples,beats,beatSeconds,base,notes,tolerance,codeForNote){
  const byCode=new Map(notes.map((note,index)=>[codeForNote(note),index]));
  let current=-1;
  const indices=beats.map(item=>{
    if(!item.hold)current=byCode.get(item.code)??-1;
    if(current<0)throw new Error(`A note in the pattern is not part of this raga: ${item.code}.`);
    return current;
  });
  return scorePhraseLine(samples,indices,beatSeconds,base,notes,tolerance);
}

export const shouldRetryPatternLine=(score,attempt)=>score<60&&attempt<3;

export function lineFeedbackMarkup(lineIndex,attempt,result,notes,{singlePass=false,lastLine=false}={}){
  const weak=[...new Set(result.details.filter(item=>item.score<60).map(item=>noteLabel(notes[item.index])))];
  const advance=lastLine?'See your pattern score.':'Continue to the next line.';
  const next=singlePass
    ?result.score<60?`${advance} You can practice this pattern with Listen and Sing.`:advance
    :shouldRetryPatternLine(result.score,attempt)
    ?`Listen and sing this line again · try ${attempt+1} of 3.`
    :result.score<60?`${advance} Revisit this one after the pattern.`:advance;
  return `<strong>Line ${lineIndex+1}: ${result.score}%</strong><span>${singlePass?'Sing':`Try ${attempt} of 3`}</span><p>${weak.length?`Practice ${weak.join(', ')}. `:''}${next}</p>`;
}

export function patternSummaryMarkup(results,notes,tolerance,{singlePass=false}={}){
  if(!results.length||results.some(line=>!line.attempts.length)){
    return '<h2>Practice complete</h2><p>Allow microphone access to see a score and note guidance next time.</p>';
  }
  const best=results.map(line=>line.attempts.reduce((winner,attempt)=>attempt.score>winner.score?attempt:winner));
  const score=Math.round(best.reduce((sum,line)=>sum+line.score,0)/best.length);
  const weakLines=best.map((line,index)=>line.score<60?index+1:null).filter(Boolean);
  const weakNotes=[...new Set(best.flatMap(line=>line.details.filter(item=>item.score<60).map(item=>noteLabel(notes[item.index]))))];
  const guidance=weakLines.length
    ?`Practice ${weakLines.length===1?'line':'lines'} ${weakLines.join(', ')} again${weakNotes.length?`, especially ${weakNotes.join(', ')}`:''}.`
    :'All lines reached 60%. Keep practicing at a comfortable tempo.';
  return `<h2>Pattern score: ${score}%</h2><p>${singlePass?'One attempt':'Best attempt'} on each line · pitch within ±${tolerance} cents.</p><div class="session-result-lines">${best.map((line,index)=>{
    const weak=[...new Set(line.details.filter(item=>item.score<60).map(item=>noteLabel(notes[item.index])))];
    return `<div><strong>Line ${index+1}: ${line.score}%</strong><span>${results[index].attempts.length} ${results[index].attempts.length===1?'attempt':'attempts'}${weak.length?` · Practice ${weak.join(', ')}`:' · Well done'}</span></div>`;
  }).join('')}</div><p class="session-guidance">${guidance}</p>`;
}
