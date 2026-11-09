import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync(new URL('../schemas/protocol.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
function requireThat(ok, message) { if (!ok) throw new Error(message); }
export function assertMessage(message) {
  requireThat(validate(message), `Invalid protocol message: ${ajv.errorsText(validate.errors)}`);
  return message;
}
// Semantic checks are separate from wire validation. Neither proves information visibility or game legality.
export function assertActions(actions) {
  requireThat(new Set(actions.map(a => a.id)).size === actions.length, 'Duplicate action ID');
  for (const a of actions) {
    requireThat(new Set(a.parameters.map(p => p.name)).size === a.parameters.length, 'Duplicate parameter');
    for (const p of a.parameters) {
      if (p.minimum !== undefined && p.maximum !== undefined) requireThat(p.minimum <= p.maximum, 'Inverted bounds');
      if (p.type === 'integer-list') requireThat(p.minItems <= p.maxItems && p.maxItems <= 256, 'Invalid list bounds');
      if (p.choices) {
        requireThat(p.choices.length > 0 && new Set(p.choices).size === p.choices.length, 'Invalid choices');
        for (const value of p.choices) checkParameter({ ...p, choices: undefined }, value);
      }
    }
  }
}
function checkParameter(p, v) {
  if (p.type === 'integer-list') {
    requireThat(Array.isArray(v) && v.length >= p.minItems && v.length <= p.maxItems, 'Invalid list length');
    requireThat(!p.uniqueItems || new Set(v).size === v.length, 'Duplicate list item');
    for (const n of v) requireThat(Number.isSafeInteger(n) && n >= p.minimum && n <= p.maximum, 'Invalid list item');
  } else if (p.type === 'integer' || p.type === 'number') {
    requireThat(typeof v === 'number' && Number.isFinite(v) && (p.type !== 'integer' || Number.isSafeInteger(v)), 'Invalid number');
    requireThat((p.minimum === undefined || v >= p.minimum) && (p.maximum === undefined || v <= p.maximum), 'Outside bounds');
    if (p.multipleOf !== undefined) requireThat(Math.abs(v / p.multipleOf - Math.round(v / p.multipleOf)) < 1e-8, 'Invalid step');
  } else if (p.type === 'string') requireThat(typeof v === 'string' && [...v].length <= p.maxLength, 'Invalid string');
  else requireThat(typeof v === 'boolean', 'Invalid boolean');
  if (p.choices) requireThat(p.choices.includes(v), 'Not a permitted choice');
}
export function assertEventBatch(batch) {
  requireThat(batch.toCursor === batch.fromCursor + batch.items.length, 'Cursor must count only visible events');
  requireThat(new Set(batch.items.map(e => e.eventId)).size === batch.items.length, 'Duplicate event');
  batch.items.forEach((e, i) => requireThat(e.sequence === batch.fromCursor + i + 1, 'Event sequence gap'));
}
// open is the host's *current* decision.open envelope, updated after decision.update.
// Run only after checking the request-ID ledger: a retry after closure must return its previous receipt.
export function assertInput(open, input) {
  assertMessage(open); assertMessage(input);
  requireThat(open.type === 'decision.open', 'Expected current decision');
  requireThat(['action.submit', 'control.input'].includes(input.type), 'Expected input');
  for (const k of ['gameId', 'epochId', 'seatId']) requireThat(open[k] === input[k], 'Wrong binding');
  const d = open.payload, c = input.payload;
  requireThat(d.mode !== 'administrative', 'Administrative decision belongs to host control plane');
  requireThat(d.decisionId === c.decisionId && d.revision === c.revision, 'Stale decision');
  assertActions(d.actions);
  const a = d.actions.find(a => a.id === c.actionId);
  requireThat(a, 'Illegal action');
  requireThat(a.channel === (input.type === 'action.submit' ? 'answer' : 'control'), 'Wrong input channel');
  requireThat(d.mode !== 'continuous' || a.channel === 'control', 'Continuous answers are host-owned');
  // This initial contract conservatively rejects all controls based on an obsolete view.
  if (input.type === 'control.input') requireThat(c.observedViewId === d.snapshot.viewId, 'Stale view');
  requireThat(Object.keys(c.arguments).every(k => a.parameters.some(p => p.name === k)), 'Unknown argument');
  for (const p of a.parameters) {
    requireThat(!p.required || Object.hasOwn(c.arguments, p.name), 'Missing argument');
    if (Object.hasOwn(c.arguments, p.name)) checkParameter(p, c.arguments[p.name]);
  }
  return input;
}
