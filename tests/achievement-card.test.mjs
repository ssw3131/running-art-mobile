import test from 'node:test';
import assert from 'node:assert/strict';
import { cardContent, cardSize, defaultCardOptions } from '../src/modules/achievements/card.ts';
const run={status:'completed',startedAt:new Date(2026,9,14,12).getTime(),distanceM:3000,activeMs:1800000,courseOutcome:'stopped'};
test('cards default to nickname/date, retain GPS segment gaps and contain normalized coordinates only',()=>{
 const points=[{segment:0,longitude:127.12345678,latitude:37.23456789},{segment:0,longitude:127.124,latitude:37.235},{segment:1,longitude:127.14,latitude:37.24}];
 const card=cardContent(run,null,points,'별 러너',defaultCardOptions);
 assert.equal(card.nickname,'별 러너');assert.equal(card.date,'2026년 10월 14일');
 assert.equal(card.distance,'3.00 km');assert.match(card.outcome,/기록/);
 const svg=Buffer.from(card.pathUri.split(',')[1],'base64').toString();
 assert.equal((svg.match(/polyline/g)||[]).length,2);assert.doesNotMatch(svg,/127\.12345678|37\.23456789/);
 assert.equal(cardContent(run,null,points,'별 러너',{format:'feed',nickname:false,date:false}).nickname,null);
 assert.deepEqual(cardSize('story'),{width:1080,height:1920});assert.deepEqual(cardSize('feed'),{width:1080,height:1350});
});
test('planned outline is labelled and never exposes stored course name; long traces avoid spread limits',()=>{
 const course={shape:'heart',route:[[127,37],[128,38]],name:'집 주소 사적인 이름'};
 const card=cardContent({...run,courseOutcome:'finished'},course,[],'러너',defaultCardOptions);
 assert.equal(card.title,'하트 코스');assert.equal(card.pathLabel,'계획 코스 윤곽');assert.match(card.outcome,/완주/);assert.doesNotMatch(JSON.stringify(card),/집 주소/);
 const points=Array.from({length:150000},(_,i)=>({segment:0,longitude:127+i/10000000,latitude:37}));
 assert.ok(cardContent(run,null,points,'러너',defaultCardOptions).pathUri);
 assert.throws(()=>cardContent({...run,status:'running'},null,[],'러너',defaultCardOptions),/completed/);
});

test('card content handles Korean/English names, long durations, and tiny or zero distance',()=>{
 const extended={...run,activeMs:(123*3600+45*60+6)*1000,distanceM:1};
 for(const name of ['한글러너'.repeat(8),'VeryLongEnglishRunnerName']){
  const card=cardContent(extended,null,[],name,defaultCardOptions);
  assert.equal([...card.nickname].length,20);
  assert.equal(card.duration,'123:45:06');assert.equal(card.distance,'0.00 km');assert.equal(card.pace,'—');
 }
 const empty=cardContent({...run,activeMs:0,distanceM:0},null,[],'\n\u200b',defaultCardOptions);
 assert.equal(empty.nickname,'러너');assert.equal(empty.duration,'00:00:00');assert.equal(empty.pace,'—');
});
