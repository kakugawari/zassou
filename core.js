/*!
 * core.js — 遊びのルールとカードのデータ。DOM を触らない (node でテストできる)。
 *
 * ブラウザでは window.Core、node からは require() で使う。
 * 見た目 (どんな服で、どんな背景か) は looks.js、描き方は art.js に分けてある。
 * カードを足すときは、ここと looks.js に 1 つずつ書く。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Core = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 決めごと
  const PRICE_ONE = 30;          // 1かいぶんのコイン
  const PRICE_TEN = 270;         // 10かいぶん (1かいぶんおとく)
  const START_COINS = 90;        // はじめにもっているコイン (3かい)
  const TAP_GOAL = 8;            // ざっそうをなでて「ぽんっ」となるまでの回数
  const TAP_REWARD = 20;         // ぽんっとなったときにもらえるコイン
  const PITY = 30;               // SR 以上が出ないまま続いたら、この回数目は SR 以上
  const MAX_STARS = 5;           // かぶったぶんだけ ぴかぴか (★) が増える上限
  const SAVE_VERSION = 1;

  const RARITIES = ['N', 'R', 'SR', 'UR'];
  const RARITY = {
    N:  { label: 'ふつう',           weight: 55, refund: 5,   rank: 0 },
    R:  { label: 'めずらしい',       weight: 30, refund: 10,  rank: 1 },
    SR: { label: 'とてもめずらしい', weight: 12, refund: 30,  rank: 2 },
    UR: { label: 'でんせつ',         weight: 3,  refund: 100, rank: 3 }
  };

  const SERIES = [
    { id: 'futsu',   name: 'いつもの ざっそう' },
    { id: 'odekake', name: 'おでかけ ざっそう' },
    { id: 'henshin', name: 'へんしん ざっそう' },
    { id: 'kira',    name: 'キラキラ ざっそう' }
  ];

  // コレクションが進んだごほうび: [もっている枚数, もらえるコイン]
  const MILESTONES = [[6, 60], [12, 100], [18, 150], [24, 300]];

  // stats = [かわいさ, のんびり, ねばり] (1〜5)
  const CARDS = [
    { id: 'futsu',    name: 'ざっそう',               rarity: 'N',  series: 'futsu',   stats: [3, 4, 3], text: 'どこにでも はえている。でも ここが いちばん すき。' },
    { id: 'nikkori',  name: 'にっこり ざっそう',       rarity: 'N',  series: 'futsu',   stats: [4, 3, 2], text: 'きょうも いい てんき。それだけで うれしい。' },
    { id: 'nemu',     name: 'ねむねむ ざっそう',       rarity: 'N',  series: 'futsu',   stats: [3, 5, 2], text: 'よるは ぐっすり。あさまで ゆらゆら ゆめのなか。' },
    { id: 'hinata',   name: 'ひなたぼっこ ざっそう',   rarity: 'N',  series: 'futsu',   stats: [3, 5, 3], text: 'おひさまを いっぱい あびて、はっぱが ぽかぽか。' },
    { id: 'bonyari',  name: 'ぼんやり ざっそう',       rarity: 'N',  series: 'futsu',   stats: [2, 5, 3], text: 'くもを みていたら、いちにちが おわっていた。' },
    { id: 'mebae',    name: 'めばえ ざっそう',         rarity: 'N',  series: 'futsu',   stats: [4, 3, 3], text: 'あたまに ちいさな めが でた。そっと そだてよう。' },
    { id: 'ame',      name: 'あめふり ざっそう',       rarity: 'N',  series: 'odekake', stats: [3, 4, 3], text: 'あめは だいすき。でも かさも ちょっと すき。' },
    { id: 'yuki',     name: 'ゆきあそび ざっそう',     rarity: 'N',  series: 'odekake', stats: [4, 2, 4], text: 'マフラーを まいて ゆきの なかへ ぽてぽて。' },
    { id: 'hanami',   name: 'おはなみ ざっそう',       rarity: 'R',  series: 'odekake', stats: [5, 3, 2], text: 'はなびらが ひらひら。あたまにも おはなが さいた。' },
    { id: 'ofuro',    name: 'おふろ ざっそう',         rarity: 'R',  series: 'odekake', stats: [4, 5, 1], text: 'あわあわの ぼうしで ほっかほか。いい きもち。' },
    { id: 'umi',      name: 'うみ ざっそう',           rarity: 'R',  series: 'odekake', stats: [3, 3, 4], text: 'うきわで ぷかぷか。なみに のって どこまでも。' },
    { id: 'ribbon',   name: 'リボン ざっそう',         rarity: 'R',  series: 'henshin', stats: [5, 3, 2], text: 'おしゃれな リボンを つけてもらって にこにこ。' },
    { id: 'ninja',    name: 'にんじゃ ざっそう',       rarity: 'R',  series: 'henshin', stats: [3, 2, 5], text: 'くさむらに かくれる のは とくい。だって ざっそうだもの。' },
    { id: 'kaizoku',  name: 'かいぞく ざっそう',       rarity: 'R',  series: 'henshin', stats: [3, 3, 4], text: 'ほうぞうを さがして ぼうけんに しゅっぱつ!' },
    { id: 'gokigen',  name: 'ごきげん ざっそう',       rarity: 'R',  series: 'henshin', stats: [4, 4, 2], text: 'サングラスで きめて、ゆうひを みながら ごきげん。' },
    { id: 'gochiso',  name: 'ごちそう ざっそう',       rarity: 'R',  series: 'henshin', stats: [4, 3, 3], text: 'コックさんの ぼうしで、おいしい ものを つくるよ。' },
    { id: 'mahou',    name: 'まほうつかい ざっそう',   rarity: 'SR', series: 'kira',    stats: [4, 3, 4], text: 'ほしの つえを ふると、はっぱが きらきら ひかる。' },
    { id: 'osama',    name: 'おうさま ざっそう',       rarity: 'SR', series: 'kira',    stats: [4, 4, 4], text: 'くさはらの おうさま。マントが すこし おおきい。' },
    { id: 'hoshizora',name: 'ほしぞら ざっそう',       rarity: 'SR', series: 'kira',    stats: [5, 4, 3], text: 'よぞらを そのまま まとったような、ふしぎな くさ。' },
    { id: 'kirakira', name: 'キラキラ ざっそう',       rarity: 'SR', series: 'kira',    stats: [5, 3, 3], text: 'つゆを あびて からだじゅうが クリスタルみたい。' },
    { id: 'tenshi',   name: 'てんし ざっそう',         rarity: 'SR', series: 'kira',    stats: [5, 5, 2], text: 'くもの うえから ふわり。みんなを しあわせにするよ。' },
    { id: 'ogon',     name: 'おうごん ざっそう',       rarity: 'UR', series: 'kira',    stats: [5, 4, 5], text: 'みつけたら いいことが ある、ひかりかがやく ざっそう。' },
    { id: 'niji',     name: 'にじいろ ざっそう',       rarity: 'UR', series: 'kira',    stats: [5, 5, 4], text: 'あめあがりの そらに あらわれる、ななつの いろの くさ。' },
    { id: 'sekaiju',  name: 'せかいじゅ ざっそう',     rarity: 'UR', series: 'kira',    stats: [5, 5, 5], text: 'ずっと ずっと むかしから、せかいを みまもっている。' }
  ];
  CARDS.forEach(function (c, i) { c.no = i + 1; });

  const BY_ID = {};
  CARDS.forEach(function (c) { BY_ID[c.id] = c; });

  function cardById(id) { return BY_ID[id] || null; }
  function cardsOf(rarity) { return CARDS.filter(function (c) { return c.rarity === rarity; }); }
  function rankOf(rarity) { return RARITY[rarity].rank; }

  /** "No.007" のような番号。 */
  function noLabel(card) { return 'No.' + String(card.no).padStart(3, '0'); }

  // ---------------------------------------------------------------- 乱数
  /** 決まった順番で数を出す乱数 (mulberry32)。同じ seed なら同じ並び。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- 状態
  function newState() {
    return {
      v: SAVE_VERSION,
      coins: START_COINS,
      owned: {},          // { カードid: 持っている枚数 }
      seen: {},           // { カードid: true } 図鑑で「NEW」を見たもの
      pulls: 0,           // 合計で何回まわしたか
      sinceSR: 0,         // SR 以上が出ていない回数
      lastFree: '',       // 無料ガチャを引いた日 (YYYY-MM-DD)
      tapCharge: 0,       // なでた回数 (TAP_GOAL で ぽんっ)
      home: 'futsu',      // ホームにかざっているカード
      claimed: []         // もらったごほうびの枚数 (MILESTONES の1つめ)
    };
  }

  function clone(state) {
    const copy = {
      v: state.v, coins: state.coins,
      owned: Object.assign({}, state.owned),
      seen: Object.assign({}, state.seen),
      pulls: state.pulls, sinceSR: state.sinceSR, lastFree: state.lastFree,
      tapCharge: state.tapCharge, home: state.home,
      claimed: state.claimed.slice()
    };
    // 国づくり (kuni.js) の状態。無い保存には鍵を作らない
    if (state.kuni) copy.kuni = JSON.parse(JSON.stringify(state.kuni));
    return copy;
  }

  function ownedCount(state) {
    return CARDS.filter(function (c) { return state.owned[c.id] > 0; }).length;
  }

  /** ぴかぴかの数 (★ 1〜5)。持っていなければ 0。 */
  function starsOf(state, id) {
    return Math.min(MAX_STARS, state.owned[id] || 0);
  }

  function todayKey(date) {
    const d = date || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function freeAvailable(state, today) { return state.lastFree !== today; }

  // ---------------------------------------------------------------- ガチャ
  /**
   * レア度を1つ決める。floor を渡すと、それ未満は出ない
   * (10かいの おまけや、てんじょうに使う)。
   */
  function pickRarity(rng, floor) {
    const minRank = floor ? rankOf(floor) : 0;
    const pool = RARITIES.filter(function (r) { return rankOf(r) >= minRank; });
    let total = 0;
    pool.forEach(function (r) { total += RARITY[r].weight; });
    let x = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      x -= RARITY[pool[i]].weight;
      if (x < 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function pickCard(rng, rarity) {
    const list = cardsOf(rarity);
    return list[Math.floor(rng() * list.length) % list.length];
  }

  /** 1かいぶん。state をその場で書き換える (呼び出し側が clone 済み)。 */
  function pullInto(state, rng, floor) {
    // てんじょう: SR 以上が出ないまま PITY - 1 回続いたら、今回は SR 以上
    let f = floor || null;
    if (state.sinceSR >= PITY - 1 && (!f || rankOf(f) < rankOf('SR'))) f = 'SR';

    const rarity = pickRarity(rng, f);
    const card = pickCard(rng, rarity);
    const before = state.owned[card.id] || 0;
    state.owned[card.id] = before + 1;
    state.pulls += 1;
    state.sinceSR = rankOf(rarity) >= rankOf('SR') ? 0 : state.sinceSR + 1;

    const isNew = before === 0;
    // もう ★5 のカードがかぶったら、かわりにコインがもらえる
    const refund = before >= MAX_STARS ? RARITY[rarity].refund : 0;
    state.coins += refund;
    return {
      card: card, isNew: isNew, stars: Math.min(MAX_STARS, before + 1),
      levelUp: !isNew && before < MAX_STARS, refund: refund
    };
  }

  /** コレクションのごほうびを受け取る。受け取った [枚数, コイン] の配列を返す。 */
  function claimMilestones(state) {
    const have = ownedCount(state);
    const got = [];
    MILESTONES.forEach(function (m) {
      if (have >= m[0] && state.claimed.indexOf(m[0]) < 0) {
        state.claimed.push(m[0]);
        state.coins += m[1];
        got.push(m);
      }
    });
    return got;
  }

  /**
   * ガチャをまわす。
   *   mode: 'one' | 'ten' | 'free' (きょうの むりょう 1かい)
   * 足りないときや、きょうの むりょうを使ったあとは ok:false で state は変わらない。
   */
  function draw(state, mode, rng, today) {
    const count = mode === 'ten' ? 10 : 1;
    if (mode === 'free') {
      if (!freeAvailable(state, today)) return { ok: false, reason: 'free-used', state: state };
    } else {
      const price = mode === 'ten' ? PRICE_TEN : PRICE_ONE;
      if (state.coins < price) return { ok: false, reason: 'coins', state: state };
    }

    const next = clone(state);
    if (mode === 'free') next.lastFree = today;
    else next.coins -= mode === 'ten' ? PRICE_TEN : PRICE_ONE;

    const results = [];
    for (let i = 0; i < count; i++) {
      // 10かい目まで ふつう しか出ていなければ、最後の1枚は R 以上
      let floor = null;
      if (mode === 'ten' && i === count - 1 &&
          results.every(function (r) { return r.card.rarity === 'N'; })) floor = 'R';
      results.push(pullInto(next, rng, floor));
    }
    const milestones = claimMilestones(next);
    return { ok: true, state: next, results: results, milestones: milestones };
  }

  // ---------------------------------------------------------------- なでる
  /** ざっそうをなでる。TAP_GOAL 回目に ぽんっ と コインが出る。 */
  function tap(state) {
    const next = clone(state);
    next.tapCharge += 1;
    let pop = false;
    if (next.tapCharge >= TAP_GOAL) {
      next.tapCharge = 0;
      next.coins += TAP_REWARD;
      pop = true;
    }
    return { state: next, pop: pop, reward: pop ? TAP_REWARD : 0 };
  }

  /** ホームにかざるカードを変える。持っているものだけ。 */
  function setHome(state, id) {
    if (!(state.owned[id] > 0)) return state;
    const next = clone(state);
    next.home = id;
    return next;
  }

  /** 図鑑で見たことにする (NEW を消す)。 */
  function markSeen(state, id) {
    if (state.seen[id]) return state;
    const next = clone(state);
    next.seen[id] = true;
    return next;
  }

  function isNewCard(state, id) { return state.owned[id] > 0 && !state.seen[id]; }

  // ---------------------------------------------------------------- 保存
  function serialize(state) { return JSON.stringify(state); }

  /** 保存した文字から状態を戻す。壊れていたり古かったりしても、できるだけ拾う。 */
  function deserialize(text) {
    const base = newState();
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return base; }
    if (!raw || typeof raw !== 'object') return base;
    const num = function (x, d) { return Number.isFinite(x) && x >= 0 ? Math.floor(x) : d; };
    base.coins = num(raw.coins, base.coins);
    base.pulls = num(raw.pulls, 0);
    base.sinceSR = num(raw.sinceSR, 0);
    base.tapCharge = Math.min(TAP_GOAL - 1, num(raw.tapCharge, 0));
    base.lastFree = typeof raw.lastFree === 'string' ? raw.lastFree : '';
    if (raw.owned && typeof raw.owned === 'object') {
      Object.keys(raw.owned).forEach(function (id) {
        const n = num(raw.owned[id], 0);
        if (BY_ID[id] && n > 0) base.owned[id] = n;
      });
    }
    if (raw.seen && typeof raw.seen === 'object') {
      Object.keys(raw.seen).forEach(function (id) {
        if (BY_ID[id] && raw.seen[id]) base.seen[id] = true;
      });
    }
    if (Array.isArray(raw.claimed)) {
      base.claimed = raw.claimed.filter(function (n) {
        return MILESTONES.some(function (m) { return m[0] === n; });
      });
    }
    if (typeof raw.home === 'string' && base.owned[raw.home] > 0) base.home = raw.home;
    else if (!(base.owned[base.home] > 0)) base.home = 'futsu';
    // 国づくりの状態は中身を確かめずに預かる (Kuni.normalize が整える)
    if (raw.kuni && typeof raw.kuni === 'object') base.kuni = raw.kuni;
    return base;
  }

  return {
    PRICE_ONE: PRICE_ONE, PRICE_TEN: PRICE_TEN, START_COINS: START_COINS,
    TAP_GOAL: TAP_GOAL, TAP_REWARD: TAP_REWARD, PITY: PITY, MAX_STARS: MAX_STARS,
    RARITIES: RARITIES, RARITY: RARITY, SERIES: SERIES, MILESTONES: MILESTONES,
    CARDS: CARDS,
    cardById: cardById, cardsOf: cardsOf, rankOf: rankOf, noLabel: noLabel,
    mulberry32: mulberry32,
    newState: newState, clone: clone, ownedCount: ownedCount, starsOf: starsOf,
    todayKey: todayKey, freeAvailable: freeAvailable,
    pickRarity: pickRarity, draw: draw, claimMilestones: claimMilestones,
    tap: tap, setHome: setHome, markSeen: markSeen, isNewCard: isNewCard,
    serialize: serialize, deserialize: deserialize
  };
});
