/* Freeze a finished season's data into /data so the app never asks ESPN for it
   again. Only seasons whose every scheduled game has been played are written —
   an in-progress season must keep going to the API. */
import fs from 'fs';
/* -- WHEN A WEEK IS OVER -----------------------------------------------------
 * ESPN's own word for it. `winner` reads "UNDECIDED" on every fixture until the
 * scoring period closes, and HOME/AWAY/TIE from then on. NOT "every fixture
 * holds a point": that is true from about ten past one on the Sunday, with the
 * late window, Sunday night and Monday night all still to come, and a third of
 * a week frozen into the repo is not something a later run undoes.
 * The release valve -- all scored AND a later week scoring -- is football
 * having moved on, which is proof enough if the flag never lands.
 * Mirrors weekOver in app.js. scripts/test-weeks.mjs holds the copies level. */
const wkDecided = m => ['HOME', 'AWAY', 'TIE'].includes(String((m && m.winner) || '').toUpperCase());
const wkScored = m => ((m.home && m.home.totalPoints) || 0) > 0 || ((m.away && m.away.totalPoints) || 0) > 0;
function weekOver(byWeek, w) {
  const g = byWeek[w];
  if (!g || !g.length) return false;
  if (g.every(wkDecided)) return true;
  if (!g.every(wkScored)) return false;
  return Object.keys(byWeek).some(k => Number(k) > Number(w) && byWeek[k].some(wkScored));
}

const BASE='https://gfl-dashboard.vercel.app/api/espn';
const OUT='C:/dev/gfl-dashboard/public/data';
const SEASONS=['2022','2023','2024','2025'];

const get=async(q)=>{
  for(let a=0;a<3;a++){
    try{
      const r=await fetch(`${BASE}?${q}`);
      if(r.ok) return await r.json();
      if(r.status>=500) { await new Promise(s=>setTimeout(s,1500)); continue; }
      return null;
    }catch(e){ await new Promise(s=>setTimeout(s,1500)); }
  }
  return null;
};

for(const season of SEASONS){
  /* completeness gate: read the archived schedule and check nothing is unplayed */
  const sf=`${OUT}/season-${season}.json`;
  if(!fs.existsSync(sf)){ console.log(season,'– no season file, skipped'); continue; }
  const meta=JSON.parse(fs.readFileSync(sf,'utf8'));
  const sched=(meta.schedule||[]).filter(m=>m&&m.home&&m.away&&(m.matchupPeriodId||0)>0);
  /* Decided, not merely scored. This writes a season into the repo for good, and
     "every fixture holds a point" is true from the Sunday lunchtime of the last
     week — which would freeze a final week Monday night had yet to finish. */
  const undecided=sched.filter(m=>!wkDecided(m));
  if(!sched.length||undecided.length){
    console.log(season,`– ${undecided.length} of ${sched.length} not settled yet, skipped`);
    continue;
  }
  const maxWk=Math.max(...sched.map(m=>m.matchupPeriodId||0));

  /* weekly player scores: the expensive one — 17 calls per page load */
  const wf=`${OUT}/weekly-${season}.json`;
  if(fs.existsSync(wf)) console.log(season,'– weekly already archived');
  else{
    const weeks={};
    for(let w=1;w<=maxWk;w++){
      const d=await get(`type=playerscores&seasonId=${season}&scoringPeriodId=${w}`);
      const p=(d&&d.players)||{};
      weeks[w]=p;
      process.stdout.write(`  ${season} wk${w}: ${Object.keys(p).length} players\r`);
    }
    const total=Object.values(weeks).reduce((a,w)=>a+Object.keys(w).length,0);
    if(total<100){ console.log(`\n${season} – only ${total} player rows, refusing to archive`); }
    else{
      fs.writeFileSync(wf,JSON.stringify({season,maxWeek:maxWk,savedAt:new Date().toISOString(),weeks}));
      console.log(`\n${season} – weekly-${season}.json written (${total} player rows, ${Math.round(fs.statSync(wf).size/1024)} KB)`);
    }
  }

  /* lineups + lineupiq: smaller, but they are per-season and never change again */
  for(const [type,q] of [['lineups',`type=lineups&seasonId=${season}`],
                         ['lineupiq',`type=lineupiq&seasonId=${season}&v=1`]]){
    const f=`${OUT}/${type}-${season}.json`;
    if(fs.existsSync(f)){ console.log(`${season} – ${type} already archived`); continue; }
    const d=await get(q);
    if(!d||typeof d!=='object'){ console.log(`${season} – ${type} unavailable, skipped`); continue; }
    fs.writeFileSync(f,JSON.stringify(d));
    console.log(`${season} – ${type}-${season}.json written (${Math.round(fs.statSync(f).size/1024)} KB)`);
  }
}
console.log('done');
