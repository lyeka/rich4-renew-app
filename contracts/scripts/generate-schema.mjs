// Canonical schema source. Commit the generated JSON; regenerate with npm run generate.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('decision-catalog.json', root)));
const ref = name => ({ $ref: `#/$defs/${name}` });
const str = { type: 'string', minLength: 1, maxLength: 4096 };
const id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_.:/-]+$' };
const uint = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const arr = (items, maxItems = 256) => ({ type: 'array', items, maxItems });
const en = (...values) => ({ type: 'string', enum: values });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const obj = (properties, optional = []) => ({ type: 'object', properties,
  required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false });
const primitive = { type: ['string', 'number', 'boolean', 'null'] };
const value = { anyOf: [primitive, arr(primitive, 256)] };
const datetime = { type: 'string', format: 'date-time' };
const scope = { decisionId: id, revision: id };
const command = { ...scope, requestId: id, actionId: id,
  arguments: { type: 'object', maxProperties: 16, propertyNames: { pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,63}$' }, additionalProperties: value } };
const code = en('invalid_input', 'illegal_action', 'stale_decision', 'stale_view', 'request_conflict',
  'wrong_binding', 'unsupported_version', 'unsupported_capability', 'not_found', 'budget_exceeded',
  'model_error', 'disconnected', 'internal_error', 'cancelled');

const defs = {
  parameter: { oneOf: ['integer', 'number', 'string', 'boolean', 'integer-list'].map(type => {
    const p = { name: id, description: str, type: { const: type }, required: { type: 'boolean' } };
    const optional = [];
    if (type === 'integer' || type === 'number') {
      Object.assign(p, { minimum: { type }, maximum: { type }, multipleOf: { type: 'number', exclusiveMinimum: 0 }, choices: arr({ type }) });
      optional.push('minimum', 'maximum', 'multipleOf', 'choices');
    } else if (type === 'string') {
      Object.assign(p, { maxLength: { type: 'integer', minimum: 1, maximum: 4096 }, choices: arr(str) });
      optional.push('choices');
    } else if (type === 'integer-list') {
      Object.assign(p, { minimum: uint, maximum: uint, minItems: uint, maxItems: uint, uniqueItems: { type: 'boolean' } });
    }
    return obj(p, optional);
  }) },
  action: obj({ id, channel: en('answer', 'control'), label: str, description: str, parameters: arr(ref('parameter'), 16) }),
  entity: obj({ id, type: en('player', 'property', 'map', 'stock', 'company', 'object', 'item', 'rule', 'interaction'), label: str,
    fields: arr(obj({ name: en('text', 'node', 'position', 'cash', 'bank', 'loan', 'dueDate', 'points',
      'cards', 'tools', 'owner', 'level', 'price', 'rent', 'buildCost', 'quantity', 'status', 'remainingMs',
      'reels', 'dice', 'phase', 'balance', 'stake', 'visibleCards', 'effect', 'rate', 'stockPrice', 'bounds',
      'inventoryCount', 'turn', 'map', 'path', 'legalTargets', 'creditLimit', 'boost',
      'wealth', 'stockValue', 'insurance', 'shares', 'companyCount', 'landCount', 'houseCount',
      'chainCount', 'facilityCount', 'lease', 'freeShares', 'god', 'life', 'character', 'city'), value }), 64) }),
  snapshot: obj({ viewId: id, observedAt: datetime, mapId: uint, phase: str, currentActor: uint,
    entities: arr(ref('entity')), viewport: obj({ width: { type: 'integer', minimum: 1 },
      height: { type: 'integer', minimum: 1 }, center: arr({ type: 'number' }, 2),
      zoom: { type: 'number', exclusiveMinimum: 0 }, canPan: { type: 'boolean' } }) }),
  event: obj({ eventId: id, sequence: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    kind: en('turn_started', 'moved', 'dice_rolled', 'property_bought', 'property_built', 'payment',
      'item_used', 'inventory_changed', 'bank_changed', 'points_changed', 'status_changed', 'market_changed',
      'public_notice', 'interaction_finished', 'bankrupt', 'day_changed', 'game_finished'),
    actor: nullable(uint), operationId: nullable(id), text: str, entities: arr(ref('entity')) }),
  events: obj({ fromCursor: uint, toCursor: uint, items: arr(ref('event'), 512), hasMore: { type: 'boolean' } }),
  error: obj({ code, message: str, retryable: { type: 'boolean' } }),
};
defs.snapshot.properties.viewport.properties.center.minItems = 2;
defs.decision = { oneOf: ['discrete', 'continuous', 'administrative'].map(mode => obj({
  ...scope, operationId: id, parentDecisionId: nullable(id),
  kind: en(...catalog.filter(c => c.mode === mode).map(c => c.kind)), mode: { const: mode },
  title: str, actions: arr(ref('action'), 512), snapshot: ref('snapshot'), events: ref('events'),
  deadlineAt: nullable(datetime),
  clock: { const: mode === 'continuous' ? 'realtime' : 'paused' },
})) };
defs.receipt = { oneOf: ['action', 'control'].flatMap(channel =>
  [channel === 'action' ? 'consumed' : 'applied', 'rejected', 'not_seen', 'unknown'].map(status =>
    obj({ requestId: id, decisionId: id, channel: { const: channel }, status: { const: status },
      error: status === 'rejected' ? ref('error') : { type: 'null' } }))) };

const payloads = {
  'host.hello': obj({ hostInstanceId: id, supportedVersions: arr({ const: '1.0' }, 1),
    capabilities: arr(en('discrete', 'continuous', 'administrative', 'event_history', 'viewport_control')) }),
  'agent.ready': obj({ selectedVersion: { const: '1.0' },
    capabilities: arr(en('discrete', 'continuous', 'administrative', 'event_history', 'viewport_control')) }),
  'decision.open': ref('decision'),
  'decision.update': obj({ ...scope, snapshot: ref('snapshot'), actions: arr(ref('action'), 512),
    events: ref('events'), deadlineAt: nullable(datetime) }),
  'query.request': obj({ ...scope, requestId: id, query: en('observation', 'entity', 'rules', 'events', 'legal_actions'),
    resourceId: nullable(id), afterCursor: nullable(uint), pageToken: nullable(id), limit: { type: 'integer', minimum: 1, maximum: 256 } }),
  'query.result': { oneOf: [
    obj({ ...scope, requestId: id, status: { const: 'ok' }, snapshot: nullable(ref('snapshot')),
      entities: arr(ref('entity')), actions: arr(ref('action'), 512), events: nullable(ref('events')), nextPageToken: nullable(id) }),
    obj({ ...scope, requestId: id, status: { const: 'rejected' }, error: ref('error') }),
  ] },
  'action.submit': obj(command),
  'action.result': { oneOf: [
    obj({ ...scope, requestId: id, status: { const: 'consumed' } }),
    obj({ ...scope, requestId: id, status: { const: 'rejected' }, error: ref('error') }),
  ] },
  'control.input': obj({ ...command, observedViewId: id }),
  'control.result': { oneOf: [
    obj({ ...scope, requestId: id, status: { const: 'applied' }, appliedAt: datetime, viewId: id }),
    obj({ ...scope, requestId: id, status: { const: 'rejected' }, error: ref('error') }),
  ] },
  'decision.closed': obj({ ...scope, operationId: id, reason: en('answered', 'finished', 'cancelled', 'timed_out', 'aborted'),
    acceptedRequestId: nullable(id), events: ref('events') }),
  'operation.result': obj({ operationId: id, status: en('completed', 'blocked', 'cancelled', 'failed'),
    summary: str, events: ref('events') }),
  'decision.cancel': obj({ ...scope, reason: en('state_changed', 'seat_changed', 'game_ended', 'save_loaded', 'host_shutdown') }),
  'run.failed': obj({ ...scope, error: ref('error') }),
  'events.batch': ref('events'),
  'events.ack': obj({ cursor: uint }),
  'sync.request': obj({ afterCursor: uint, pendingRequestIds: arr(id, 128), pendingOperationIds: arr(id, 128) }),
  'sync.result': obj({ hostInstanceId: id, historyStatus: en('complete', 'gap'),
    pendingDecision: nullable(ref('decision')), receipts: arr(ref('receipt'), 128),
    operations: arr(obj({ operationId: id, status: en('in_progress', 'completed', 'blocked', 'cancelled', 'failed', 'unknown'), summary: str }), 128),
    events: ref('events') }),
  'protocol.error': obj({ inReplyTo: nullable(id), error: ref('error') }),
};

const messages = Object.entries(payloads).map(([type, payload]) => obj({
  version: { const: '1.0' }, messageId: id, gameId: id, epochId: id, seatId: uint,
  type: { const: type }, sentAt: datetime, payload,
}));
export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rich4.local/contracts/protocol-1.0.schema.json',
  title: 'Rich4 player-agent protocol 1.0',
  description: 'Wire structure only. Binding, visibility, action legality and lifecycle are checked by the host.',
  oneOf: messages, $defs: defs,
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(new URL('schemas/', root), { recursive: true });
  writeFileSync(new URL('schemas/protocol.schema.json', root), JSON.stringify(schema, null, 2) + '\n');
}
