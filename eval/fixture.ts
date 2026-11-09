import { readFileSync } from 'node:fs';
import { Game } from '../game/src/core/game';
import type { Board } from '../game/src/core/board';
import { pack } from '../game/src/core/date';

// Engine-private seed for repeatable tests. This module is never a player observation.
export function fixtureGame(): Game {
 const board: Board = JSON.parse(readFileSync(new URL('./fixtures/maps/agent-lab.json',import.meta.url),'utf8'));
 return new Game({mapId:board.mapId,players:[{character:0,human:true},{character:1,human:true}],fundIndex:1,traffic:0,landLimitIndex:0,daysLimitIndex:0,victoryIndex:0,startDate:pack(2026,11,9),seed:42},board);
}
