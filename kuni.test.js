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

// ---------------------------------------------------------------- きげん
const MIN = 60000;
/** 住民を 1人住まわせた、時計つきの状態。 */
function withWorker(id, x, y, extra) {
  let s = Kuni.settle(fresh(Object.assign({ coins: 100000, owned: { [id]: 1 } }, extra || {})), T0);
  s = Kuni.assign(s, x, y, id, T0).state;
  return s;
}

test('きげんの式は、時間を細かく刻んだ数値計算と合う (下がる・やすむ・段をまたぐ、200通り)', () => {
  const rng = Core.mulberry32(11);
  for (let i = 0; i < 200; i++) {
    const m0 = rng() * 100, rest = rng() < 0.3, d = rng() * 9, T = rng() * 30;
    const r = Kuni.integrate(m0, rest, d, T);
    // 数値計算 (0.001 時間刻み)
    let m = m0, rs = rest, area = 0;
    const dt = 0.001;
    for (let t = 0; t < T - 1e-12; t += dt) {
      const h = Math.min(dt, T - t);
      if (rs) { m += Kuni.REST_RATE * h; if (m >= 100) { m = 100; rs = false; } }
      else { area += Kuni.bandOf(m).mult * h; m = Math.max(0, m - d * h); }
    }
    assert.ok(Math.abs(r.mood - m) < 0.2, `#${i} きげん ${r.mood} vs ${m} (m0=${m0.toFixed(1)} rest=${rest} d=${d.toFixed(2)} T=${T.toFixed(1)})`);
    assert.ok(Math.abs(r.area - area) < 0.05 + T * 0.003, `#${i} 面積 ${r.area} vs ${area}`);
    assert.strictEqual(r.rest, rs, `#${i} やすみ`);
  }
});

test('住むと「ふつう(60)」から、働くあいだ ゆっくり下がり、いやだ!まで行く', () => {
  const s = withWorker('futsu', 2, 3, {});
  const m0 = Kuni.moodAt(s, 2, 3, T0);
  assert.strictEqual(m0.mood, Kuni.MOOD_START);
  assert.strictEqual(m0.band, 'ok');
  const names = [0, 2, 4, 6, 8, 12, 30].map((h) => Kuni.moodAt(s, 2, 3, T0 + h * H).band);
  assert.deepStrictEqual(names.slice(0, 1), ['ok']);
  assert.strictEqual(names[names.length - 1], 'angry', '30時間ほうっておくと「いやだ!」');
  const seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20].map((h) => Kuni.moodAt(s, 2, 3, T0 + h * H).mood);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] <= seq[i - 1], 'ずっと上がらず下がる');
  assert.ok(seq.every((v) => v >= 0 && v <= 100));
});

test('土地と性格で疲れかたが違う: はなばたけ・もりは疲れにくい / おかは疲れやすい / のんびりな子は疲れにくい', () => {
  const dec = (id, x, y, extra) => Kuni.decayRate(withWorker(id, x, y, extra), x, y);
  // (2,3)=はなばたけ, (3,2)=はなばたけ(row2 col3)… 土地の種類を直接調べる
  const hana = dec('futsu', 2, 3), nohara = (() => {
    let s = withWorker('futsu', 3, 4, {});          // (3,4) = はなばたけ
    return Kuni.decayRate(s, 3, 4);
  })();
  assert.strictEqual(Kuni.typeAt(2, 3), 'hana');
  // のはらのマスを作る: (2,2) は nohara
  let s2 = Kuni.settle(fresh({ coins: 1e6, owned: { futsu: 1 } }), T0);
  s2 = Kuni.buy(s2, 2, 2, T0).state;
  s2 = Kuni.assign(s2, 2, 2, 'futsu', T0).state;
  assert.strictEqual(Kuni.typeAt(2, 2), 'nohara');
  const noharaDecay = Kuni.decayRate(s2, 2, 2);
  assert.ok(hana < noharaDecay * 0.7, `はなばたけ ${hana} < のはら ${noharaDecay}`);
  // のんびり: futsu(のんびり4) と ofuro(のんびり5) と ninja(のんびり2) を同じ土地で
  const lazy = Kuni.decayRate(withWorker('ofuro', 2, 3), 2, 3);
  const brisk = Kuni.decayRate(withWorker('ninja', 2, 3), 2, 3);
  assert.ok(lazy < brisk, `のんびり5 ${lazy} < のんびり2 ${brisk}`);
  assert.ok(nohara > 0);
});

