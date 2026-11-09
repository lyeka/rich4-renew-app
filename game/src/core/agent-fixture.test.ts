import { describe,it,expect } from 'vitest';
import { fixtureGame } from '../../../eval/fixture';
import type { Step } from './types';

describe('asset-free agent foundation fixture',()=>{
 it('boots the real engine and pauses for a human decision without DOM or original assets',()=>{
  const game=fixtureGame(),flow=game.run();
  let r=flow.next(),steps=0;
  while(!r.done && !('ask' in r.value) && steps++<2000) r=flow.next();
  expect(r.done).toBe(false);expect(steps).toBeLessThan(2000);
  expect(r.value).toMatchObject({ask:true,t:'turn',p:0});
  expect(game.players[0].autopilot).toBe(false);
  flow.return();
 });
 it('recorded buy/upgrade answers produce authoritative business events and replay deterministically',()=>{
  const replay=()=>{
   const game=fixtureGame(),p=game.players[0],land=game.board.lands[0];p.whoPlays=1;
   const cash=p.cash,events:Step[]=[];
   for(const expected of ['buy-land','upgrade-land']) {
    const flow=game.landOnLot(p,land);const question=flow.next();
    expect(question.value).toMatchObject({ask:true,t:'yesno',kind:expected});
    let next=flow.next(true),guard=0;
    while(!next.done && guard++<100) {expect('ask' in next.value).toBe(false);events.push(next.value);next=flow.next();}
    expect(next.done).toBe(true);
   }
   expect(land.owner).toBe(1);expect(land.level).toBe(1);
   expect(p.cash).toBe(cash-1500);
   expect(events.some(e=>e.t==='buy')).toBe(true);expect(events.some(e=>e.t==='build')).toBe(true);
   return {cash:p.cash,land,events};
  };
  expect(replay()).toEqual(replay());
 });
});
