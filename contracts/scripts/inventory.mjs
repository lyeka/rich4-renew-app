// Source audit: includes runtime `as never` questions, not only the declared Ask union.
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const core = fileURLToPath(new URL('../../game/src/core/', import.meta.url));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`)
    : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [`${dir}/${e.name}`] : []);
}
function unwrap(n) {
  while (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression;
  return n;
}
function literal(object, key) {
  const p = object.properties.find(p => p.name?.getText() === key);
  return p && ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer) ? p.initializer.text : undefined;
}
export function inventory() {
  const emitted = new Map(), declared = new Set();
  for (const path of files(core)) {
    const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(n) {
      if (ts.isTypeAliasDeclaration(n) && n.name.text === 'Ask') {
        function typeVisit(x) {
          if (ts.isPropertySignature(x) && x.name.getText() === 't' && ts.isLiteralTypeNode(x.type)) declared.add(x.type.literal.text);
          ts.forEachChild(x, typeVisit);
        }
        typeVisit(n.type);
      }
      if (ts.isCallExpression(n) && n.expression.getText() === 'ask') {
        const arg = unwrap(n.arguments[0]);
        if (!ts.isObjectLiteralExpression(arg)) throw Error(`Unclassified ask at ${path}: ${n.getText()}`);
        const t = literal(arg, 't');
        const kind = t === 'casino' ? `${t}.${literal(arg, 'phase')}` : t;
        if (!kind || kind.includes('undefined')) throw Error(`Dynamic ask needs manual inventory: ${n.getText()}`);
        const sources = emitted.get(kind) ?? new Set();
        sources.add(`game/src/core/${path.slice(core.length)}`);
        emitted.set(kind, sources);
      }
      ts.forEachChild(n, visit);
    }
    visit(src);
  }
  return { declared: [...declared].sort(), emitted: Object.fromEntries([...emitted].sort().map(([k,v]) => [k,[...v].sort()])) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(inventory(), null, 2) + '\n');
