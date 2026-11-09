import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { assertMessage, assertInput, assertEventBatch, assertActions } from '../src/validate.mjs';
import { schema } from '../scripts/generate-schema.mjs';
import { inventory } from '../scripts/inventory.mjs';
const read = p => JSON.parse(readFileSync(new URL(p,import.meta.url)));
const valid=read('../examples/valid.json'), invalid=read('../examples/invalid.json');
const decision=kind=>structuredClone(valid.find(m=>m.type==='decision.open'&&m.payload.kind===kind));
function input(d,actionId,args={},type='action.submit') {
 return {...d,messageId:'input1',type,payload:{decisionId:d.payload.decisionId,revision:d.payload.revision,requestId:'req',actionId,arguments:args,...(type==='control.input'?{observedViewId:d.payload.snapshot.viewId}:{})}};
}
test('committed schema is generated from canonical source',()=>assert.deepEqual(read('../schemas/protocol.schema.json'),schema));
test('wire examples cover all message variants and all decision kinds',()=>{
 valid.forEach(assertMessage);
 assert.deepEqual(new Set(valid.map(m=>m.type)),new Set(schema.oneOf.map(s=>s.properties.type.const)));
 const catalog=read('../decision-catalog.json');
 assert.deepEqual(new Set(valid.filter(m=>m.type==='decision.open').map(m=>m.payload.kind)),new Set(catalog.map(c=>c.kind)));
 for(const d of valid.filter(m=>m.type==='decision.open')) {assertActions(d.payload.actions);assertEventBatch(d.payload.events);}
});
for(const {name,message} of invalid) test(`reject wire: ${name}`,()=>assert.throws(()=>assertMessage(message)));
test('inventory covers declared union AND runtime casts; source links remain accurate',()=>{
 const actual=inventory(),catalog=read('../decision-catalog.json');
 assert.deepEqual(catalog.map(c=>c.kind).sort(),Object.keys(actual.emitted).sort());
 for(const type of actual.declared) assert(catalog.some(c=>c.originAsk===type),`Missing Ask ${type}`);
 for(const c of catalog) {
  assert.deepEqual(c.sources,actual.emitted[c.kind]);
  c.sources.forEach(p=>assert(existsSync(new URL(`../../${p}`,import.meta.url))));
 }
});
test('dice count is bounded; arbitrary score/dice result arguments are rejected',()=>{
 const d=decision('turn');assertInput(d,input(d,'roll',{count:2}));
 for(const args of [{count:6},{count:1,points:6},{score:100},{count:1.5}]) assert.throws(()=>assertInput(d,input(d,'roll',args)));
});
test('one banking operation; zero amount and cancellation are distinct',()=>{
 const d=decision('bank');assertInput(d,input(d,'deposit',{amount:0}));assertInput(d,input(d,'leave'));
 assert.throws(()=>assertInput(d,input(d,'deposit',{amount:100,withdraw:100})));
 const a=decision('amount');assertInput(a,input(a,'cancel'));assertInput(a,input(a,'confirm',{amount:0}));
 for(const amount of [-1,99,10001]) assert.throws(()=>assertInput(a,input(a,'confirm',{amount})));
});
test('duplicate exchange choices are quantities; duplicate kept-dice indices are invalid',()=>{
 const x=decision('kb-exchange');assertInput(x,input(x,'exchange',{tools:[1,1],store:true}));
 const d=decision('kb-dice-keep');assertInput(d,input(d,'keep',{indices:[0,2]}));
 assert.throws(()=>assertInput(d,input(d,'keep',{indices:[1,1]})));
});
test('binding/revision/view checks and administrative exclusion',()=>{
 const d=decision('wheel'),i=input(d,'stop',{},'control.input');assertInput(d,i);
 for(const key of ['gameId','epochId','seatId']) {const c=structuredClone(i);c[key]=key==='seatId'?1:'old';assert.throws(()=>assertInput(d,c));}
 for(const key of ['decisionId','revision','observedViewId']) {const c=structuredClone(i);c.payload[key]='old';assert.throws(()=>assertInput(d,c));}
 assert.throws(()=>assertInput(d,input(d,'stop')));
 const seat=decision('seat');assert.throws(()=>assertInput(seat,input(seat,'select')));
});
test('visible cursor is contiguous and does not count hidden events',()=>{
 const event={eventId:'ev1',sequence:1,kind:'dice_rolled',actor:0,operationId:'op1',text:'Dice rolled',entities:[]};
 assertEventBatch({fromCursor:0,toCursor:1,items:[event],hasMore:false});
 assert.throws(()=>assertEventBatch({fromCursor:0,toCursor:2,items:[event],hasMore:false}));
 assert.throws(()=>assertEventBatch({fromCursor:0,toCursor:1,items:[{...event,sequence:2}],hasMore:false}));
});
test('reject ambiguous action descriptions before they reach the model',()=>{
 const actions=decision('turn').payload.actions;
 assert.throws(()=>assertActions([...actions,...actions]));
 actions[0].parameters[0].maximum=0;assert.throws(()=>assertActions(actions));
});
