// تحديث تلقائي لنتائج كأس العالم 2026
// يشتغل كل يوم الساعة 12 ظهراً (UTC+3)

const https = require('https');

const FB_SECRET  = process.env.FIREBASE_SECRET;
const FD_API_KEY = process.env.FD_API_KEY; // football-data.org key
const FB_HOST    = 'world-cup-5be29-default-rtdb.firebaseio.com';

// World Cup 2026 competition ID on football-data.org
const WC_ID = 2000;

function fetchFD(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.football-data.org',
      path: `/v4${path}`,
      headers: { 'X-Auth-Token': FD_API_KEY }
    };
    https.get(options, res => {
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
      path: `${path}.json?auth=${FB_SECRET}`,
      headers: { 'Accept': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
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

// ترجمة الأسماء
const EN_TO_AR = {
  'Mexico':'المكسيك','South Africa':'جنوب أفريقيا','Korea Republic':'كوريا الجنوبية','Czechia':'تشيكيا',
  'Canada':'كندا','Bosnia and Herzegovina':'البوسنة والهرسك','Qatar':'قطر','Switzerland':'سويسرا',
  'Brazil':'البرازيل','Morocco':'المغرب','Haiti':'هايتي','Scotland':'إسكتلندا',
  'United States':'أمريكا','USA':'أمريكا','Paraguay':'باراغواي','Australia':'أستراليا','Türkiye':'تركيا','Turkey':'تركيا',
  'Germany':'ألمانيا','Curaçao':'كوراساو','Ivory Coast':'كوت ديفوار','Ecuador':'الإكوادور',
  'Netherlands':'هولندا','Japan':'اليابان','Sweden':'السويد','Tunisia':'تونس',
  'Belgium':'بلجيكا','Egypt':'مصر','Iran':'إيران','New Zealand':'نيوزيلندا',
  'Spain':'إسبانيا','Cape Verde':'كابو فيردي','Uruguay':'أوروغواي','Saudi Arabia':'السعودية',
  'France':'فرنسا','Senegal':'السنغال','Norway':'النرويج','Iraq':'العراق',
  'Argentina':'الأرجنتين','Algeria':'الجزائر','Austria':'النمسا','Jordan':'الأردن',
  'Portugal':'البرتغال','Congo DR':'الكونغو','Uzbekistan':'أوزبكستان','Colombia':'كولومبيا',
  'England':'إنجلترا','Croatia':'كرواتيا','Ghana':'غانا','Panama':'بنما',
};

function toAr(name) {
  if (!name) return null;
  if (EN_TO_AR[name]) return EN_TO_AR[name];
  for (const [en, ar] of Object.entries(EN_TO_AR)) {
    if (name.toLowerCase().includes(en.toLowerCase())) return ar;
  }
  return name;
}

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
  console.log('🏆 تحديث نتائج كأس العالم 2026 - ' + new Date().toISOString());

  // جلب ترتيب المجموعات
  console.log('جلب ترتيب المجموعات...');
  const standingsData = await fetchFD(`/competitions/${WC_ID}/standings`);
  
  let results = await fbGet('/preds/_results') || { order:{}, best3:[], bracket:{} };
  if (!results.order) results.order = {};
  if (!results.best3) results.best3 = [];
  if (!results.bracket) results.bracket = {};

  if (standingsData.standings) {
    standingsData.standings.forEach(group => {
      const gId = group.group?.replace('GROUP_','');
      if (!gId) return;
      const sorted = [...group.table]
        .sort((a,b) => b.points-a.points || b.goalDifference-a.goalDifference || b.goalsFor-a.goalsFor)
        .map(row => toAr(row.team?.name));
      results.order[gId] = sorted.filter(Boolean);
    });
    console.log('✅ تم تحديث ترتيب المجموعات');
  }

  // جلب نتائج المباريات الإقصائية
  console.log('جلب نتائج الإقصائي...');
  const matchesData = await fetchFD(`/competitions/${WC_ID}/matches?stage=ROUND_OF_32,ROUND_OF_16,QUARTER_FINALS,SEMI_FINALS,FINAL`);
  
  const stageMap = {
    'ROUND_OF_32':'r32','ROUND_OF_16':'r16',
    'QUARTER_FINALS':'qf','SEMI_FINALS':'sf','FINAL':'fin'
  };

  if (matchesData.matches) {
    matchesData.matches.forEach((m, idx) => {
      if (m.status !== 'FINISHED') return;
      const rKey = stageMap[m.stage];
      if (!rKey) return;
      const hs = m.score?.fullTime?.home;
      const as_ = m.score?.fullTime?.away;
      if (hs == null || as_ == null) return;
      const home = toAr(m.homeTeam?.name);
      const away = toAr(m.awayTeam?.name);
      const winner = hs > as_ ? home : away;
      if (winner) results.bracket[`${rKey}_${idx%16}`] = winner;
    });
    console.log('✅ تم تحديث نتائج الإقصائي');
  }

  await fbSet('/preds/_results', results);
  await calcScores(results);
  await fbSet('/preds/_lastUpdate', new Date().toISOString());
  console.log('✅ اكتمل التحديث!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
