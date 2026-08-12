/* Paste this once into a new Scriptable script named "GFL". It downloads the
   real widget each run (with a cached copy for offline), so any changes to the
   widget land on your phone automatically. */
const URL_ = 'https://gfl-dashboard.vercel.app/widget/gfl-widget.js';
const fm = FileManager.local();
const path = fm.joinPath(fm.cacheDirectory(), 'gfl-widget-src.js');
let src = null;
try { src = await new Request(`${URL_}?t=${Date.now()}`).loadString(); fm.writeString(path, src); }
catch (e) { if (fm.fileExists(path)) src = fm.readString(path); }
if (!src) { const w = new ListWidget(); w.addText('GFL widget offline'); Script.setWidget(w); Script.complete(); }
else await eval(`(async () => { ${src} })()`);
