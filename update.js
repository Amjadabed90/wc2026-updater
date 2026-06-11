// ══════════════════════════════════════════════
//  تحديث تلقائي لنتائج كأس العالم 2026
//  يشتغل كل يوم الساعة 12 ظهراً (UTC+3)
// ══════════════════════════════════════════════

const https = require('https');

// ── إعدادات Firebase ──
const FB_DB_URL  = process.env.FIREBASE_DB_URL;   // من Secrets
const FB_SECRET  = process.env.FIREBASE_SECRET;   // من Secrets

// ── API كأس العالم المجاني ──
const WC_API = 'worldcup26.ir';

// ── دالة fetch بسيطة ──
function get(host, path) {
  return new Promise((resolve, reject) => {
    const options = { hostname: host, path, method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'wc2026-updater' } };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Firebase REST ──
function fbGet(path) {
  return get('world-cup-5be29-default-rtdb.firebaseio.com',
    `${path}.json?auth=${FB_SECRET}`);
}

function fbSet(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'world-cup-5be29-default-rtdb.firebaseio.com',
      path: `${path}.json?auth=${FB_SECRET}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function fbUpdate(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'world-cup-5be29-default-rtdb.firebaseio.com',
      path: `/.json?auth=${FB_SECRET}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── ترجمة أسماء المنتخبات من عربي لإنجليزي ──
const TEAM_MAP = {
  'المكسيك':'Mexico','جنوب أفريقيا':'South Africa','كوريا الجنوبية':'South Korea','تشيكيا':'Czech Republic',
  'كندا':'Canada','البوسنة':'Bosnia and Herzegovina','قطر':'Qatar','سويسرا':'Switzerland',
  'أوروغواي':'Uruguay','نيوزيلندا':'New Zealand','بنما':'Panama','الجزائر':'Algeria',
  'أمريكا':'United States','باراغواي':'Paraguay','أستراليا':'Australia','تركيا':'Turkey',
  'إسبانيا':'Spain','البرازيل':'Brazil','اليابان':'Japan','هايتي':'Haiti',
  'فرنسا':'France','نيجيريا':'Nigeria','السعودية':'Saudi Arabia','أوزبكستان':'Uzbekistan',
  'البرتغال':'Portugal','الأرجنتين':'Argentina','المغرب':'Morocco','كابو فيردي':'Cape Verde',
  'ألمانيا':'Germany','الأردن':'Jordan','كولومبيا':'Colombia','النرويج':'Norway',
  'إنجلترا':'England','إيران':'Iran','السنغال':'Senegal','كرواتيا':'Croatia',
  'بلجيكا':'Belgium','غانا':'Ghana','العراق':'Iraq','إسكتلندا':'Scotland',
  'هولندا':'Netherlands','السويد':'Sweden','كوت ديفوار':'Ivory Coast','كوراساو':'Curacao',
  'النمسا':'Austria','الإكوادور':'Ecuador','مصر':'Egypt','تشيلي':'Chile',
};

// عكس الخريطة
const TEAM_MAP_REV = {};
for (const [ar, en] of Object.entries(TEAM_MAP)) TEAM_MAP_REV[en] = ar;
// أيضاً اسماء بديلة شائعة
TEAM_MAP_REV['USA'] = 'أمريكا';
TEAM_MAP_REV['Korea Republic'] = 'كوريا الجنوبية';
TEAM_MAP_REV['Czechia'] = 'تشيكيا';
TEAM_MAP_REV['Bosnia & Herzegovina'] = 'البوسنة';
TEAM_MAP_REV['IR Iran'] = 'إيران';
TEAM_MAP_REV['Côte d\'Ivoire'] = 'كوت ديفوار';

function toAr(enName) {
  if (!enName) return null;
  if (TEAM_MAP_REV[enName]) return TEAM_MAP_REV[enName];
  // بحث جزئي
  for (const [en, ar] of Object.entries(TEAM_MAP_REV)) {
    if (enName.toLowerCase().includes(en.toLowerCase()) ||
        en.toLowerCase().includes(enName.toLowerCase())) return ar;
  }
  return enName; // إرجاع الاسم كما هو إذا لم يوجد
}

// ── حساب النقاط ──
async function calcScores(results) {
  console.log('حساب نقاط المشتركين...');
  const preds = await fbGet('/preds');
  if (!preds) { console.log('لا توجد توقعات'); return; }

  const GD_IDS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  const updates = {};
  let updated = 0;

  for (const [name, d] of Object.entries(preds)) {
    if (name === '_results') continue;
    let pts = 0, cor = 0;

    // ترتيب المجموعات
    GD_IDS.forEach(gId => {
      const predO = d.order?.[gId] || [];
      const realO = results.order?.[gId] || [];
      realO.forEach((n, i) => { if (predO[i] === n) { pts++; cor++; } });
    });

    // أفضل الثالث
    const pb = d.best3 || [], rb = results.best3 || [];
    pb.forEach(n => { if (rb.includes(n)) { pts++; cor++; } });

    // البراكت
    const pbrkt = d.bracket || {}, rbrkt = results.bracket || {};
    Object.entries(rbrkt).forEach(([k,v]) => { if (pbrkt[k] === v) { pts++; cor++; } });

    updates[`preds/${name}/_points`] = pts;
    updates[`preds/${name}/_correct`] = cor;
    updated++;
  }

  if (Object.keys(updates).length > 0) {
    await fbUpdate(updates);
    console.log(`✅ تم تحديث ${updated} مشترك`);
  }
}

// ── الدالة الرئيسية ──
async function main() {
  console.log('🏆 بدء تحديث نتائج كأس العالم 2026...');
  console.log('الوقت:', new Date().toISOString());

  try {
    // 1. جلب المباريات المنتهية
    console.log('جلب النتائج من API...');
    let matchList = [];
    try {
      const resp = await get(WC_API, '/get/games');
      const raw = resp.data || resp;
      matchList = Array.isArray(raw) ? raw : [];
      console.log(`تم جلب ${matchList.length} مباراة`);
    } catch(e) {
      console.log('تعذر جلب المباريات:', e.message);
    }

    // 2. جلب النتائج الحالية من Firebase
    let results = await fbGet('/preds/_results') || { order:{}, best3:[], bracket:{} };
    if (!results.order) results.order = {};
    if (!results.best3) results.best3 = [];
    if (!results.bracket) results.bracket = {};

    // 3. جلب ترتيب المجموعات
    let standings;
    try {
      standings = await get(WC_API, '/get/groups');
      const stData = standings.data || standings;

      if (Array.isArray(stData)) {
        stData.forEach(group => {
          const gId = group.name?.replace('Group ','') || group.id;
          if (!gId) return;
          const teams = group.teams || group.standings || [];
          // ترتب حسب الموقع
          const sorted = [...teams].sort((a,b) => (a.position||a.rank||99) - (b.position||b.rank||99));
          results.order[gId] = sorted.map(t => toAr(t.team?.name || t.name)).filter(Boolean);
        });
        console.log('✅ تم تحديث ترتيب المجموعات');
      }
    } catch(e) {
      console.log('تعذر جلب ترتيب المجموعات:', e.message);
    }

    // 4. معالجة نتائج المباريات الإقصائية
    const roundMap = {
      'Round of 32': 'r32', 'Round of 16': 'r16',
      'Quarter-finals': 'qf', 'Semi-finals': 'sf', 'Final': 'fin',
      'Dor 32': 'r32', 'Dor 16': 'r16',
    };

    let bracketUpdates = 0;
    matchList.forEach((m, idx) => {
      const round = m.round || m.stage || m.phase || '';
      const rKey = roundMap[round];
      if (!rKey) return; // مباراة مجموعات، تجاهل

      const status = m.status || m.state || '';
      if (!['finished','FT','ended','completed'].includes(status.toLowerCase())) return;

      const home = toAr(m.home_team?.name || m.homeTeam?.name || m.team1);
      const away = toAr(m.away_team?.name || m.awayTeam?.name || m.team2);
      const homeScore = m.home_score ?? m.score?.home ?? m.goals?.home;
      const awayScore = m.away_score ?? m.score?.away ?? m.goals?.away;

      if (homeScore == null || awayScore == null) return;

      const winner = homeScore > awayScore ? home :
                     awayScore > homeScore ? away : null; // null = تعادل (لا يحدث في إقصائي)

      if (winner) {
        const matchKey = `${rKey}_${idx % 16}`;
        results.bracket[matchKey] = winner;
        bracketUpdates++;
      }
    });

    console.log(`تم تحديث ${bracketUpdates} مباراة إقصائية`);

    // 5. حفظ النتائج في Firebase
    await fbSet('/preds/_results', results);
    console.log('✅ تم حفظ النتائج في Firebase');

    // 6. حساب نقاط الجميع
    await calcScores(results);

    // 7. تسجيل وقت آخر تحديث
    await fbSet('/preds/_lastUpdate', new Date().toISOString());
    console.log('✅ اكتمل التحديث بنجاح!');

  } catch(e) {
    console.error('❌ خطأ:', e.message);
    process.exit(1);
  }
}

main();
