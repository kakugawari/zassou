const test = require('node:test');
const assert = require('node:assert');
const Core = require('./core.js');
const Kuni = require('./kuni.js');

const H = Kuni.HOUR;
const T0 = 1_700_000_000_000;

function fresh(extra) {
  const s = Kuni.normalize(Core.newState());
  Object.assign(s, extra || {});
  return s;
}

test('地図は 7x7 で、真ん中だけが役所。種類名がそろっている', () => {
  assert.strictEqual(Kuni.LAYOUT.length, 7);
  Kuni.LAYOUT.forEach((row) => assert.strictEqual(row.length, 7));
  let yakusho = 0;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    assert.ok(Kuni.TYPES[Kuni.typeAt(x, y)], `(${x},${y}) ${Kuni.typeAt(x, y)}`);
    if (Kuni.typeAt(x, y) === 'yakusho') { yakusho++; assert.deepStrictEqual([x, y], [3, 3]); }
  }
  assert.strictEqual(yakusho, 1);
});

test('はじめは、役所とそのまわりの 5マスだけ。住民はいない・収入は小さい', () => {
  const s = fresh();
  assert.strictEqual(Kuni.tileCount(s), 5);
  assert.strictEqual(Kuni.peopleCount(s), 0);
  assert.strictEqual(s.kuni.lv, 1);
  const rate = Kuni.ratePerHour(s);
  assert.ok(rate > 4 && rate < 10, `1時間 ${rate} コイン`);
});

test('時間がたつとぜいきんがたまり、ためられる上限で止まる', () => {
  let s = Kuni.settle(fresh(), T0);
  const rate = Kuni.ratePerHour(s);
  assert.ok(Math.abs(Kuni.pending(s, T0 + 2 * H) - rate * 2) < 1e-6);
  const cap = Kuni.capacity(s);
  assert.ok(Math.abs(cap - rate * 4) < 1e-6, 'Lv1 は 4時間ぶん');
  assert.ok(Math.abs(Kuni.pending(s, T0 + 100 * H) - cap) < 1e-6, '上限で止まる');
  // 時計が戻っても増えも減りもしない
  assert.strictEqual(Kuni.pending(s, T0 - 5 * H), 0);
});

test('受け取ると、コインが増えて、たまりが空になる。端数は残る', () => {
  let s = Kuni.settle(fresh({ coins: 0 }), T0);
  const r = Kuni.collect(s, T0 + 3 * H);
  const expect = Kuni.ratePerHour(s) * 3;
  assert.strictEqual(r.amount, Math.floor(expect));
  assert.strictEqual(r.state.coins, Math.floor(expect));
  assert.ok(r.state.kuni.stored < 1);
  assert.strictEqual(s.coins, 0, '元の状態は変わらない');
});

test('受け取らずに放っておいても、上限ぶんは損をしない / 越えたぶんは捨てる', () => {
  const s = Kuni.settle(fresh({ coins: 0 }), T0);
  const cap = Math.floor(Kuni.capacity(s));
  const r = Kuni.collect(s, T0 + 1000 * H);
  assert.strictEqual(r.amount, cap);
});

test('土地は となりにだけ・範囲の中だけ買える。買うと値段が上がる', () => {
  let s = fresh({ coins: 100000 });
  assert.strictEqual(Kuni.statusOf(s, 4, 4), 'buy', '斜めの角も、辺がとなりあえば買える');
  assert.strictEqual(Kuni.statusOf(s, 2, 2), 'buy');
  assert.strictEqual(Kuni.statusOf(s, 5, 3), 'level', 'Lv1 は 役所から1マスまで');
  assert.strictEqual(Kuni.statusOf(s, 3, 3), 'owned');
  const p0 = Kuni.canBuy(s, 4, 4).price;
  const r = Kuni.buy(s, 4, 4, T0);
  assert.ok(r.ok);
  assert.strictEqual(r.state.coins, 100000 - p0);
  assert.strictEqual(Kuni.tileCount(r.state), 6);
  assert.ok(Kuni.canBuy(r.state, 2, 2).price > p0, '買うたびに高くなる');
  assert.strictEqual(Kuni.buy(r.state, 4, 4, T0).ok, false, '同じ土地は買えない');
  assert.strictEqual(Kuni.buy(s, 0, 0, T0).reason, 'level');
});

