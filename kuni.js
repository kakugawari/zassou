/*!
 * kuni.js — 国づくりのルール。DOM を触らない (node でテストできる)。
 *
 * 7 x 7 の地図の真ん中に「役所」がある。土地を買い足して国を広げ、
 * 土地に住民 (持っているカード) を住まわせると、時間でぜいきん (コイン) がたまる。
 * ぜいきんは役所にたまり、受け取りに行く。時間はすべて引数 now (ミリ秒) で受け取る。
 *
 * 住民には「きげん」(0〜100) がある。働くと時間で下がり、きげんで稼ぎが変わる:
 * ごきげん(70〜) は住民ぶんが 2倍、ふつうは 1倍、つかれたは半分、いやだ(15未満) は 0。
 * なでる・おやつ・やすませる・土地の改善(ベンチなど)で、きげんを保ってあげる。
 *
 * 状態は state.kuni に持つ (core.js の状態の中)。
 *   { lv, tiles: { 'x,y': { res, mood, rest, up, pet } }, stored, tick }
 *   mood は tick の時点の値。時間がたった分は式で出す (積分は閉じた式なので、日をまたいでも軽い)
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(require('./core.js'));
  } else {
    root.Kuni = factory(root.Core);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  // ---------------------------------------------------------------- 決めごと
  const SIZE = 7;
  const MID = 3;                   // 役所のマス (3, 3)
  const HOUR = 3600000;
  const BASE_RATE = 1;             // 1マス・1時間あたりのコイン (のはら・住民なし)
  const MAX_LV = 5;

  const TYPES = {
    yakusho: { name: 'やくしょ',   mult: 0 },
    nohara:  { name: 'のはら',     mult: 1 },
    oka:     { name: 'おか',       mult: 1.1 },
    mori:    { name: 'もり',       mult: 1.2 },
    mizu:    { name: 'みずうみ',   mult: 1.3 },
    hana:    { name: 'はなばたけ', mult: 1.5 }
  };

  // 地図 (土地の種類は最初から決まっている)
  const LAYOUT = [
    'mori mori oka mizu mizu oka mori',
    'mori hana nohara nohara hana oka mizu',
    'oka nohara nohara hana nohara nohara mori',
    'mizu nohara hana yakusho hana nohara oka',
    'mori nohara nohara hana nohara nohara mizu',
    'oka hana nohara nohara hana oka mori',
    'mizu mori oka mizu oka mori mori'
  ].map(function (row) { return row.split(' '); });

  /**
   * 役所のレベル。
   *  radius: 買える範囲 (役所から何マスまで)  hours: ぜいきんをためておける時間
   *  mult: 国全体の収入の倍率   cost: このレベルに上げるコイン
   *  need: このレベルに上げる条件 { tiles: 持っている土地の数, people: 住民の数 }
   */
  const LEVELS = [
    { lv: 1, radius: 1, hours: 4,  mult: 1,   cost: 0,    need: { tiles: 0,  people: 0 },  title: 'ざっそうむら' },
    { lv: 2, radius: 2, hours: 6,  mult: 1,   cost: 400,  need: { tiles: 9,  people: 0 },  title: 'ざっそうまち' },
    { lv: 3, radius: 3, hours: 8,  mult: 1.1, cost: 1500, need: { tiles: 25, people: 5 },  title: 'ざっそうし' },
    { lv: 4, radius: 3, hours: 12, mult: 1.3, cost: 4000, need: { tiles: 36, people: 12 }, title: 'ざっそうだいし' },
    { lv: 5, radius: 3, hours: 24, mult: 1.6, cost: 9000, need: { tiles: 49, people: 30 }, title: 'ざっそうおうこく' }
  ];

  // ---- きげん
  const MOOD_START = 60;           // 住みはじめのきげん
  const BASE_DECAY = 6;            // 1時間に下がる量 (のはら・のんびり3・改善なし)
  const REST_RATE = 15;            // やすんでいる間に 1時間で上がる量
  // きげんの段階 (min 以上): 住民ぶんの収入にかかる倍率
  const BANDS = [
    { key: 'happy', min: 70, mult: 2,   name: 'ごきげん' },
    { key: 'ok',    min: 40, mult: 1,   name: 'ふつう' },
    { key: 'tired', min: 15, mult: 0.5, name: 'つかれた' },
    { key: 'angry', min: 0,  mult: 0,   name: 'いやだ!' }
  ];
  const CALM = { yakusho: 1, nohara: 1, oka: 1.1, mori: 0.7, mizu: 0.7, hana: 0.6 };   // 土地による疲れやすさ
  // 土地の改善 (レベルごとの値段と、疲れにくさ)
  const KAIZEN = [
    { name: 'ベンチ',   cost: 80,  decay: 0.8 },
    { name: 'おちゃや', cost: 250, decay: 0.65 },
    { name: 'おふろ',   cost: 700, decay: 0.5 }
  ];
  const PET_GAIN = 10, PET_COOLDOWN = 10 * 60000;
  const TREAT_COST = 15, TREAT_GAIN = 40;
  const TREAT_ALL_COST = 10, TREAT_ALL_GAIN = 30;   // 1人あたり

  // 住民がつくと収入が増える (ステータスの合計 / 15 x レア度)
  const RARITY_BONUS = { N: 1.5, R: 2.25, SR: 3.5, UR: 5.5 };
  const STAR_BONUS = 0.1;          // ★ が 1つ増えるごとに +10%

  /** 土地の値段。買った数 k (はじめの5マスは数えない) が増えるほど高くなる。 */
  function landPrice(k) {
    return Math.round((60 + 25 * k + 3 * k * k) / 5) * 5;
  }

  // ---------------------------------------------------------------- 地図
  const key = function (x, y) { return x + ',' + y; };
  const inGrid = function (x, y) { return x >= 0 && y >= 0 && x < SIZE && y < SIZE; };
  const dist = function (x, y) { return Math.max(Math.abs(x - MID), Math.abs(y - MID)); };
  function typeAt(x, y) { return LAYOUT[y][x]; }

  const START_TILES = [[MID, MID], [MID - 1, MID], [MID + 1, MID], [MID, MID - 1], [MID, MID + 1]];

  const emptyTile = function () { return { res: null, mood: MOOD_START, rest: false, up: 0, pet: 0 }; };

  function defaultKuni() {
    const tiles = {};
    START_TILES.forEach(function (t) { tiles[key(t[0], t[1])] = emptyTile(); });
    return { lv: 1, tiles: tiles, stored: 0, tick: 0 };
  }

  // ---------------------------------------------------------------- 状態をそろえる
  /** どんな保存でも、正しい形の kuni を持つ状態にして返す (元は変えない)。 */
  function normalize(state) {
    const next = Core.clone(state);
    const raw = next.kuni;
    const base = defaultKuni();
    if (!raw || typeof raw !== 'object') { next.kuni = base; return next; }

    const lv = Number.isInteger(raw.lv) ? Math.min(MAX_LV, Math.max(1, raw.lv)) : 1;
    const tiles = {};
    START_TILES.forEach(function (t) { tiles[key(t[0], t[1])] = emptyTile(); });
    if (raw.tiles && typeof raw.tiles === 'object') {
      Object.keys(raw.tiles).forEach(function (k) {
        const m = /^(\d+),(\d+)$/.exec(k);
        if (!m) return;
        const x = Number(m[1]), y = Number(m[2]);
        if (!inGrid(x, y)) return;
        const t = raw.tiles[k];
        const res = t && typeof t.res === 'string' && Core.cardById(t.res) ? t.res : null;
        const num = function (v, lo, hi, d) { return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
        tiles[k] = {
          res: res,
          mood: num(t && t.mood, 0, 100, MOOD_START),
          rest: !!(res && t && t.rest),
          up: Math.floor(num(t && t.up, 0, KAIZEN.length, 0)),
          pet: num(t && t.pet, 0, Infinity, 0)
        };
      });
    }
    tiles[key(MID, MID)].res = null;       // 役所には住まない (枚数を数える前に消す)
    // 持っている枚数より多くは住めない
    const used = {};
    Object.keys(tiles).forEach(function (k) {
      const id = tiles[k].res;
      if (!id) return;
      used[id] = (used[id] || 0) + 1;
      if (used[id] > (next.owned[id] || 0)) { tiles[k].res = null; used[id]--; }
    });
    next.kuni = {
      lv: lv, tiles: tiles,
      stored: Number.isFinite(raw.stored) && raw.stored > 0 ? raw.stored : 0,
      tick: Number.isFinite(raw.tick) && raw.tick > 0 ? raw.tick : 0
    };
    return next;
  }

  const levelOf = function (state) { return LEVELS[state.kuni.lv - 1]; };
  const tileCount = function (state) { return Object.keys(state.kuni.tiles).length; };
  function peopleCount(state) {
    return Object.keys(state.kuni.tiles).filter(function (k) { return state.kuni.tiles[k].res; }).length;
  }
  const boughtCount = function (state) { return tileCount(state) - START_TILES.length; };

  /** 住民のカード 1枚ぶんの増え方 (0.4 なら +40%)。 */
  function residentBonus(state, id) {
    const card = Core.cardById(id);
    if (!card) return 0;
    const sum = card.stats[0] + card.stats[1] + card.stats[2];
    const stars = Math.max(1, Core.starsOf(state, id));
    return sum / 15 * RARITY_BONUS[card.rarity] * (1 + STAR_BONUS * (stars - 1));
  }

  // ---------------------------------------------------------------- きげん
  function bandOf(mood) {
    for (let i = 0; i < BANDS.length; i++) if (mood >= BANDS[i].min) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }

  /** そのマスで、住民のきげんが 1時間に下がる量。 */
  function decayRate(state, x, y) {
    const t = state.kuni.tiles[key(x, y)];
    if (!t || !t.res) return 0;
    const card = Core.cardById(t.res);
    const nonbiri = card ? card.stats[1] : 3;
    let kaizen = 1;
    for (let i = 0; i < t.up; i++) kaizen *= KAIZEN[i].decay;
    return BASE_DECAY * CALM[typeAt(x, y)] * (1.3 - 0.1 * nonbiri) * kaizen;
  }

  /**
   * T 時間たったあとのきげんと、そのあいだの「きげんの倍率の合計 (倍率 x 時間)」。
   * きげんは直線で下がり (やすんでいる間は直線で上がる)、段の境目で倍率が変わるだけなので、
   * 区切って足せば閉じた式で出る。日をまたぐ放置でも軽い。
   */
  function integrate(mood, rest, d, T) {
    let area = 0;
    if (rest) {
      const tr = (100 - mood) / REST_RATE;
      if (T < tr) return { area: 0, mood: mood + REST_RATE * T, rest: true };
      T -= tr; mood = 100; rest = false;
    }
    for (let guard = 0; guard < 8 && T > 1e-12; guard++) {
      const b = bandOf(mood);
      if (b.min === 0 || d <= 0) {                       // いちばん下の段、または下がらない
        area += b.mult * T;
        mood = Math.max(0, mood - d * T);
        T = 0;
        break;
      }
      const tLeave = (mood - b.min) / d;                 // この段にいられる時間
      if (T <= tLeave) { area += b.mult * T; mood -= d * T; T = 0; break; }
      area += b.mult * tLeave;
      T -= tLeave;
      mood = b.min - 1e-9;                               // すぐ下の段へ
    }
    return { area: area, mood: Math.max(0, mood), rest: false };
  }

  /** いま (now) のそのマスの住民のきげん。 */
  function moodAt(state, x, y, now) {
    const t = state.kuni.tiles[key(x, y)];
    if (!t || !t.res) return null;
    const k = state.kuni;
    const dt = k.tick && now > k.tick ? (now - k.tick) / HOUR : 0;
    const r = integrate(t.mood, t.rest, decayRate(state, x, y), dt);
    return { mood: r.mood, rest: r.rest, band: r.rest ? 'rest' : bandOf(r.mood).key, name: r.rest ? 'おやすみ' : bandOf(r.mood).name };
  }

  /** 1マスの 1時間あたりのコイン (国のレベルの倍率は入れない)。now を渡すと そのときのきげんで数える。 */
  function tileRate(state, x, y, now) {
    const t = state.kuni.tiles[key(x, y)];
    if (!t) return 0;
    const base = BASE_RATE * TYPES[typeAt(x, y)].mult;
    if (!t.res) return base;
    const m = moodAt(state, x, y, now || 0);
    const mult = m.rest ? 0 : bandOf(m.mood).mult;
    return base * (1 + residentBonus(state, t.res) * mult);
  }

  /** 国ぜんたいの 1時間あたりのコイン (いまのきげんで)。 */
  function ratePerHour(state, now) {
    let sum = 0;
    Object.keys(state.kuni.tiles).forEach(function (k) {
      const p = k.split(',');
      sum += tileRate(state, Number(p[0]), Number(p[1]), now);
    });
    return sum * levelOf(state).mult;
  }

  /** ためておける上限 (コイン)。きげんが「ふつう」のときの収入 x 時間。 */
  function capacity(state) {
    let sum = 0;
    Object.keys(state.kuni.tiles).forEach(function (k) {
      const t = state.kuni.tiles[k];
      const p = k.split(',');
      sum += BASE_RATE * TYPES[typeAt(Number(p[0]), Number(p[1]))].mult * (1 + (t.res ? residentBonus(state, t.res) : 0));
    });
    return sum * levelOf(state).mult * levelOf(state).hours;
  }

  // ---------------------------------------------------------------- 時間
  /** tick から now までに、国ぜんたいで入るコイン (きげんの変わりかたを含む)。 */
  function earned(state, now) {
    const k = state.kuni;
    if (!k.tick || now <= k.tick) return 0;
    const T = (now - k.tick) / HOUR;
    let sum = 0;
    Object.keys(k.tiles).forEach(function (key2) {
      const t = k.tiles[key2];
      const p = key2.split(',');
      const x = Number(p[0]), y = Number(p[1]);
      const base = BASE_RATE * TYPES[typeAt(x, y)].mult;
      if (!t.res) { sum += base * T; return; }
      const r = integrate(t.mood, t.rest, decayRate(state, x, y), T);
      sum += base * (T + residentBonus(state, t.res) * r.area);
    });
    return sum * levelOf(state).mult;
  }

  /** いまの「たまっているぜいきん」(状態は変えない。画面に出す用)。 */
  function pending(state, now) {
    const k = state.kuni;
    if (!k.tick) return k.stored;
    return Math.min(capacity(state), k.stored + earned(state, now));
  }

  /** いまの時点まで、たまった分ときげんを確定する。収入が変わる操作の前に必ず呼ぶ。 */
  function settle(state, now) {
    const next = Core.clone(state);
    const k = next.kuni;
    if (!k.tick || now < k.tick) { k.tick = now; return next; }   // はじめて / 時計が戻った
    const T = (now - k.tick) / HOUR;
    k.stored = Math.min(capacity(state), k.stored + earned(state, now));
    Object.keys(k.tiles).forEach(function (key2) {
      const t = k.tiles[key2];
      if (!t.res) return;
      const p = key2.split(',');
      const r = integrate(t.mood, t.rest, decayRate(state, Number(p[0]), Number(p[1])), T);
      t.mood = r.mood;
      t.rest = r.rest;
    });
    k.tick = now;
    return next;
  }

  function collect(state, now) {
    const next = settle(state, now);
    const amount = Math.floor(next.kuni.stored);
    next.coins += amount;
    next.kuni.stored -= amount;
    return { state: next, amount: amount };
  }

  // ---------------------------------------------------------------- 土地を買う
  /** マスの見た目の状態: owned / buy (買える) / far (となりに土地が無い) / level (役所のレベルが足りない) */
  function statusOf(state, x, y) {
    if (state.kuni.tiles[key(x, y)]) return 'owned';
    if (dist(x, y) > levelOf(state).radius) return 'level';
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) {
      return state.kuni.tiles[key(x + d[0], y + d[1])];
    });
    return near ? 'buy' : 'far';
  }

  function canBuy(state, x, y) {
    if (!inGrid(x, y)) return { ok: false, reason: 'out' };
    const s = statusOf(state, x, y);
    const price = landPrice(boughtCount(state));
    if (s !== 'buy') return { ok: false, reason: s, price: price };
    if (state.coins < price) return { ok: false, reason: 'coins', price: price };
    return { ok: true, price: price };
  }

  function buy(state, x, y, now) {
    const c = canBuy(state, x, y);
    if (!c.ok) return { ok: false, reason: c.reason, price: c.price, state: state };
    const next = settle(state, now);
    next.coins -= c.price;
    next.kuni.tiles[key(x, y)] = emptyTile();
    return { ok: true, price: c.price, state: next };
  }

  // ---------------------------------------------------------------- 住民
  /** そのカードの、まだ住んでいない枚数。 */
  function freeCopies(state, id) {
    let used = 0;
    Object.keys(state.kuni.tiles).forEach(function (k) { if (state.kuni.tiles[k].res === id) used++; });
    return (state.owned[id] || 0) - used;
  }

  function assign(state, x, y, id, now) {
    const t = state.kuni.tiles[key(x, y)];
    if (!t || (x === MID && y === MID)) return { ok: false, reason: 'tile', state: state };
    if (id !== null) {
      if (!Core.cardById(id)) return { ok: false, reason: 'card', state: state };
      // 同じマスに同じカードを選び直したときは、枚数は足りている
      const free = freeCopies(state, id) + (t.res === id ? 1 : 0);
      if (free <= 0) return { ok: false, reason: 'copies', state: state };
    }
    const next = settle(state, now);
    const tile = next.kuni.tiles[key(x, y)];
    if (tile.res !== id) { tile.mood = MOOD_START; tile.rest = false; }   // 来たばかりの子は「ふつう」
    tile.res = id;
    return { ok: true, state: next };
  }


  // ---------------------------------------------------------------- 世話と改善
  function workerAt(state, x, y) {
    const t = state.kuni.tiles[key(x, y)];
    return t && t.res ? t : null;
  }

  /** なでる (無料)。きげんが少し上がる。10分に1回。 */
  function pet(state, x, y, now) {
    if (!workerAt(state, x, y)) return { ok: false, reason: 'nobody', state: state };
    const left = state.kuni.tiles[key(x, y)].pet + PET_COOLDOWN - now;
    if (left > 0 && state.kuni.tiles[key(x, y)].pet) return { ok: false, reason: 'cooldown', wait: left, state: state };
    const next = settle(state, now);
    const t = next.kuni.tiles[key(x, y)];
    t.mood = Math.min(100, t.mood + PET_GAIN);
    t.pet = now;
    return { ok: true, state: next };
  }

  /** おやつ (コイン)。きげんが大きく上がる。 */
  function treat(state, x, y, now) {
    const w = workerAt(state, x, y);
    if (!w) return { ok: false, reason: 'nobody', state: state };
    if (state.coins < TREAT_COST) return { ok: false, reason: 'coins', state: state };
    const next = settle(state, now);
    const t = next.kuni.tiles[key(x, y)];
    if (t.mood >= 99.5 && !t.rest) return { ok: false, reason: 'full', state: state };
    next.coins -= TREAT_COST;
    t.mood = Math.min(100, t.mood + TREAT_GAIN);
    return { ok: true, state: next };
  }

  /** みんなにおやつ。働いている全員。 */
  function treatAll(state, now) {
    const n = peopleCount(state);
    const price = n * TREAT_ALL_COST;
    if (!n) return { ok: false, reason: 'nobody', state: state };
    if (state.coins < price) return { ok: false, reason: 'coins', price: price, state: state };
    const next = settle(state, now);
    Object.keys(next.kuni.tiles).forEach(function (k) {
      const t = next.kuni.tiles[k];
      if (t.res) t.mood = Math.min(100, t.mood + TREAT_ALL_GAIN);
    });
    next.coins -= price;
    return { ok: true, state: next, price: price };
  }

  /** やすませる / はたらかせる。やすんでいる間は住民ぶんの収入が止まり、きげんが戻る。 */
  function setRest(state, x, y, on, now) {
    if (!workerAt(state, x, y)) return { ok: false, reason: 'nobody', state: state };
    const next = settle(state, now);
    next.kuni.tiles[key(x, y)].rest = !!on;
    return { ok: true, state: next };
  }

  /** 土地の改善 (ベンチ → おちゃや → おふろ)。その土地の住民が疲れにくくなる。 */
  function improveInfo(state, x, y) {
    const t = state.kuni.tiles[key(x, y)];
    if (!t || (x === MID && y === MID)) return { ok: false, reason: 'tile' };
    if (t.up >= KAIZEN.length) return { ok: false, reason: 'max' };
    const next = KAIZEN[t.up];
    return { ok: state.coins >= next.cost, reason: state.coins >= next.cost ? null : 'coins', item: next, cost: next.cost };
  }

  function improve(state, x, y, now) {
    const info = improveInfo(state, x, y);
    if (!info.ok) return { ok: false, reason: info.reason, state: state };
    const next = settle(state, now);
    next.coins -= info.cost;
    next.kuni.tiles[key(x, y)].up += 1;
    return { ok: true, state: next, item: info.item };
  }

  /** きげんの内訳 (役所に出す)。 */
  function moodSummary(state, now) {
    const c = { happy: 0, ok: 0, tired: 0, angry: 0, rest: 0 };
    Object.keys(state.kuni.tiles).forEach(function (k) {
      const p = k.split(',');
      const m = moodAt(state, Number(p[0]), Number(p[1]), now);
      if (m) c[m.band]++;
    });
    return c;
  }

  // ---------------------------------------------------------------- 役所のレベルアップ
  function upgradeInfo(state) {
    if (state.kuni.lv >= MAX_LV) return { max: true };
    const nextLv = LEVELS[state.kuni.lv];
    const tiles = tileCount(state);
    const people = peopleCount(state);
    const lacks = [];
    if (tiles < nextLv.need.tiles) lacks.push({ what: 'tiles', have: tiles, need: nextLv.need.tiles });
    if (people < nextLv.need.people) lacks.push({ what: 'people', have: people, need: nextLv.need.people });
    if (state.coins < nextLv.cost) lacks.push({ what: 'coins', have: state.coins, need: nextLv.cost });
    return { max: false, next: nextLv, lacks: lacks, ok: lacks.length === 0 };
  }

  function upgrade(state, now) {
    const info = upgradeInfo(state);
    if (info.max || !info.ok) return { ok: false, state: state, info: info };
    const next = settle(state, now);
    next.coins -= info.next.cost;
    next.kuni.lv += 1;
    return { ok: true, state: next, info: info };
  }

  return {
    SIZE: SIZE, MID: MID, HOUR: HOUR, BASE_RATE: BASE_RATE, MAX_LV: MAX_LV,
    TYPES: TYPES, LEVELS: LEVELS, LAYOUT: LAYOUT, START_TILES: START_TILES,
    key: key, typeAt: typeAt, dist: dist, landPrice: landPrice,
    normalize: normalize, levelOf: levelOf, tileCount: tileCount, peopleCount: peopleCount, boughtCount: boughtCount,
    residentBonus: residentBonus, tileRate: tileRate, ratePerHour: ratePerHour, capacity: capacity,
    pending: pending, settle: settle, collect: collect,
    BANDS: BANDS, KAIZEN: KAIZEN, MOOD_START: MOOD_START, BASE_DECAY: BASE_DECAY, REST_RATE: REST_RATE,
    PET_GAIN: PET_GAIN, PET_COOLDOWN: PET_COOLDOWN, TREAT_COST: TREAT_COST, TREAT_GAIN: TREAT_GAIN, TREAT_ALL_COST: TREAT_ALL_COST, TREAT_ALL_GAIN: TREAT_ALL_GAIN,
    bandOf: bandOf, decayRate: decayRate, integrate: integrate, moodAt: moodAt, moodSummary: moodSummary,
    pet: pet, treat: treat, treatAll: treatAll, setRest: setRest, improveInfo: improveInfo, improve: improve,
    statusOf: statusOf, canBuy: canBuy, buy: buy,
    freeCopies: freeCopies, assign: assign,
    upgradeInfo: upgradeInfo, upgrade: upgrade
  };
});
