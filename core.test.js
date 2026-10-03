const test = require('node:test');
const assert = require('node:assert');
const Core = require('./core.js');

const TODAY = '2026-10-03';

test('カードは24枚で、番号とidが重ならない', () => {
  assert.strictEqual(Core.CARDS.length, 24);
  assert.strictEqual(new Set(Core.CARDS.map((c) => c.id)).size, 24);
  assert.deepStrictEqual(Core.CARDS.map((c) => c.no), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.strictEqual(Core.noLabel(Core.CARDS[6]), 'No.007');
});

test('どのカードも、レア度・シリーズ・ステータスが正しい', () => {
  const series = new Set(Core.SERIES.map((s) => s.id));
  for (const c of Core.CARDS) {
    assert.ok(Core.RARITIES.includes(c.rarity), c.id);
    assert.ok(series.has(c.series), c.id);
    assert.strictEqual(c.stats.length, 3, c.id);
    assert.ok(c.stats.every((n) => Number.isInteger(n) && n >= 1 && n <= 5), c.id);
    assert.ok(c.text.length > 0 && c.name.length > 0, c.id);
  }
  for (const r of Core.RARITIES) assert.ok(Core.cardsOf(r).length > 0, `${r} のカードがある`);
});

test('同じ seed からは同じ結果が出る', () => {
  const rich = () => Object.assign(Core.newState(), { coins: 1000 });
  const a = Core.draw(rich(), 'ten', Core.mulberry32(5), TODAY);
  const b = Core.draw(rich(), 'ten', Core.mulberry32(5), TODAY);
  assert.deepStrictEqual(a.results.map((r) => r.card.id), b.results.map((r) => r.card.id));
});

test('排出率が決めた割合に近い (3万回)', () => {
  const rng = Core.mulberry32(99);
  const n = 30000;
  const hit = { N: 0, R: 0, SR: 0, UR: 0 };
  for (let i = 0; i < n; i++) hit[Core.pickRarity(rng)]++;
  const total = Core.RARITIES.reduce((s, r) => s + Core.RARITY[r].weight, 0);
  for (const r of Core.RARITIES) {
    const want = Core.RARITY[r].weight / total;
    const got = hit[r] / n;
    assert.ok(Math.abs(got - want) < 0.012, `${r}: 予定 ${want.toFixed(3)} / 実際 ${got.toFixed(3)}`);
  }
});

test('コインが足りなければ回せず、状態は変わらない', () => {
  const s = Core.newState();
  s.coins = Core.PRICE_ONE - 1;
  const r = Core.draw(s, 'one', Core.mulberry32(1), TODAY);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, s);
  const t = Core.newState();
  t.coins = Core.PRICE_TEN - 1;
  assert.strictEqual(Core.draw(t, 'ten', Core.mulberry32(1), TODAY).ok, false);
});

test('1かいまわすと、コインが減って1枚増える。元の状態は書き換えない', () => {
  const s = Core.newState();
  const r = Core.draw(s, 'one', Core.mulberry32(3), TODAY);
  assert.ok(r.ok);
  assert.strictEqual(r.state.coins, Core.START_COINS - Core.PRICE_ONE);
  assert.strictEqual(r.results.length, 1);
  assert.strictEqual(r.results[0].isNew, true);
  assert.strictEqual(r.state.owned[r.results[0].card.id], 1);
  assert.strictEqual(s.coins, Core.START_COINS);
  assert.deepStrictEqual(s.owned, {});
});

test('きょうの むりょうは 1日1回だけ。次の日にはまた使える', () => {
  let s = Core.newState();
  const r1 = Core.draw(s, 'free', Core.mulberry32(1), TODAY);
  assert.ok(r1.ok);
  assert.strictEqual(r1.state.coins, s.coins, 'コインは減らない');
  assert.strictEqual(Core.freeAvailable(r1.state, TODAY), false);
  assert.strictEqual(Core.draw(r1.state, 'free', Core.mulberry32(2), TODAY).ok, false);
  assert.strictEqual(Core.freeAvailable(r1.state, '2026-10-04'), true);
});