test('ごきげんだと 住民ぶんが 2倍、つかれると半分、いやだ!だと 0 (同じ時間で比べる)', () => {
  const income = (mood) => {
    let s = withWorker('ogon', 2, 3, {});
    s.kuni.tiles['2,3'].mood = mood;
    s.kuni.tiles['2,3'].up = 3;            // 疲れにくくして、短い時間の収入だけを見る
    return Kuni.tileRate(s, 2, 3, T0);
  };
  const land = Kuni.BASE_RATE * Kuni.TYPES.hana.mult;
  const bonus = Kuni.residentBonus(withWorker('ogon', 2, 3, {}), 'ogon');
  assert.ok(Math.abs(income(90) - land * (1 + bonus * 2)) < 1e-9, 'ごきげん x2');
  assert.ok(Math.abs(income(55) - land * (1 + bonus)) < 1e-9, 'ふつう x1');
  assert.ok(Math.abs(income(30) - land * (1 + bonus * 0.5)) < 1e-9, 'つかれた x0.5');
  assert.ok(Math.abs(income(5) - land) < 1e-9, 'いやだ!は 土地のぶんだけ');
  assert.ok(income(90) > income(55) && income(55) > income(30) && income(30) > income(5));
});

test('きげんが下がっていくあいだ、ぜいきんは 段ごとに変わる (積み上がりが実際の式と合う)', () => {
  let s = withWorker('ogon', 2, 3, {});
  s.kuni.tiles['2,3'].mood = 100;
  const now = T0 + 10 * H;
  const fast = Kuni.pending(s, now);
  // 10時間を 0.01 時間ずつ settle しても、まとめて出しても同じ
  let a = s;
  for (let i = 1; i <= 100; i++) a = Kuni.settle(a, T0 + i * 0.1 * H);
  assert.ok(Math.abs(a.kuni.stored - Math.min(Kuni.capacity(a), fast)) < 0.6, `刻み ${a.kuni.stored} vs まとめ ${fast}`);
  assert.ok(Math.abs(Kuni.moodAt(a, 2, 3, T0 + 10 * H).mood - Kuni.moodAt(s, 2, 3, now).mood) < 0.01, 'きげんも同じ');
});

test('なでる: 無料で +10。10分たつまで もう一度はできない', () => {
  const s = withWorker('futsu', 2, 3, {});
  const a = Kuni.pet(s, 2, 3, T0);
  assert.ok(a.ok);
  assert.strictEqual(Kuni.moodAt(a.state, 2, 3, T0).mood, Kuni.MOOD_START + Kuni.PET_GAIN);
  assert.strictEqual(a.state.coins, s.coins, 'コインはかからない');
  const b = Kuni.pet(a.state, 2, 3, T0 + 5 * MIN);
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.reason, 'cooldown');
  assert.ok(b.wait > 0 && b.wait <= 5 * MIN);
  assert.ok(Kuni.pet(a.state, 2, 3, T0 + 10 * MIN + 1).ok, '10分あとはできる');
  assert.strictEqual(Kuni.pet(s, 3, 4, T0).reason, 'nobody', '誰もいないマス');
  const top = Kuni.pet(Object.assign(Core.clone(s)), 2, 3, T0).state;
  top.kuni.tiles['2,3'].mood = 98; top.kuni.tiles['2,3'].pet = 0;
  assert.strictEqual(Kuni.moodAt(Kuni.pet(top, 2, 3, T0 + 1).state, 2, 3, T0 + 1).mood <= 100, true, '100 を越えない');
});

test('おやつ: コインで +40。コインが足りないと使えず、満タンにも使えない', () => {
  const s = withWorker('futsu', 2, 3, { coins: 100 });
  const a = Kuni.treat(s, 2, 3, T0);
  assert.ok(a.ok);
  assert.strictEqual(a.state.coins, 100 - Kuni.TREAT_COST);
  assert.strictEqual(Kuni.moodAt(a.state, 2, 3, T0).mood, 100);
  assert.strictEqual(Kuni.treat(a.state, 2, 3, T0).reason, 'full');
  const poor = Object.assign(Core.clone(s), { coins: 3 });
  assert.strictEqual(Kuni.treat(poor, 2, 3, T0).reason, 'coins');
  assert.strictEqual(Kuni.treat(poor, 2, 3, T0).state, poor);
});

