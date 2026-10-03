const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const Core = require('./core.js');
const Looks = require('./looks.js');
const Art = require('./art.js');

const src = (f) => fs.readFileSync(f, 'utf8');

test('どのカードにも見た目があり、使っている部品が実在する', () => {
  for (const c of Core.CARDS) {
    const look = Looks.LOOKS[c.id];
    assert.ok(look, `${c.id} の見た目がない`);
    assert.ok(Art.TONE_NAMES.includes(look.tone), `${c.id}: tone ${look.tone}`);
    assert.ok(Art.EXPRS.includes(look.expr), `${c.id}: expr ${look.expr}`);
    assert.ok(Art.BG_NAMES.includes(look.bg), `${c.id}: bg ${look.bg}`);
    for (const a of look.acc) assert.ok(Art.ACC_NAMES.includes(a), `${c.id}: acc ${a}`);
  }
  const extra = Object.keys(Looks.LOOKS).filter((id) => !Core.cardById(id));
  assert.deepStrictEqual(extra, [], 'カードに無い見た目が混ざっている');
});

test('手で書いた表に、同じ名前が2回出てこない (黙ってあとの方だけ残るため)', () => {
  const dup = (names) => names.filter((n, i) => names.indexOf(n) !== i);
  const looks = [...src('looks.js').matchAll(/^    (\w+): *\{ tone/gm)].map((m) => m[1]);
  assert.strictEqual(looks.length, Core.CARDS.length, 'looks.js の行数');
  assert.deepStrictEqual(dup(looks), []);

  const art = src('art.js');
  const acc = [...art.matchAll(/^    (\w+): \{(?: ?(?:front|back)|$)/gm)].map((m) => m[1]);
  assert.deepStrictEqual(dup(acc), [], '小物の名前');
  assert.strictEqual(acc.length, Art.ACC_NAMES.length, `小物 ${acc.length} 個 / 実際 ${Art.ACC_NAMES.length}`);
  const bg = [...art.matchAll(/^    (\w+): function \(u\)/gm)].map((m) => m[1]);
  assert.deepStrictEqual(dup(bg), [], '背景の名前');
  assert.strictEqual(bg.length, Art.BG_NAMES.length);

  const ids = [...src('core.js').matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]);
  assert.deepStrictEqual(dup(ids), [], 'カードid');
});

test('絵の文字に NaN や undefined が混ざらない / 開きタグと閉じタグが合う', () => {
  for (const c of Core.CARDS) {
    for (const svg of [Art.scene(Looks.lookOf(c.id)), Art.zassou(Looks.lookOf(c.id)), Art.background(Looks.lookOf(c.id))]) {
      assert.ok(!/NaN|undefined|null/.test(svg), `${c.id}: 変な値`);
      const open = (svg.match(/<(?!\/|\?|!)[a-zA-Z]/g) || []).length;
      const selfClose = (svg.match(/\/>/g) || []).length;
      const close = (svg.match(/<\/[a-zA-Z]/g) || []).length;
      assert.strictEqual(open, selfClose + close, `${c.id}: タグが合わない`);
    }
  }
});

test('絵の id は呼ぶたびに別になる (画面に何枚並べても重ならない)', () => {
  const ids = (s) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const a = ids(Art.scene({ tone: 'rainbow', bg: 'gold', acc: ['aura'] }));
  const b = ids(Art.scene({ tone: 'rainbow', bg: 'gold', acc: ['aura'] }));
  assert.ok(a.length > 0);
  assert.deepStrictEqual(a.filter((x) => b.includes(x)), []);
});

test('かげ絵に、中身の手がかり (顔・服) が入らない', () => {
  const s = Art.scene(Looks.lookOf('ogon'), { silhouette: true });
  assert.ok(!/ellipse cx="68"|circle cx="83"|aura|GLOW/.test(s));
});
