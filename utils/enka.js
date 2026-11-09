// Enka.Network から原神のプロフィールを取る
const UA = 'bot_chan/1.0 (discord bot)';
const RAW = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/';

const UI = 'https://enka.network/ui/';
// Enka lists Mannequin (ドール) forms as avatarId-elementVariant.
// API profile responses may use numeric base IDs.
const DOLL = { '10000117': 'MannequinBoy', '10000118': 'MannequinGirl' };
const uiPath = value => {
  if (!value || value === 'None') return null;
  let path = String(value);
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith('/ui/')) path = path.slice(4);
  return `${UI}${/\.(png|jpg|jpeg|webp)$/i.test(path) ? path : `${path}.png`}`;
};
const baseAvatarId = id => String(id).split('-')[0];


let nm = null, nmAt = 0;
let chr = {}, pfp = {}, namecards = {}, ja = {}, locs = {};
let relicSets = {}, relicItems = {};
const cache = new Map();  // uid -> { at, ttl, p, av, raw }

// キャラ名・アイコン・プロフィールアイコンのデータ（1日キャッシュ）
async function names() {
  if (nm && Date.now() - nmAt < 86400000) return nm;
  try {
    // 古いstoreは新キャラ・新武器が抜けてるので gi/ と合わせる（セット名は古い方にしか無い）
    const get = f => fetch(RAW + f).then(r => r.json()).catch(() => ({}));
    const [c0, c1, l0, l1, pf, relicData, nc0, nc1] = await Promise.all(['characters.json', 'gi/avatars.json', 'loc.json', 'gi/locs.json', 'pfps.json', 'gi/relics.json', 'namecards.json', 'gi/namecards.json'].map(get));
    namecards = { ...nc0, ...nc1 };
    relicSets = relicData.Sets || {};
    relicItems = relicData.Items || {};
    locs = Object.fromEntries(['ja','en','zh-CN','zh-TW'].map(lang => { const code = {'zh-CN':'zh-cn','zh-TW':'zh-tw'}[lang] || lang; return [lang, { ...(l0[code] || {}), ...(l1[code] || {}) }]; }));
    ja = locs.ja;
    const c = { ...c0 };
    const cut = s => (s || '').replace(/^\/ui\//, '').replace(/\.png$/, '');
    for (const [id, v] of Object.entries(c1)) {
      const cos = {};
      for (const [k, x] of Object.entries(v.Costumes || {})) cos[k] = { icon: cut(x.Icon), art: cut(x.Art), sideIconName: cut(x.SideIcon) };
      c[id] = { ...v, SideIconName: cut(v.SideIconName), Costumes: cos };
    }
    const m = {};
    for (const [id, v] of Object.entries(c)) {
      const n = ja[String(v.NameTextMapHash)];
      if (n) m[baseAvatarId(id)] = n;
      // Resolve Enka's hyphenated form keys using the numeric base avatar ID.
      const baseId = baseAvatarId(id);
      if (!c[baseId] || (v.Element && v.Element !== 'None' && c[baseId].Element === 'None')) {
        c[baseId] = v;
      }
    }
    nm = m;
    chr = c;
    pfp = pf;
    nmAt = Date.now();
  } catch (e) {
    console.error('キャラデータの取得失敗:', e.message);
  }
  return nm || {};
}

// キャラアイコンのURL（衣装も見る）
function charIcon(a) {
  const baseId = baseAvatarId(a.avatarId);
  const c = chr[String(a.avatarId)] || chr[baseId];
  // Mannequin icons are stable even if the avatar store lacks a base ID.
  if (DOLL[baseId]) return uiPath(`UI_AvatarIcon_${DOLL[baseId]}`);
  if (!c) return null;
  const cos = a.costumeId && c.Costumes?.[String(a.costumeId)];
  return uiPath(cos?.icon || (c.SideIconName || '').replace('_Side_', '_'));
}

// プロフィールアイコンのURL（新しい形式はid、古いのはavatarId）
function charSideIcon(a) {
  const c = chr[String(a.avatarId)] || chr[baseAvatarId(a.avatarId)];
  const side = c?.SideIconName;
  return side ? uiPath(side) : charIcon(a);
}

function pfpIcon(pp) {
  if (!pp) return null;
  if (pp.id && pfp[String(pp.id)]) return `${UI}${pfp[String(pp.id)].iconPath}.png`;
  if (pp.avatarId) return charIcon({ avatarId: pp.avatarId, costumeId: pp.costumeId });
  return null;
}

// プレイヤーの名刺背景。Enkaの名前札データから実際のUIアセット名を参照する。
function namecardImage(id) {
  if (id == null) return null;
  const card = namecards[String(id)] || namecards.Namecards?.[String(id)];
  const path = card?.Icon || card?.icon || card?.iconPath || card?.IconPath || card?.picPath || card?.PicPath || card?.image || card?.Image || card?.iconName || card?.IconName;
  // NameCardPic assets are JPEGs; forcing .png causes the blank blue fallback.
  return path ? uiPath(/\.(png|jpg|jpeg|webp)$/i.test(String(path)) ? path : `${path}.jpg`) : null;
}

// 横長のナビゲーション名刺を優先。存在しない名刺は通常背景へフォールバック。
function namecardImages(id) {
  const primary = namecardImage(id);
  if (!primary) return [];
  const alpha = primary.replace(/_P\.(?:jpg|jpeg|png|webp)$/i, '_Alpha.png');
  return alpha === primary ? [primary] : [alpha, primary];
}

// 全角数字もOKにしてUIDだけ取り出す
function cleanUid(s) {
  const t = String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '');
  return /^\d{9,10}$/.test(t) ? t : null;
}