test('みんなにおやつ: 人数ぶんのコインで、全員 +30', () => {
  let s = Kuni.settle(fresh({ coins: 1000, owned: { futsu: 2, ame: 1 } }), T0);
  s = Kuni.assign(s, 2, 3, 'futsu', T0).state;
  s = Kuni.assign(s, 4, 3, 'futsu', T0).state;
  s = Kuni.assign(s, 3, 2, 'ame', T0).state;
  const r = Kuni.treatAll(s, T0);
  assert.ok(r.ok);
  assert.strictEqual(r.price, 3 * Kuni.TREAT_ALL_COST);
  assert.strictEqual(r.state.coins, 1000 - 30);
  [['2,3'], ['4,3'], ['3,2']].forEach(([k]) => assert.strictEqual(r.state.kuni.tiles[k].mood, Kuni.MOOD_START + Kuni.TREAT_ALL_GAIN));
  assert.strictEqual(Kuni.treatAll(fresh({ coins: 1000 }), T0).reason, 'nobody');
  assert.strictEqual(Kuni.treatAll(Object.assign(Core.clone(s), { coins: 5 }), T0).reason, 'coins');
});

test('やすませる: 住民ぶんの収入は止まるが、きげんが戻って 100 になると自分で働きにもどる', () => {
  let s = withWorker('ogon', 2, 3, {});
  s.kuni.tiles['2,3'].mood = 20;
  const r = Kuni.setRest(s, 2, 3, true, T0);
  assert.ok(r.ok);
  const land = Kuni.BASE_RATE * Kuni.TYPES.hana.mult;
  assert.ok(Math.abs(Kuni.tileRate(r.state, 2, 3, T0) - land) < 1e-9, 'やすみ中は土地のぶんだけ');
  const m2 = Kuni.moodAt(r.state, 2, 3, T0 + 2 * H);
  assert.ok(Math.abs(m2.mood - (20 + 2 * Kuni.REST_RATE)) < 1e-6 && m2.band === 'rest');
  const back = Kuni.moodAt(r.state, 2, 3, T0 + 6 * H);     // (100-20)/15 = 5.33 時間で全快
  assert.strictEqual(back.rest, false, '全快すると働きにもどる');
  assert.ok(back.mood > 90 && back.mood <= 100);
  assert.strictEqual(Kuni.setRest(r.state, 3, 4, true, T0).reason, 'nobody');
});

test('改善: ベンチ → おちゃや → おふろ。買うほど疲れにくくなり、最後まで行くと止まる', () => {
  let s = withWorker('futsu', 2, 3, { coins: 5000 });
  const d0 = Kuni.decayRate(s, 2, 3);
  const costs = [];
  for (let i = 0; i < 3; i++) {
    const info = Kuni.improveInfo(s, 2, 3);
    costs.push(info.cost);
    const r = Kuni.improve(s, 2, 3, T0);
    assert.ok(r.ok);
    assert.strictEqual(r.state.coins, s.coins - info.cost);
    s = r.state;
  }
  assert.deepStrictEqual(costs, [80, 250, 700]);
  assert.ok(Math.abs(Kuni.decayRate(s, 2, 3) - d0 * 0.8 * 0.65 * 0.5) < 1e-9, '全部で 0.8 x 0.65 x 0.5');
  assert.strictEqual(Kuni.improveInfo(s, 2, 3).reason, 'max');
  assert.strictEqual(Kuni.improve(s, 2, 3, T0).ok, false);
  const poor = Object.assign(Core.clone(withWorker('futsu', 2, 3, {})), { coins: 10 });
  assert.strictEqual(Kuni.improve(poor, 2, 3, T0).reason, 'coins');
  assert.strictEqual(Kuni.improve(withWorker('futsu', 2, 3, { coins: 999 }), 3, 3, T0).ok, false, '役所には置けない');
  // 住民がいなくなっても、改善は土地に残る
  const gone = Kuni.assign(s, 2, 3, null, T0).state;
  assert.strictEqual(gone.kuni.tiles['2,3'].up, 3);
});

test('別の子に入れ替えたら ふつう(60)から。同じ子を選び直してもきげんは変わらない', () => {
  let s = withWorker('futsu', 2, 3, { owned: { futsu: 1, ame: 1 } });
  s.owned.ame = 1;
  s.kuni.tiles['2,3'].mood = 90;
  const same = Kuni.assign(s, 2, 3, 'futsu', T0).state;
  assert.strictEqual(same.kuni.tiles['2,3'].mood, 90);
  const swap = Kuni.assign(s, 2, 3, 'ame', T0).state;
  assert.strictEqual(swap.kuni.tiles['2,3'].mood, Kuni.MOOD_START);
});

