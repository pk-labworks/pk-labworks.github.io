export async function countInForLine({sound,beat,lineBeats,waitUntil,token,onBeat,countInBeats=4}){
  const startAt=sound.ctx.currentTime+.1;
  const singStart=sound.scheduleClickTrack(startAt,beat,lineBeats,countInBeats);
  for(let i=0;i<countInBeats;i++){
    await waitUntil(startAt+i*beat,token);
    onBeat(countInBeats-i);
  }
  await waitUntil(singStart,token);
  return singStart;
}
export const feedbackPauseSeconds=willRetry=>willRetry?3:1.2;
