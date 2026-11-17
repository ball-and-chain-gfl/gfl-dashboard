/* A THEME IS ONE ACCOUNT'S, AND NOBODY ELSE'S.
 *
 *   EVERY RULE NAMES THE ACCOUNT   each selector in a theme file is written
 *                                  against html[data-me=<account>], so the
 *                                  file cannot restyle anyone else's page
 *   BOTH LISTS AGREE               the head of index.html (which loads a
 *                                  theme before the first paint) and
 *                                  ME_THEMES in app.js name the same files
 *   THE FILES EXIST                and so does every asset a theme points at
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
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const app = read('../public/app.js'), idx = read('../public/index.html');

const listApp = (app.match(/const ME_THEMES=\{([^}]*)\};/) || [])[1] || '';
const listIdx = (idx.match(/var T=\{([^}]*)\}/) || [])[1] || '';
const pairs = s => [...s.matchAll(/(\w+):'([^']+)'/g)].map(m => [m[1], m[2]]);
const themes = pairs(listApp);
ok('app.js names at least one theme', themes.length > 0, true);
ok('index.html\'s head names the same themes, at the same paths', pairs(listIdx), themes);

/* every selector of every rule, with comments and at-rule wrappers taken off */
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
      else if (!inKeyframes || depth < inKeyframes) out.push(...head.split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean));
      depth++; start = i + 1;
    } else if (c === '}') { depth--; if (inKeyframes && depth < inKeyframes) inKeyframes = 0; start = i + 1; }
    else if (c === ';' && depth === 0) start = i + 1;          // @import
  }
  return out;
}

for (const [acct, path] of themes) {
  console.log(NL + acct + ' (' + path + ')');
  const file = '../public' + path;
  ok('the stylesheet is there', fs.existsSync(new URL(file, import.meta.url)), true);
  if (!fs.existsSync(new URL(file, import.meta.url))) continue;
  const css = read(file), sels = selectors(css);
  const scope = 'html[data-me=' + acct + ']', alt = 'html.bx-sheet[data-me=' + acct + ']';
  const stray = sels.filter(s => !s.startsWith(scope) && !s.startsWith(alt));
  ok('it has rules at all', sels.length > 20, true);
  ok('every selector starts with ' + scope + ', so nobody else is restyled', stray.slice(0, 5), []);
  const assets = [...new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\((\/theme\/[^)'"]+)\)/g)].map(m => m[1]))];
  ok('every picture it points at exists', assets.filter(a => !fs.existsSync(new URL('../public' + a, import.meta.url))), []);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