test('きげんの内訳が数えられる', () => {
  let s = Kuni.settle(fresh({ coins: 0, owned: { futsu: 1, ame: 1, ogon: 1 } }), T0);
  s = Kuni.assign(s, 2, 3, 'futsu', T0).state;
  s = Kuni.assign(s, 4, 3, 'ame', T0).state;
  s = Kuni.assign(s, 3, 2, 'ogon', T0).state;
  s.kuni.tiles['2,3'].mood = 95; s.kuni.tiles['4,3'].mood = 25; s.kuni.tiles['3,2'].mood = 3;
  assert.deepStrictEqual(Kuni.moodSummary(s, T0), { happy: 1, ok: 0, tired: 1, angry: 1, rest: 0 });
});

test('壊れたきげんの保存も直る (マイナス・100超え・文字・改善の段が多すぎる)', () => {
  const odd = Core.deserialize(JSON.stringify({
    owned: { ame: 1 },
    kuni: { lv: 1, tiles: { '4,4': { res: 'ame', mood: 900, rest: 'はい', up: 99, pet: -5 }, '5,4': { res: null, mood: 'x', rest: true, up: -2 } } }
  }));
  const fixed = Kuni.normalize(odd);
  const a = fixed.kuni.tiles['4,4'], b = fixed.kuni.tiles['5,4'];
  assert.strictEqual(a.mood, 100);
  assert.strictEqual(a.up, 3);
  assert.strictEqual(a.pet, 0);
  assert.strictEqual(a.rest, true);
  assert.strictEqual(b.mood, Kuni.MOOD_START);
  assert.strictEqual(b.rest, false, '住民のいないマスは やすまない');
  assert.strictEqual(b.up, 0);
});

// ---------------------------------------------------------------- 自動で遊ばせる
/**
 * 1日 3回 (朝・昼・夜) 開く子。なでて・受け取って・住民を入れ、役所を上げ、
 * 残りを 土地 : ガチャ = landShare : (1 - landShare) に使う。
 * care: 'full'  なでる・疲れた子におやつ・余裕があれば改善 / 'none' きげんを気にしない
 */
