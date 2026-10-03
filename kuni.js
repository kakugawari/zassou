/*!
 * kuni.js — 国づくりのルール。DOM を触らない (node でテストできる)。
 *
 * 7 x 7 の地図の真ん中に「役所」がある。土地を買い足して国を広げ、
 * 土地に住民 (持っているカード) を住まわせると、時間でぜいきん (コイン) がたまる。
 * ぜいきんは役所にたまり、受け取りに行く。時間はすべて引数 now (ミリ秒) で受け取る。
 *
 * 状態は state.kuni に持つ (core.js の状態の中)。
 *   { lv, tiles: { 'x,y': { res: カードid | null } }, stored, tick }
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

  // 住民がつくと収入が増える (ステータスの合計 / 15 x レア度)
  const RARITY_BONUS = { N: 0.6, R: 0.9, SR: 1.4, UR: 2.2 };
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

  function defaultKuni() {
    const tiles = {};
    START_TILES.forEach(function (t) { tiles[key(t[0], t[1])] = { res: null }; });
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
    START_TILES.forEach(function (t) { tiles[key(t[0], t[1])] = { res: null }; });
    if (raw.tiles && typeof raw.tiles === 'object') {
      Object.keys(raw.tiles).forEach(function (k) {
        const m = /^(\d+),(\d+)$/.exec(k);
        if (!m) return;
        const x = Number(m[1]), y = Number(m[2]);
        if (!inGrid(x, y)) return;
        const t = raw.tiles[k];
        const res = t && typeof t.res === 'string' && Core.cardById(t.res) ? t.res : null;
        tiles[k] = { res: res };
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

  /** 1マスの 1時間あたりのコイン (国のレベルの倍率は入れない)。 */
  function tileRate(state, x, y) {
    const t = state.kuni.tiles[key(x, y)];
    if (!t) return 0;
    const type = typeAt(x, y);
    return BASE_RATE * TYPES[type].mult * (1 + (t.res ? residentBonus(state, t.res) : 0));
  }

  /** 国ぜんたいの 1時間あたりのコイン。 */
  function ratePerHour(state) {
    let sum = 0;
    Object.keys(state.kuni.tiles).forEach(function (k) {
      const p = k.split(',');
      sum += tileRate(state, Number(p[0]), Number(p[1]));
    });
    return sum * levelOf(state).mult;
  }

  /** ためておける上限 (コイン)。 */
  function capacity(state) { return ratePerHour(state) * levelOf(state).hours; }

  // ---------------------------------------------------------------- 時間
  /** いまの「たまっているぜいきん」(状態は変えない。画面に出す用)。 */
  function pending(state, now) {
    const k = state.kuni;
    if (!k.tick) return k.stored;
    const dt = Math.max(0, now - k.tick);
    return Math.min(capacity(state), k.stored + ratePerHour(state) * dt / HOUR);
  }

  /** いまの時点まで、たまった分を確定する。収入が変わる操作の前に必ず呼ぶ。 */
  function settle(state, now) {
    const next = Core.clone(state);
    next.kuni.stored = Math.min(capacity(state), pending(state, now));
    next.kuni.tick = now;
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
    next.kuni.tiles[key(x, y)] = { res: null };
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
    next.kuni.tiles[key(x, y)].res = id;
    return { ok: true, state: next };
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
    statusOf: statusOf, canBuy: canBuy, buy: buy,
    freeCopies: freeCopies, assign: assign,
    upgradeInfo: upgradeInfo, upgrade: upgrade
  };
});
