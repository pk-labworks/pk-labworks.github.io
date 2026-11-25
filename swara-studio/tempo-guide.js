export async function countInForLine({sound,beat,lineBeats,waitUntil,token,onBeat}){
  const countInBeats=4,startAt=sound.ctx.currentTime+.1;
  const singStart=sound.scheduleClickTrack(startAt,beat,lineBeats,countInBeats);
  for(let i=0;i<countInBeats;i++){
    await waitUntil(startAt+i*beat,token);
    onBeat(countInBeats-i);
  }
  await waitUntil(singStart,token);
  return singStart;
}