test('10かいは、ふつう ばかりでも最後に R 以上が入る (2000通り)', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const s = Core.newState();
    s.coins = 1000;
    const r = Core.draw(s, 'ten', Core.mulberry32(seed), TODAY);
    assert.strictEqual(r.results.length, 10);
    assert.ok(r.results.some((x) => Core.rankOf(x.card.rarity) >= 1), `seed ${seed}`);
    // かぶりのコインやごほうびが足されるので、減ったぶん以上は戻っていない
    assert.ok(r.state.coins >= 1000 - Core.PRICE_TEN, `seed ${seed}`);
    assert.ok(r.state.coins <= 1000 - Core.PRICE_TEN + 500, `seed ${seed}`);
  }
});

test('てんじょう: SR 以上が出ないまま続けても PITY 回目までに必ず出る', () => {
  // 運が悪い乱数 (いつも 0 に近い=いちばん出やすい N) で試す
  const unlucky = () => 0;
  let s = Core.newState();
  s.coins = 100000;
  let count = 0;
  let got = null;
  while (!got && count < 200) {
    const r = Core.draw(s, 'one', unlucky, TODAY);
    s = r.state;
    count++;
    if (Core.rankOf(r.results[0].card.rarity) >= 2) got = r.results[0];
  }
  assert.ok(got, 'SR 以上が出た');
  assert.strictEqual(count, Core.PITY, `ちょうど ${Core.PITY} 回目 (実際 ${count})`);
  assert.strictEqual(s.sinceSR, 0, '出たらカウントが戻る');
});

test('かぶると ★ が増え、★5 を超えたらコインに変わる', () => {
  let s = Core.newState();
  s.coins = 100000;
  s.owned.futsu = 0;
  // 同じカードだけ出る細工 (N の先頭を毎回選ぶ)
  const always = () => 0;
  let coinsBefore;
  const seenStars = [];
  for (let i = 0; i < 8; i++) {
    coinsBefore = s.coins;
    const r = Core.draw(s, 'one', always, TODAY);
    s = r.state;
    const x = r.results[0];
    seenStars.push(x.stars);
    if (i < Core.MAX_STARS) assert.strictEqual(x.refund, 0);
    else {
      assert.ok(x.refund > 0, 'かぶりはコインに');
      assert.ok(s.coins > coinsBefore - Core.PRICE_ONE);
    }
  }
  assert.deepStrictEqual(seenStars.slice(0, 7), [1, 2, 3, 4, 5, 5, 5].slice(0, 7));
  assert.strictEqual(Core.starsOf(s, 'futsu'), Core.MAX_STARS);
});

test('なでると 8回目に ぽんっ と コインが出る', () => {
  let s = Core.newState();
  const coins = s.coins;
  for (let i = 1; i <= Core.TAP_GOAL; i++) {
    const r = Core.tap(s);
    s = r.state;
    assert.strictEqual(r.pop, i === Core.TAP_GOAL);
  }
  assert.strictEqual(s.coins, coins + Core.TAP_REWARD);
  assert.strictEqual(s.tapCharge, 0);
});

test('コレクションのごほうびは、1度だけもらえる', () => {
  let s = Core.newState();
  s.coins = 0;
  Core.CARDS.slice(0, 6).forEach((c) => { s.owned[c.id] = 1; });
  const got = Core.claimMilestones(s);
  assert.deepStrictEqual(got, [[6, 60]]);
  assert.strictEqual(s.coins, 60);
  assert.deepStrictEqual(Core.claimMilestones(s), []);
  assert.strictEqual(s.coins, 60);
});

test('ホームにかざれるのは、持っているカードだけ', () => {
  const s = Core.newState();
  s.owned.futsu = 1;
  assert.strictEqual(Core.setHome(s, 'ogon'), s);
  s.owned.ogon = 1;
  assert.strictEqual(Core.setHome(s, 'ogon').home, 'ogon');
});