async function player(uid) {
  const c = cache.get(uid);
  if (c && Date.now() - c.at < c.ttl * 1000) return { p: c.p, av: c.av, raw: c.raw };

  let r;
  try {
    // キャラ詳細（凸）も欲しいので?infoは付けない
    r = await fetch(`https://enka.network/api/uid/${uid}/`, { headers: { 'User-Agent': UA } });
  } catch {
    return { err: 503 };
  }
  if (!r.ok) return { err: r.status };
  const j = await r.json().catch(() => null);
  if (!j?.playerInfo) return { err: 404 };
  // 凸数 = talentIdListの数（詳細非公開の人は無し）
  const av = {};
  for (const a of j.avatarInfoList || []) av[a.avatarId] = (a.talentIdList || []).length;
  const raw = j.avatarInfoList || null;
  cache.set(uid, { at: Date.now(), ttl: j.ttl || 60, p: j.playerInfo, av, raw });
  return { p: j.playerInfo, av, raw };
}

// 日本語テキスト（ステータス名・セット名など）
const loc = (k, language = 'ja') => (locs[language] || ja)[String(k)] || ja[String(k)] || '';
const name = (id, language = 'ja') => { const c = char(id); return c ? loc(c.NameTextMapHash, language) : ''; };

// キャラのデータ（元素・天賦の並びなど）
const char = id => chr[String(id)] || chr[baseAvatarId(id)] || null;
const doll = id => DOLL[baseAvatarId(id)] || null;
function relicSet(e, language = 'ja') {
  const iconId = e.flat?.icon?.match(/UI_RelicIcon_(\d+)_/)?.[1];
  const setId = relicItems[String(e.itemId)]?.SetId || iconId;
  const hash = e.flat?.setNameTextMapHash || relicSets[setId]?.Name;
  return { id: String(setId || hash || e.itemId), name: loc(hash, language) || loc(relicSets[setId]?.Name, language) || `セット ${setId || hash || '不明'}` };
}

module.exports = { names, name, cleanUid, player, charIcon, charSideIcon, pfpIcon, namecardImage, namecardImages, loc, char, relicSet, UI, doll, uiPath };