test('コインが足りないと買えず、状態は変わらない', () => {
  const s = fresh({ coins: 1 });
  const r = Kuni.buy(s, 4, 4, T0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'coins');
  assert.strictEqual(r.state, s);
});

test('土地を買う前の分のぜいきんは、前の収入で数える (あとから増えたことにしない)', () => {
  let s = Kuni.settle(fresh({ coins: 100000 }), T0);
  const rate0 = Kuni.ratePerHour(s);
  const r = Kuni.buy(s, 4, 4, T0 + 2 * H);
  assert.ok(Math.abs(r.state.kuni.stored - rate0 * 2) < 1e-6, `${r.state.kuni.stored} vs ${rate0 * 2}`);
  assert.ok(Kuni.ratePerHour(r.state) > rate0);
});

test('住民: 持っている枚数まで。かぶった枚数ぶん、別のマスにも住める', () => {
  let s = fresh({ owned: { ame: 2, ogon: 1 } });
  const a = Kuni.assign(s, 2, 3, 'ame', T0);
  assert.ok(a.ok);
  const b = Kuni.assign(a.state, 4, 3, 'ame', T0);
  assert.ok(b.ok, '2枚あるので 2か所に住める');
  const c = Kuni.assign(b.state, 3, 2, 'ame', T0);
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.reason, 'copies');
  assert.strictEqual(Kuni.assign(s, 3, 2, 'mahou', T0).ok, false, '持っていないカードは住めない');
  assert.strictEqual(Kuni.assign(s, 3, 3, 'ame', T0).ok, false, '役所には住めない');
  assert.strictEqual(Kuni.assign(s, 6, 6, 'ame', T0).ok, false, '買っていない土地には住めない');
  assert.strictEqual(Kuni.peopleCount(b.state), 2);
  // 同じマスで同じカードを選び直しても、枚数は足りている
  assert.ok(Kuni.assign(b.state, 2, 3, 'ame', T0).ok);
  // 帰す
  const d = Kuni.assign(b.state, 2, 3, null, T0);
  assert.ok(d.ok && Kuni.peopleCount(d.state) === 1);
});

test('住民がつくと収入が増える。レアで高ステータスほど大きく、★でさらに増える', () => {
  const base = fresh({ owned: { futsu: 1, ogon: 1 } });
  const r0 = Kuni.ratePerHour(base);
  const withN = Kuni.assign(base, 2, 3, 'futsu', T0).state;
  const withUR = Kuni.assign(base, 2, 3, 'ogon', T0).state;
  assert.ok(Kuni.ratePerHour(withN) > r0);
  assert.ok(Kuni.ratePerHour(withUR) > Kuni.ratePerHour(withN) * 1.3);
  const star5 = Object.assign(Kuni.assign(base, 2, 3, 'ogon', T0).state, {});
  star5.owned.ogon = 5;
  assert.ok(Kuni.residentBonus(star5, 'ogon') > Kuni.residentBonus(withUR, 'ogon'));
});

test('役所のレベルアップ: 土地の数・住民の数・コインがそろわないと上がらない', () => {
  let s = fresh({ coins: 100000 });
  let info = Kuni.upgradeInfo(s);
  assert.strictEqual(info.ok, false);
  assert.deepStrictEqual(info.lacks.map((l) => l.what), ['tiles'], '土地 9 が足りない');
  assert.strictEqual(Kuni.upgrade(s, T0).ok, false);
  // 3x3 を全部買う
  for (const [x, y] of [[2, 2], [4, 2], [2, 4], [4, 4]]) s = Kuni.buy(s, x, y, T0).state;
  assert.strictEqual(Kuni.tileCount(s), 9);
  assert.ok(Kuni.upgradeInfo(s).ok);
  const coinsBefore = s.coins;
  const up = Kuni.upgrade(s, T0);
  assert.ok(up.ok);
  assert.strictEqual(up.state.kuni.lv, 2);
  assert.strictEqual(up.state.coins, coinsBefore - 400);
  assert.strictEqual(Kuni.statusOf(up.state, 5, 3), 'buy', 'Lv2 は 2マス先まで買える');
  assert.strictEqual(Kuni.statusOf(up.state, 6, 3), 'level');
  // コインが足りないだけのとき
  const poor = Object.assign(Core.clone(s), { coins: 100 });
  assert.deepStrictEqual(Kuni.upgradeInfo(poor).lacks.map((l) => l.what), ['coins']);
});

