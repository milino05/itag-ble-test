import assert from 'node:assert/strict';
import {ScoreEngine,ClickDetector,MODES,REPEAT_FILTER_MS,DOUBLE_WINDOW_MS} from './core.mjs';
const t=(e,...teams)=>teams.forEach(team=>e.addPoint(team));
const deuce=e=>t(e,0,0,0,1,1,1);
{
 const e=new ScoreEngine(MODES.ADVANTAGE); deuce(e);
 t(e,0);assert.deepEqual(e.snapshot().displayedPoints,['AD','40']);
 t(e,1);assert.deepEqual(e.snapshot().displayedPoints,['40','40']);
 t(e,1,0,0,0);assert.equal(e.snapshot().games[0],1);assert.equal(e.snapshot().showGames,true);
 t(e,1);assert.equal(e.snapshot().showGames,false);assert.equal(e.snapshot().displayedPoints[1],'15');
 assert.equal(e.undoLastPointBy(1),true);assert.equal(e.snapshot().showGames,true);
}
{
 const e=new ScoreEngine(MODES.GOLDEN);deuce(e);assert.equal(e.snapshot().goldenPoint,true);
 t(e,1);assert.equal(e.snapshot().games[1],1);
}
{
 const e=new ScoreEngine(MODES.STAR);deuce(e);
 t(e,0,1);assert.equal(e.snapshot().canceledAdvantages,1);
 t(e,1,0);assert.equal(e.snapshot().canceledAdvantages,2);assert.equal(e.snapshot().starPoint,true);
 t(e,0);assert.equal(e.snapshot().games[0],1);
}
{
 const e=new ScoreEngine();t(e,0,0,0,0);assert.equal(e.snapshot().games[0],1);t(e,0);
 assert.equal(e.snapshot().displayedPoints[0],'15');
 assert.equal(e.undoLastPointBy(0),true);assert.equal(e.snapshot().showGames,true);
 assert.equal(e.undoLastPointBy(0),true);assert.equal(e.snapshot().games[0],0);
}
{
 const c=new ClickDetector();
 assert.equal(c.notifyAt(1000),'FIRST');assert.equal(c.notifyAt(1220),'REPEAT');
 assert.equal(c.notifyAt(1450),'DOUBLE');assert.equal(c.expireAt(2500),false);
 assert.equal(c.notifyAt(3000),'FIRST');assert.equal(c.expireAt(3900),false);
 assert.equal(c.expireAt(3950),true);
 assert.equal(c.notifyAt(5000),'FIRST');assert.equal(c.notifyAt(6000),'NEXT_FIRST');
 assert.equal(c.expireAt(7000),true);
 assert.equal(REPEAT_FILTER_MS,320);assert.equal(DOUBLE_WINDOW_MS,950);
}
{
 const e=new ScoreEngine(MODES.STAR,[0,0,0,1,1,1]);
 assert.deepEqual(e.history,[0,0,0,1,1,1]);
 assert.equal(e.snapshot().displayedPoints[0],'40');
 e.clear();e.setMode(MODES.GOLDEN);assert.equal(e.snapshot().games[0],0);
}
console.log('7 gruppi di test superati: Advantage, Golden, Star, game, undo, clic e restore.');
