/* THE SITE HAS ONE LOOK, AND IT CAN BE TAKEN OFF IN ONE PLACE. AN ACCOUNT'S OWN THEME TOUCHES NOBODY ELSE.
 *
 *   THE SITE'S LOOK
 *     ONE MARK, ONE FILE        index.html marks the page data-look="<name>" and
 *                               loads /theme/site/theme.css, after every style
 *                               of its own, so the look is in place at first paint
 *     EVERY RULE NAMES THE MARK each selector in that file (and in pages.css, the
 *                               work in progress beside it) starts
 *                               html[data-look=<name>]: take the attribute off
 *                               <html> and not one rule applies
 *     NOTHING NAMES AN ACCOUNT  no rule in it is written against data-me, so the
 *                               look is the same for everyone
 *     THE FILES EXIST           every picture it points at, and the service worker
 *                               keeps the stylesheet with the rest of the shell
 *
 *   AN ACCOUNT'S OWN THEME (none at the moment; the way in is kept)
 *     BOTH LISTS AGREE          the head of index.html and ME_THEMES in app.js
 *                               name the same accounts and files
 *     EVERY RULE NAMES THE ACCOUNT  html[data-me=<account>], so the file cannot
 *                               restyle anyone else's page
 *
 * Run: node scripts/test-metheme.mjs
 */
import fs from 'node:fs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const here = p => new URL(p, import.meta.url);
const read = p => fs.readFileSync(here(p), 'utf8').split(String.fromCharCode(13)).join('');
const app = read('../public/app.js'), idx = read('../public/index.html'), sw = read('../public/sw.js');

/* every selector of every rule, with comments and at-rule wrappers taken off. A comma inside brackets (an :is() list,
   a :not() list, however deep) belongs to its selector and is not a split. */
function splitTop(sel) {
  const out = []; let d = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}
function selectors(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0, depth = 0, start = 0, inKeyframes = 0;
  for (; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      const head = css.slice(start, i).trim();
      if (depth === inKeyframes && /^@(-webkit-)?keyframes/.test(head)) inKeyframes = depth + 1;
      else if (head[0] === '@') { /* @media and friends: the rules inside are checked on their own */ }
      else if (!inKeyframes || depth < inKeyframes) out.push(...splitTop(head));
      depth++; start = i + 1;
    } else if (c === '}') { depth--; if (inKeyframes && depth < inKeyframes) inKeyframes = 0; start = i + 1; }
    else if (c === ';' && depth === 0) start = i + 1;          // @import
  }
  return out;
}
const pictures = css => [...new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\((\/theme\/[^)'"]+)\)/g)].map(m => m[1]))];

/* ── the site's look ── */
console.log('the site\'s look');
const mark = (idx.match(/<html[^>]*\sdata-look="([a-z0-9-]+)"/) || [])[1] || '';
ok('index.html marks the page with a look', mark !== '', true);
const linkAt = idx.indexOf('<link rel="stylesheet" id="site-look" href="/theme/site/theme.css">');
ok('index.html loads /theme/site/theme.css', linkAt > 0, true);
ok('after the last of its own styles, inside the head', linkAt > idx.lastIndexOf('</style>') && linkAt < idx.indexOf('</head>'), true);
ok('the service worker keeps it with the shell', sw.includes("'/theme/site/theme.css'"), true);
const scope = 'html[data-look=' + mark + ']';
for (const f of ['theme.css', 'pages.css']) {
  const file = '../public/theme/site/' + f;
  ok(f + ' is there', fs.existsSync(here(file)), true);
  if (!fs.existsSync(here(file))) continue;
  const css = read(file), sels = selectors(css);
  if (f === 'theme.css') ok('it has rules at all', sels.length > 200, true);
  ok(f + ': every selector starts with ' + scope, sels.filter(s => !s.startsWith(scope)).slice(0, 5), []);
  ok(f + ': no rule is written against an account', sels.filter(s => /data-me/.test(s)).slice(0, 5), []);
  ok(f + ': every picture it points at exists', pictures(css).filter(a => !fs.existsSync(here('../public' + a))), []);
  ok(f + ': it pulls in no stylesheet of its own (fonts ride on index.html\'s one request)', /@import/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), false);
}
ok('the two faces the look adds are in index.html\'s font request', /fonts\.googleapis\.com\/css2\?[^"]*family=Cardo[^"]*family=JetBrains\+Mono/.test(idx), true);

/* ── an account's own theme ── */
console.log(NL + 'an account\'s own theme');
const listApp = (app.match(/const ME_THEMES=\{([^}]*)\};/) || [null, null])[1];
const listIdx = (idx.match(/var T=\{([^}]*)\}/) || [null, null])[1];
const pairs = s => [...(s || '').matchAll(/(\w+):'([^']+)'/g)].map(m => [m[1], m[2]]);
ok('app.js still has the list (ME_THEMES)', listApp !== null, true);
ok('index.html\'s head still has its copy (T)', listIdx !== null, true);
const themes = pairs(listApp);
ok('both name the same themes, at the same paths', pairs(listIdx), themes);
for (const [acct, path] of themes) {
  console.log(NL + acct + ' (' + path + ')');
  const file = '../public' + path;
  ok('the stylesheet is there', fs.existsSync(here(file)), true);
  if (!fs.existsSync(here(file))) continue;
  const css = read(file), sels = selectors(css);
  const own = 'html[data-me=' + acct + ']';
  ok('every selector starts with ' + own + ', so nobody else is restyled', sels.filter(s => !s.startsWith(own)).slice(0, 5), []);
  ok('every picture it points at exists', pictures(css).filter(a => !fs.existsSync(here('../public' + a))), []);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