test('Lv5 まで上がると、それ以上は上がらない', () => {
  const s = fresh();
  s.kuni.lv = 5;
  assert.strictEqual(Kuni.upgradeInfo(s).max, true);
  assert.strictEqual(Kuni.upgrade(s, T0).ok, false);
});

test('保存して戻すと同じ。壊れた国は、はじめの形に直る', () => {
  let s = fresh({ coins: 5000, owned: { ame: 1 } });
  s = Kuni.buy(s, 4, 4, T0).state;
  s = Kuni.assign(s, 4, 4, 'ame', T0).state;
  const back = Kuni.normalize(Core.deserialize(Core.serialize(s)));
  assert.deepStrictEqual(back.kuni, s.kuni);

  const odd = Core.deserialize(JSON.stringify({
    coins: 10, owned: { ame: 1 },
    kuni: { lv: 99, tiles: { '4,4': { res: 'ame' }, '5,4': { res: 'ame' }, '9,9': { res: null }, 'x': {}, '3,3': { res: 'ame' } }, stored: -4, tick: 'あ' }
  }));
  const fixed = Kuni.normalize(odd);
  assert.strictEqual(fixed.kuni.lv, 5, 'レベルは 1〜5 に丸める');
  assert.ok(!fixed.kuni.tiles['9,9'] && !fixed.kuni.tiles.x, '地図の外・壊れた鍵は捨てる');
  assert.strictEqual(fixed.kuni.tiles['3,3'].res, null, '役所には住まない');
  assert.strictEqual(Kuni.peopleCount(fixed), 1, '1枚しかないカードは 1か所だけ');
  assert.strictEqual(fixed.kuni.stored, 0);
  assert.strictEqual(fixed.kuni.tick, 0);
  assert.strictEqual(Kuni.tileCount(fixed), 7, '地図の中の 2マス + はじめの 5マス');

  assert.deepStrictEqual(Kuni.normalize(Core.deserialize('{こわれた')).kuni, Kuni.normalize(Core.newState()).kuni);
});

test('国づくりが無い古い保存でも読めて、ガチャは国の状態を落とさない', () => {
  const old = Core.deserialize(JSON.stringify({ coins: 500, owned: { futsu: 1 } }));
  assert.ok(!('kuni' in old));
  let s = Kuni.normalize(old);
  s = Kuni.buy(Object.assign(s, { coins: 9999 }), 4, 4, T0).state;
  const r = Core.draw(s, 'one', Core.mulberry32(3), 'd1');
  assert.ok(r.state.kuni.tiles['4,4'], 'ガチャのあとも土地が残る');
  assert.strictEqual(Kuni.tileCount(r.state), 6);
});

// ---------------------------------------------------------------- 自動で遊ばせる
/**
 * 1日 3回 (朝・昼・夜) 開く子。なでて・受け取って・住民を最善にならべ、
 * 役所を上げ、残りを 土地 : ガチャ = landShare : (1 - landShare) に使う。
 */