function playKuni(seed, { days = 100, tapsPerDay = 200, landShare = 0.5, care = 'full' } = {}) {
  const rng = Core.mulberry32(seed);
  let s = Kuni.normalize(Core.newState());
  const log = { cards: Infinity, tiles49: Infinity, lv: [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity], income: 0, angryHours: 0 };
  const mult = (k) => Kuni.TYPES[Kuni.typeAt(...k.split(',').map(Number))].mult;
  const fillEmpty = (now) => {
    // あいている土地(収入の大きい順)に、まだ住んでいない子を 増え方の大きい順に入れる
    const spots = Object.keys(s.kuni.tiles).filter((k) => k !== '3,3' && !s.kuni.tiles[k].res).sort((a, b) => mult(b) - mult(a));
    for (const k of spots) {
      const [x, y] = k.split(',').map(Number);
      let best = null;
      for (const id of Object.keys(s.owned)) if (Kuni.freeCopies(s, id) > 0 && (!best || Kuni.residentBonus(s, id) > Kuni.residentBonus(s, best))) best = id;
      if (!best) break;
      s = Kuni.assign(s, x, y, best, now).state;
    }
  };
  for (let day = 0; day < days; day++) {
    for (const hour of [8, 13, 19]) {
      const now = T0 + (day * 24 + hour) * H;
      if (hour === 8) for (let i = 0; i < tapsPerDay; i++) s = Core.tap(s).state;
      if (hour === 8) { const f = Core.draw(s, 'free', rng, 'd' + day); if (f.ok) s = f.state; }
      s = Kuni.collect(s, now).state;
      fillEmpty(now);
      if (care === 'full') {
        for (const k of Object.keys(s.kuni.tiles)) {
          const [x, y] = k.split(',').map(Number);
          if (!s.kuni.tiles[k].res) continue;
          const p = Kuni.pet(s, x, y, now); if (p.ok) s = p.state;
          const m = Kuni.moodAt(s, x, y, now);
          if (m && m.mood < 40 && s.coins >= 200) { const t = Kuni.treat(s, x, y, now); if (t.ok) s = t.state; }
        }
      }
      s = Kuni.settle(s, now);
      for (let guard = 0; guard < 6; guard++) { const u = Kuni.upgrade(s, now); if (!u.ok) break; s = u.state; }
      let landBudget = Math.floor(s.coins * landShare);
      for (let guard = 0; guard < 60; guard++) {
        let best = null;
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const c = Kuni.canBuy(s, x, y);
          if (c.ok && c.price <= landBudget && (!best || Kuni.TYPES[Kuni.typeAt(x, y)].mult > Kuni.TYPES[Kuni.typeAt(...best)].mult)) best = [x, y];
        }
        if (!best) break;
        const r = Kuni.buy(s, best[0], best[1], now);
        landBudget -= r.price;
        s = r.state;
      }
      if (care === 'full') {          // 余ったコインの一部で、住民のいる土地を改善 (安い順)
        let kaizenBudget = Math.floor(s.coins * 0.15);
        for (const k of Object.keys(s.kuni.tiles)) {
          const [x, y] = k.split(',').map(Number);
          if (!s.kuni.tiles[k].res) continue;
          const info = Kuni.improveInfo(s, x, y);
          if (info.cost && info.cost <= kaizenBudget) { const r = Kuni.improve(s, x, y, now); if (r.ok) { kaizenBudget -= info.cost; s = r.state; } }
        }
      }
      while (Core.ownedCount(s) < Core.CARDS.length && s.coins >= Core.PRICE_TEN) s = Core.draw(s, 'ten', rng, 'd' + day).state;
      while (Core.ownedCount(s) < Core.CARDS.length && s.coins >= Core.PRICE_ONE) s = Core.draw(s, 'one', rng, 'd' + day).state;
      fillEmpty(now);
      s = Kuni.settle(s, now);
    }
    if (log.cards === Infinity && Core.ownedCount(s) === Core.CARDS.length) log.cards = day + 1;
    if (log.tiles49 === Infinity && Kuni.tileCount(s) === 49) log.tiles49 = day + 1;
    for (let l = 1; l <= s.kuni.lv; l++) if (log.lv[l] === Infinity) log.lv[l] = day + 1;
  }
  log.final = s;
  return log;
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const summary = (runs) => ({
  cards: median(runs.map((r) => r.cards)), tiles: median(runs.map((r) => r.tiles49)),
  tilesMax: Math.max(...runs.map((r) => r.tiles49)), tilesMin: Math.min(...runs.map((r) => r.tiles49)),
  lv: [2, 3, 4, 5].map((l) => median(runs.map((r) => r.lv[l])))
});

test('毎日 3回開く子の進み方: 世話をする子としない子 (各 12人)', () => {
  const full = []; const none = [];
  for (let seed = 1; seed <= 12; seed++) { full.push(playKuni(seed, { care: 'full' })); none.push(playKuni(seed, { care: 'none' })); }
  const f = summary(full), n = summary(none);
  console.log(`  [測定] 世話する子 : カード全部 中央 ${f.cards} 日 / 地図 49マス 中央 ${f.tiles} 日 (最短 ${f.tilesMin} / 最長 ${f.tilesMax}) / 役所 Lv2-5 ${f.lv.join(' / ')} 日`);
  console.log(`  [測定] 世話しない子: カード全部 中央 ${n.cards} 日 / 地図 49マス 中央 ${n.tiles} 日 / 役所 Lv2-5 ${n.lv.join(' / ')} 日`);
  // 収入を絞った理由: 前の数字 (1マス3コイン・値段 30+12k+1.5k²) では 地図が 12 日で埋まった
  assert.ok(f.tiles >= 30 && f.tiles <= 70, `世話する子は 地図が 30〜70 日で埋まる (${f.tiles})`);
  assert.ok(n.tiles >= f.tiles + 5, `世話しないと 遅くなる (世話する ${f.tiles} 日 / しない ${n.tiles} 日)`);
  assert.ok(n.tiles >= f.tiles * 1.4, `世話しないと ずっと遅い (${n.tiles} 日 は ${f.tiles} 日の 1.4 倍以上のはず)`);
  assert.ok(n.tiles <= 110, `世話しなくても 100 日ちょっとで終わる (${n.tiles})`);
  assert.ok(f.cards >= 5, `カードが早くそろいすぎ (${f.cards} 日)`);
  assert.ok(f.lv[3] >= 30, 'Lv5 まで 30 日以上かかる');
});
