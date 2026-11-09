// Executable examples of the contract, NOT a host implementation or an exactly-once proof.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertMessage,assertInput,assertEventBatch} from '../src/validate.mjs';
const traces=JSON.parse(readFileSync(new URL('../examples/lifecycle.json',import.meta.url)));
function checkTrace(messages){
 const decisions=new Map(),requests=new Map(),receipts=new Map(),completed=new Set();
 let active=null;
 function receipt(requestId,status){
  const request=requests.get(requestId);assert(request,'receipt must reference sent request');
  const previous=receipts.get(requestId);if(previous){assert.equal(previous,status);return;}
  if(status==='consumed'||status==='applied'){
   assert(active,'new successful input requires active decision');
   assertInput(active,request);
   assert.equal(status,request.type==='control.input'?'applied':'consumed');
   if(status==='consumed') active=null;
  }
  receipts.set(requestId,status);
 }
 for(const m of messages){
  assertMessage(m);const p=m.payload;if(p.events)assertEventBatch(p.events);
  switch(m.type){
   case 'decision.open':
    assert(!active,'only one active decision');
    assert(!decisions.has(p.decisionId),'decision IDs cannot be reused');
    if(p.parentDecisionId){const parent=decisions.get(p.parentDecisionId);assert(parent);assert.equal(parent.payload.operationId,p.operationId);}
    decisions.set(p.decisionId,m);active=m;break;
   case 'action.submit':case 'control.input':{
    const prev=requests.get(p.requestId);
    if(prev)assert.deepEqual(prev.payload,p,'retry must preserve the command');
    else requests.set(p.requestId,m);
    break;
   }
   case 'action.result':case 'control.result':receipt(p.requestId,p.status);break;
   case 'decision.cancel':active=null;break;
   case 'decision.closed':assert(decisions.has(p.decisionId));active=null;break;
   case 'sync.result':
    for(const r of p.receipts)receipt(r.requestId,r.status);
    active=p.pendingDecision?{...m,type:'decision.open',payload:p.pendingDecision}:null;
    for(const operation of p.operations) if(operation.status==='completed')completed.add(operation.operationId);
    break;
   case 'operation.result':
    assert(!active,'must finish decision before completing its operation');
    if(p.status==='completed')completed.add(p.operationId);break;
  }
 }
 return {consumed:[...receipts.values()].filter(x=>x==='consumed').length,applied:[...receipts.values()].filter(x=>x==='applied').length,completed:completed.size,open:active?1:0};
}
for(const trace of traces)test(`lifecycle: ${trace.name}`,()=>assert.deepEqual(checkTrace(trace.messages),trace.expected));
test('consuming a choice does not yet complete its business operation',()=>{
 const trace=traces.find(t=>t.name==='multi-step');
 assert.deepEqual(checkTrace(trace.messages.slice(0,4)),{consumed:1,applied:0,completed:0,open:0});
});
test('a duplicate request cannot silently change its arguments',()=>{
 const trace=structuredClone(traces.find(t=>t.name==='duplicate-after-close'));
 trace.messages[4].payload.arguments.count=2;
 assert.throws(()=>checkTrace(trace.messages),/preserve the command/);
});
