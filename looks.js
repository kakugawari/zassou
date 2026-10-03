/*!
 * looks.js — カードごとの見た目のデータ。描き方は art.js、ルールは core.js。
 * カードを足すときは、core.js の CARDS と、ここに 1 行ずつ。
 *   tone: 体の色 / expr: 表情 / acc: 服・小物 / bg: 背景
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Looks = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LOOKS = {
    futsu:     { tone: 'green',   expr: 'smile',    acc: [],                          bg: 'meadow' },
    nikkori:   { tone: 'green',   expr: 'open',     acc: [],                          bg: 'sun' },
    nemu:      { tone: 'green',   expr: 'sleepy',   acc: ['nightcap', 'zzz'],         bg: 'night' },
    hinata:    { tone: 'green',   expr: 'happy',    acc: [],                          bg: 'sun' },
    bonyari:   { tone: 'green',   expr: 'surprise', acc: [],                          bg: 'meadow' },
    mebae:     { tone: 'green',   expr: 'smile',    acc: ['sprout'],                  bg: 'meadow' },
    ame:       { tone: 'green',   expr: 'smile',    acc: ['umbrella'],                bg: 'rain' },
    yuki:      { tone: 'green',   expr: 'open',     acc: ['scarf'],                   bg: 'snow' },
    hanami:    { tone: 'green',   expr: 'happy',    acc: ['hanaflower'],              bg: 'sakura' },
    ofuro:     { tone: 'green',   expr: 'sleepy',   acc: ['foam'],                    bg: 'bubbles' },
    umi:       { tone: 'green',   expr: 'open',     acc: ['swimring'],                bg: 'sea' },
    ribbon:    { tone: 'green',   expr: 'happy',    acc: ['ribbon'],                  bg: 'dots' },
    ninja:     { tone: 'green',   expr: 'smirk',    acc: ['ninja'],                   bg: 'bamboo' },
    kaizoku:   { tone: 'green',   expr: 'open',     acc: ['pirate'],                  bg: 'pirate' },
    gokigen:   { tone: 'green',   expr: 'smirk',    acc: ['sunglasses'],              bg: 'sunset' },
    gochiso:   { tone: 'green',   expr: 'happy',    acc: ['chef'],                    bg: 'kitchen' },
    mahou:     { tone: 'green',   expr: 'open',     acc: ['witch', 'wand', 'sparkle'], bg: 'night' },
    osama:     { tone: 'green',   expr: 'smirk',    acc: ['cape', 'crown'],           bg: 'red' },
    hoshizora: { tone: 'star',    expr: 'happy',    acc: ['sparkle'],                 bg: 'night' },
    kirakira:  { tone: 'crystal', expr: 'open',     acc: ['sparkle'],                 bg: 'sparkle' },
    tenshi:    { tone: 'pink',    expr: 'happy',    acc: ['halo'],                    bg: 'heaven' },
    ogon:      { tone: 'gold',    expr: 'open',     acc: ['aura', 'sparkle'],         bg: 'gold' },
    niji:      { tone: 'rainbow', expr: 'happy',    acc: ['rainbowarc', 'sparkle'],   bg: 'rainbow' },
    sekaiju:   { tone: 'forest',  expr: 'smile',    acc: ['aura', 'leaves'],          bg: 'forest' }
  };

  return { LOOKS: LOOKS, lookOf: function (id) { return LOOKS[id] || LOOKS.futsu; } };
});
