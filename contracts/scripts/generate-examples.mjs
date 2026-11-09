import { writeFileSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('decision-catalog.json', root)));
export const batch = { fromCursor: 0, toCursor: 0, items: [], hasMore: false };
const snapshot = { viewId:'v1',observedAt:'2026-11-09T00:00:00Z',mapId:1000,phase:'awaiting_input',currentActor:0,entities:[],viewport:{width:1280,height:720,center:[256,256],zoom:1,canPan:false} };
let seq=0;
const msg=(type,payload)=>({version:'1.0',messageId:`m${++seq}`,gameId:'fixture',epochId:'e1',seatId:0,sentAt:'2026-11-09T00:00:00Z',type,payload});
const action=(id,channel='answer',parameters=[])=>({id,channel,label:id,description:'Fixture legal input',parameters});
const integer=(name,minimum,maximum)=>({name,description:name,type:'integer',required:true,minimum,maximum});
const actions = {
 turn:[action('roll','answer',[integer('count',1,3)])],
 bank:[action('deposit','answer',[integer('amount',0,10000)]),action('leave')],
 'kb-exchange':[action('exchange','answer',[{name:'tools',description:'Visible tool indices; duplicates represent quantity',type:'integer-list',required:true,minimum:0,maximum:3,minItems:0,maxItems:20,uniqueItems:false},{name:'store',description:'Store remaining balls',type:'boolean',required:true}])],
 'kb-dice-keep':[action('keep','answer',[{name:'indices',description:'Distinct visible dice indices',type:'integer-list',required:true,minimum:0,maximum:2,minItems:2,maxItems:2,uniqueItems:true}])],
 amount:[action('confirm','answer',[{...integer('amount',0,10000),multipleOf:100}]),action('cancel')],
};
const decisions=catalog.map(c=>msg('decision.open',{decisionId:`d-${c.kind}`,revision:'r1',operationId:'op1',parentDecisionId:null,kind:c.kind,mode:c.mode,title:`Fixture: ${c.kind}`,actions:actions[c.kind]??[action(c.mode==='continuous'?'stop':'select',c.mode==='continuous'?'control':'answer')],snapshot,events:batch,deadlineAt:c.mode==='continuous'?'2026-11-09T00:00:30Z':null,clock:c.mode==='continuous'?'realtime':'paused'}));
const d=decisions[0].payload;
const scope={decisionId:d.decisionId,revision:d.revision};
const command={...scope,requestId:'req1',actionId:'roll',arguments:{count:1}};
const error={code:'stale_decision',message:'Decision already closed',retryable:false};
const messages=[
 msg('host.hello',{hostInstanceId:'h1',supportedVersions:['1.0'],capabilities:['discrete','continuous','event_history']}),
 msg('agent.ready',{selectedVersion:'1.0',capabilities:['discrete','continuous','event_history']}),
 ...decisions,
 msg('decision.update',{...scope,snapshot,actions:d.actions,events:batch,deadlineAt:null}),
 msg('query.request',{...scope,requestId:'q1',query:'observation',resourceId:null,afterCursor:null,pageToken:null,limit:64}),
 msg('query.result',{...scope,requestId:'q1',status:'ok',snapshot,entities:[],actions:d.actions,events:batch,nextPageToken:null}),
 msg('query.result',{...scope,requestId:'q2',status:'rejected',error}),
 msg('action.submit',command),msg('action.result',{...scope,requestId:'req1',status:'consumed'}),
 msg('action.result',{...scope,requestId:'req2',status:'rejected',error}),
 msg('control.input',{decisionId:'d-wheel',revision:'r1',requestId:'c1',actionId:'stop',arguments:{},observedViewId:'v1'}),
 msg('control.result',{decisionId:'d-wheel',revision:'r1',requestId:'c1',status:'applied',appliedAt:'2026-11-09T00:00:01Z',viewId:'v1'}),
 msg('control.result',{decisionId:'d-wheel',revision:'r1',requestId:'c2',status:'rejected',error}),
 msg('decision.closed',{...scope,operationId:'op1',reason:'answered',acceptedRequestId:'req1',events:batch}),
 msg('operation.result',{operationId:'op1',status:'completed',summary:'Movement resolved',events:batch}),
 msg('decision.cancel',{...scope,reason:'save_loaded'}),msg('run.failed',{...scope,error:{code:'model_error',message:'Provider unavailable',retryable:true}}),
 msg('events.batch',batch),msg('events.ack',{cursor:0}),
 msg('sync.request',{afterCursor:0,pendingRequestIds:['req1'],pendingOperationIds:['op1']}),
 msg('sync.result',{hostInstanceId:'h1',historyStatus:'complete',pendingDecision:null,receipts:[{requestId:'req1',decisionId:d.decisionId,channel:'action',status:'consumed',error:null}],operations:[{operationId:'op1',status:'completed',summary:'Movement resolved'}],events:batch}),
 msg('protocol.error',{inReplyTo:'m0',error}),
];
writeFileSync(new URL('examples/valid.json',root),JSON.stringify(messages,null,2)+'\n');
const invalid=[];
function bad(name, source, change){const message=structuredClone(source); change(message);invalid.push({name,message});}
bad('unknown protocol version',messages[0],m=>m.version='2.0');
bad('raw RNG in snapshot',decisions[0],m=>m.payload.snapshot.rng=123);
bad('undeclared snapshot entity field',decisions[0],m=>m.payload.snapshot.entities=[{id:'p0',type:'player',label:'Player',fields:[{name:'futureDice',value:[6,6]}]}]);
bad('score bypass on wire',messages.find(m=>m.type==='control.input'),m=>m.payload.score=100);
bad('legacy answer blob',messages.find(m=>m.type==='action.submit'),m=>m.payload.answer={deposit:100});
bad('negative cursor',messages.find(m=>m.type==='events.ack'),m=>m.payload.cursor=-1);
bad('continuous decision with paused clock',decisions.find(m=>m.payload.mode==='continuous'),m=>m.payload.clock='paused');
bad('unknown decision',decisions[0],m=>m.payload.kind='new-unclassified-question');
bad('bad timestamp',messages[0],m=>m.sentAt='yesterday');
bad('bad viewport',decisions[0],m=>m.payload.snapshot.viewport.center=[1]);
writeFileSync(new URL('examples/invalid.json',root),JSON.stringify(invalid,null,2)+'\n');
