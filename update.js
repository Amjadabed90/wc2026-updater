// تحديث تلقائي لنتائج كأس العالم 2026
const https = require('https');

const FB_SECRET  = process.env.FIREBASE_SECRET;
const AF_KEY     = process.env.AF_API_KEY; // api-football.com key
const FB_HOST    = 'world-cup-5be29-default-rtdb.firebaseio.com';

// World Cup 2026 league ID on api-football.com
const WC_LEAGUE = 1;
const WC_SEASON = 2026;

function fetchAF(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'v3.football.api-sports.io',
      path: path,
      headers: { 'x-apisports-key': AF_KEY }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('parse: ' + d.slice(0,100))); }
      });
    }).on('error', reject);
  });
}

function fbGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: FB_HOST,
      path: `${path}.json?auth=${FB_SECRET}`
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try{resolve(JSON.parse(d));}catch(e){resolve(null);} });
    }).on('error', reject);
  });
}

function fbSet(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: FB_HOST,
      path: `${path}.json?auth=${FB_SECRET}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function fbUpdate(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: FB_HOST,
      path: `/.json?auth=${FB_SECRET}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

const EN_AR = {
  'Mexico':'المكسيك','South Africa':'جنوب أفريقيا','South Korea':'كوريا الجنوبية','Czech Republic':'تشيكيا',
  'Canada':'كندا','Bosnia':'البوسنة','Qatar':'قطر','Switzerland':'سويسرا',
  'Brazil':'البرازيل','Morocco':'المغرب','Haiti':'هايتي','Scotland':'إسكتلندا',
  'USA':'أمريكا','United States':'أمريكا','Paraguay':'باراغواي','Australia':'أستراليا','Turkey':'تركيا',
  'Germany':'ألمانيا','Curacao':'كوراساو','Ivory Coast':'كوت ديفوار','Ecuador':'الإكوادور',
  'Netherlands':'هولندا','Japan':'اليابان','Sweden':'السويد','Tunisia':'تونس',
  'Belgium':'بلجيكا','Egypt':'مصر','Iran':'إيران','New Zealand':'نيوزيلندا',
  'Spain':'إسبانيا','Cape Verde':'كابو فيردي','Uruguay':'أوروغواي','Saudi Arabia':'السعودية',
  'France':'فرنسا','Senegal':'السنغال','Norway':'النرويج','Iraq':'العراق',
  'Argentina':'الأرجنتين','Algeria':'الجزائر','Austria':'النمسا','Jordan':'الأردن',
  'Portugal':'البرتغال','Congo DR':'الكونغو','Uzbekistan':'أوزبكستان','Colombia':'كولومبيا',
  'England':'إنجلترا','Croatia':'كرواتيا','Ghana':'غانا','Panama':'بنما',
};
function toAr(n){ if(!n)return null; if(EN_AR[n])return EN_AR[n]; for(const[e,a]of Object.entries(EN_AR)){if(n.toLowerCase().includes(e.toLowerCase()))return a;} return n; }

async function calcScores(results) {
  const preds = await fbGet('/preds');
  if (!preds) return;
  const GD_IDS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  const updates = {};
  for (const [name, d] of Object.entries(preds)) {
    if (name.startsWith('_')) continue;
    let pts = 0, cor = 0;
    GD_IDS.forEach(gId => {
      const predO = d.order?.[gId] || [];
      const realO = results.order?.[gId] || [];
      realO.forEach((n, i) => { if (predO[i] === n) { pts++; cor++; } });
    });
    const pb = d.best3 || [], rb = results.best3 || [];
    pb.forEach(n => { if (rb.includes(n)) { pts++; cor++; } });
    const pbrkt = d.bracket || {}, rbrkt = results.bracket || {};
    Object.entries(rbrkt).forEach(([k,v]) => { if (pbrkt[k] === v) { pts++; cor++; } });
    updates[`preds/${name}/_points`] = pts;
    updates[`preds/${name}/_correct`] = cor;
  }
  if (Object.keys(updates).length > 0) await fbUpdate(updates);
  console.log(`✅ تم تحديث ${Object.keys(updates).length/2} مشترك`);
}

async function main() {
  console.log('🏆 تحديث كأس العالم 2026 - ' + new Date().toISOString());

  let results = await fbGet('/preds/_results') || { order:{}, best3:[], bracket:{} };
  if (!results.order) results.order = {};
  if (!results.best3) results.best3 = [];
  if (!results.bracket) results.bracket = {};

  // 1. جلب ترتيب المجموعات
  console.log('جلب ترتيب المجموعات...');
  try {
    const stData = await fetchAF(`/standings?league=${WC_LEAGUE}&season=${WC_SEASON}`);
    const standings = stData.response?.[0]?.league?.standings;
    if (standings) {
      const displayStandings = {};
      standings.forEach(group => {
        if (!Array.isArray(group)) return;
        const gId = group[0]?.group?.replace('Group ','');
        if (!gId) return;
        displayStandings[gId] = group.map(t => ({
          pos: t.rank, name: t.team?.name,
          played: t.all?.played, won: t.all?.win,
          draw: t.all?.draw, lost: t.all?.lose,
          gd: t.goalsDiff, pts: t.points
        }));
        results.order[gId] = group.map(t => toAr(t.team?.name)).filter(Boolean);
      });
      await fbSet('/display/standings', displayStandings);
      console.log('✅ ترتيب المجموعات محدّث');
    }
  } catch(e) { console.log('خطأ ترتيب:', e.message); }

  // 2. جلب نتائج المباريات
  console.log('جلب نتائج المباريات...');
  try {
    const mData = await fetchAF(`/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}&status=FT-HT-1H-2H-ET-P`);
    const matches = mData.response || [];
    console.log(`تم جلب ${matches.length} مباراة`);

    const displayMatches = matches.map(m => ({
      home: m.teams?.home?.name, away: m.teams?.away?.name,
      hs: m.goals?.home, as: m.goals?.away,
      status: m.fixture?.status?.short,
      stage: m.league?.round, matchday: m.league?.round,
      date: m.fixture?.date, group: m.league?.round
    }));
    await fbSet('/display/matches', displayMatches);

    // الإقصائي
    const roundMap = {'Round of 32':'r32','Round of 16':'r16','Quarter-finals':'qf','Semi-finals':'sf','Final':'fin'};
    matches.forEach((m, idx) => {
      if (m.fixture?.status?.short !== 'FT') return;
      const rKey = roundMap[m.league?.round];
      if (!rKey) return;
      const home = toAr(m.teams?.home?.name);
      const away = toAr(m.teams?.away?.name);
      const hs = m.goals?.home, as_ = m.goals?.away;
      if (hs == null || as_ == null) return;
      const winner = hs > as_ ? home : away;
      if (winner) results.bracket[`${rKey}_${idx%16}`] = winner;
    });
    console.log('✅ نتائج المباريات محدّثة');
  } catch(e) { console.log('خطأ مباريات:', e.message); }

  await fbSet('/preds/_results', results);
  await calcScores(results);
  await fbSet('/preds/_lastUpdate', new Date().toISOString());
  console.log('✅ اكتمل التحديث!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