test('NEW は図鑑で見ると消える', () => {
  let s = Core.newState();
  s.owned.ame = 1;
  assert.strictEqual(Core.isNewCard(s, 'ame'), true);
  s = Core.markSeen(s, 'ame');
  assert.strictEqual(Core.isNewCard(s, 'ame'), false);
  assert.strictEqual(Core.isNewCard(s, 'yuki'), false, '持っていなければ NEW ではない');
});

test('保存して戻すと同じ。壊れた保存でも落ちない', () => {
  let s = Core.newState();
  s.coins = 123; s.pulls = 7; s.sinceSR = 4; s.lastFree = TODAY;
  s.owned.ame = 3; s.owned.ogon = 1; s.seen.ame = true; s.claimed = [6]; s.home = 'ogon';
  s.tapCharge = 3;
  assert.deepStrictEqual(Core.deserialize(Core.serialize(s)), s);

  assert.deepStrictEqual(Core.deserialize('{こわれた'), Core.newState());
  assert.deepStrictEqual(Core.deserialize('null'), Core.newState());
  const odd = Core.deserialize(JSON.stringify({
    coins: -5, owned: { ame: 2, ないカード: 4, yuki: -1 }, home: 'ogon', claimed: [6, 99], tapCharge: 999
  }));
  assert.strictEqual(odd.coins, Core.START_COINS, 'マイナスは捨てて初期値');
  assert.deepStrictEqual(odd.owned, { ame: 2 });
  assert.strictEqual(odd.home, 'futsu', '持っていないカードはかざれない');
  assert.deepStrictEqual(odd.claimed, [6]);
  assert.ok(odd.tapCharge < Core.TAP_GOAL);
});

/**
 * 自動で遊ばせて、全部そろうまでの日数を測る。
 * 1日に N回なでて、もらったコインでまわす子を何人も遊ばせる。
 */
function playUntilComplete(seed, tapsPerDay) {
  const rng = Core.mulberry32(seed);
  let s = Core.newState();
  for (let day = 1; day <= 400; day++) {
    const today = 'd' + day;
    const free = Core.draw(s, 'free', rng, today);
    if (free.ok) s = free.state;
    for (let i = 0; i < tapsPerDay; i++) s = Core.tap(s).state;
    while (s.coins >= Core.PRICE_TEN) s = Core.draw(s, 'ten', rng, today).state;
    while (s.coins >= Core.PRICE_ONE) s = Core.draw(s, 'one', rng, today).state;
    if (Core.ownedCount(s) === Core.CARDS.length) return { day, pulls: s.pulls };
  }
  return { day: Infinity, pulls: s.pulls };
}

test('毎日 200回なでる子は、全部そろうまで 1〜3週間くらい (60人)', () => {
  const days = [];
  const pulls = [];
  for (let seed = 1; seed <= 60; seed++) {
    const r = playUntilComplete(seed, 200);
    days.push(r.day); pulls.push(r.pulls);
  }
  days.sort((a, b) => a - b);
  const median = days[30];
  console.log(`  [測定] 200回/日: 全部そろうまで 中央 ${median} 日 (最短 ${days[0]} / 最長 ${days[59]}) 回数 中央 ${pulls.sort((a, b) => a - b)[30]}`);
  assert.ok(median >= 5, `早すぎる (${median}日)`);
  assert.ok(days[59] <= 40, `遅すぎる子がいる (${days[59]}日)`);
});

test('ほとんどなでない子 (毎日 20回) でも、無料と初期コインで数枚は集まる', () => {
  const rng = Core.mulberry32(1);
  let s = Core.newState();
  for (let day = 1; day <= 7; day++) {
    const f = Core.draw(s, 'free', rng, 'd' + day);
    if (f.ok) s = f.state;
    for (let i = 0; i < 20; i++) s = Core.tap(s).state;
    while (s.coins >= Core.PRICE_ONE) s = Core.draw(s, 'one', rng, 'd' + day).state;
  }
  assert.ok(Core.ownedCount(s) >= 6, `1週間で ${Core.ownedCount(s)} 種`);
});