function playKuni(seed, { days = 120, tapsPerDay = 200, landShare = 0.5 } = {}) {
  const rng = Core.mulberry32(seed);
  let s = Kuni.normalize(Core.newState());
  const log = { cards: Infinity, tiles49: Infinity, lv: [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity], coinsDay: [] };
  const arrange = () => {
    // 住民を、収入の高いマス × 高い増え方の順に入れなおす
    Object.keys(s.kuni.tiles).forEach((k) => { s.kuni.tiles[k].res = null; });
    const copies = [];
    Object.keys(s.owned).forEach((id) => { for (let i = 0; i < s.owned[id]; i++) copies.push(id); });
    copies.sort((a, b) => Kuni.residentBonus(s, b) - Kuni.residentBonus(s, a));
    const spots = Object.keys(s.kuni.tiles).filter((k) => k !== '3,3')
      .sort((a, b) => Kuni.TYPES[Kuni.typeAt(...b.split(',').map(Number))].mult - Kuni.TYPES[Kuni.typeAt(...a.split(',').map(Number))].mult);
    spots.forEach((k, i) => { if (copies[i]) s.kuni.tiles[k].res = copies[i]; });
  };
  for (let day = 0; day < days; day++) {
    for (const hour of [8, 13, 19]) {
      const now = T0 + (day * 24 + hour) * H;
      if (hour === 8) for (let i = 0; i < tapsPerDay; i++) s = Core.tap(s).state;
      if (hour === 8) { const f = Core.draw(s, 'free', rng, 'd' + day); if (f.ok) s = f.state; }
      s = Kuni.collect(s, now).state;
      arrange();
      s = Kuni.settle(s, now);
      for (let guard = 0; guard < 6; guard++) { const u = Kuni.upgrade(s, now); if (!u.ok) break; s = u.state; }
      // 土地: 予算の landShare を、安い順に買う
      let landBudget = Math.floor(s.coins * landShare);
      for (let guard = 0; guard < 60; guard++) {
        let best = null;
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const c = Kuni.canBuy(s, x, y);
          if (c.ok && c.price <= landBudget && (!best || Kuni.typeAt(x, y) !== 'x')) { if (!best || Kuni.TYPES[Kuni.typeAt(x, y)].mult > Kuni.TYPES[Kuni.typeAt(...best)].mult) best = [x, y]; }
        }
        if (!best) break;
        const r = Kuni.buy(s, best[0], best[1], now);
        landBudget -= r.price;
        s = r.state;
      }
      // カードが全部そろったら、もう回さない (コインは土地とレベルアップに回る)
      while (Core.ownedCount(s) < Core.CARDS.length && s.coins >= Core.PRICE_TEN) s = Core.draw(s, 'ten', rng, 'd' + day).state;
      while (Core.ownedCount(s) < Core.CARDS.length && s.coins >= Core.PRICE_ONE) s = Core.draw(s, 'one', rng, 'd' + day).state;
      arrange();
      s = Kuni.settle(s, now);
    }
    if (log.cards === Infinity && Core.ownedCount(s) === Core.CARDS.length) log.cards = day + 1;
    if (log.tiles49 === Infinity && Kuni.tileCount(s) === 49) log.tiles49 = day + 1;
    if (log.lv[s.kuni.lv] === Infinity) for (let l = 1; l <= s.kuni.lv; l++) if (log.lv[l] === Infinity) log.lv[l] = day + 1;
  }
  log.final = s;
  return log;
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('毎日 3回開く子の進み方 (20人): 地図が埋まり、役所が Lv5 になるまで', () => {
  const runs = [];
  for (let seed = 1; seed <= 20; seed++) runs.push(playKuni(seed));
  const cards = runs.map((r) => r.cards);
  const tiles = runs.map((r) => r.tiles49);
  const lv = [2, 3, 4, 5].map((l) => median(runs.map((r) => r.lv[l])));
  console.log(`  [測定] カード全部: 中央 ${median(cards)} 日 (最短 ${Math.min(...cards)} / 最長 ${Math.max(...cards)})`);
  console.log(`  [測定] 地図 49マス: 中央 ${median(tiles)} 日 (最短 ${Math.min(...tiles)} / 最長 ${Math.max(...tiles)})`);
  console.log(`  [測定] 役所 Lv2/3/4/5: 中央 ${lv.join(' / ')} 日`);
  // 収入を絞った理由: 前の数字 (1マス3コイン・値段 30+12k+1.5k²) では 地図が 12 日で埋まった
  assert.ok(median(tiles) >= 30 && median(tiles) <= 70, `地図が埋まるまで 30〜70 日のはず (${median(tiles)})`);
  assert.ok(Math.max(...tiles) <= 90, `ゆっくりな子でも 90 日以内 (${Math.max(...tiles)})`);
  assert.ok(median(cards) >= 5, `カードが早くそろいすぎ (${median(cards)} 日)`);
  assert.ok(median(runs.map((r) => r.lv[5])) >= 30, 'Lv5 まで 30 日以上かかる');
});
