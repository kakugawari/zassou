/*!
 * art.js — ざっそうくんと背景を SVG の文字として描く。DOM を触らない。
 *
 * 絵はすべて自分で描いた図形 (画像ファイルは使わない)。
 * 体・顔・服・背景を部品にして、looks.js の見た目データで組み合わせる。
 *   Art.zassou(look)  ざっそうくんだけ (viewBox 0 0 200 200)
 *   Art.scene(look)   背景つき (viewBox 0 0 240 210) … カードの絵
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Art = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const INK = '#7a5434';        // 輪郭の茶色
  const INK_DARK = '#4a3020';   // 目・口
  let uidCounter = 0;
  function nextUid() { uidCounter += 1; return 'a' + uidCounter; }

  /** 名前から決まる乱数。背景の粒の位置が毎回同じになる。 */
  function seeded(name) {
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r1 = function (x) { return Math.round(x * 10) / 10; };

  // ---------------------------------------------------------------- 体
  const BODY = 'M40 150 L21 113 L50 104 L43 57 L76 88 L88 29 L108 82 L132 35 L142 86 L171 61 L160 106 L185 116 L162 150 Q100 167 40 150 Z';
  const VEINS = 'M100 150 L97 70 M84 146 L60 92 M116 146 L146 98 M100 150 L130 58';

  // from → to は体の上から下への色。star は星空もよう、rainbow はななめの虹
  const TONES = {
    green:   { from: '#cde28f', to: '#9fc15c', vein: '#e8f4c0' },
    gold:    { from: '#fff0a6', to: '#f0b72f', vein: '#fff8d6' },
    crystal: { from: '#e3faff', to: '#8fd3f4', vein: '#ffffff' },
    star:    { from: '#a4a9f2', to: '#5a5fc4', vein: '#dfe2ff' },
    forest:  { from: '#a3dc86', to: '#4d9c52', vein: '#d4f5b8' },
    pink:    { from: '#ffd9e6', to: '#f4a3c0', vein: '#fff0f6' },
    rainbow: { rainbow: true, vein: '#ffffff' }
  };

  function bodyDefs(uid, toneName) {
    const t = TONES[toneName] || TONES.green;
    if (t.rainbow) {
      return '<linearGradient id="' + uid + 'b" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#ff9aa8"/><stop offset=".2" stop-color="#ffd27a"/>' +
        '<stop offset=".4" stop-color="#d4ee8a"/><stop offset=".6" stop-color="#86e0c8"/>' +
        '<stop offset=".8" stop-color="#8fc4ff"/><stop offset="1" stop-color="#c9a2ff"/></linearGradient>';
    }
    return '<linearGradient id="' + uid + 'b" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + t.from + '"/><stop offset="1" stop-color="' + t.to + '"/></linearGradient>';
  }

  function bodyShape(uid, toneName) {
    const t = TONES[toneName] || TONES.green;
    let s = '<path d="' + BODY + '" fill="url(#' + uid + 'b)" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>';
    s += '<path d="' + VEINS + '" fill="none" stroke="' + t.vein + '" stroke-width="3.2" stroke-linecap="round" opacity=".55"/>';
    if (toneName === 'star') {
      const rnd = seeded('bodystar');
      for (let i = 0; i < 16; i++) {
        const x = 52 + rnd() * 100, y = 70 + rnd() * 78;
        s += '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(0.9 + rnd() * 1.6) + '" fill="#fff8c8" opacity="' + r1(0.6 + rnd() * 0.4) + '"/>';
      }
    }
    // 葉のつやの白いすじ
    s += '<path d="M58 122 Q54 108 62 98" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".35"/>';
    return s;
  }

  // ---------------------------------------------------------------- 顔
  function eyes(expr) {
    const dot = function (x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + INK_DARK + '"/>'; };
    const arc = function (d) { return '<path d="' + d + '" fill="none" stroke="' + INK_DARK + '" stroke-width="3.6" stroke-linecap="round"/>'; };
    if (expr === 'sleepy') return arc('M76 118 q7 6 14 0') + arc('M110 118 q7 6 14 0');
    if (expr === 'happy') return arc('M76 121 q7 -9 14 0') + arc('M110 121 q7 -9 14 0');
    if (expr === 'surprise') return dot(83, 117, 6) + dot(117, 117, 6) +
      '<circle cx="85" cy="115" r="2" fill="#fff"/><circle cx="119" cy="115" r="2" fill="#fff"/>';
    return dot(83, 117, 5) + dot(117, 117, 5) +
      '<circle cx="84.6" cy="115.4" r="1.6" fill="#fff"/><circle cx="118.6" cy="115.4" r="1.6" fill="#fff"/>';
  }

  function mouth(expr) {
    const stroke = 'fill="none" stroke="' + INK_DARK + '" stroke-width="3.4" stroke-linecap="round"';
    if (expr === 'open' || expr === 'happy') {
      return '<path d="M89 126 Q100 146 111 126 Z" fill="#f08a9a" stroke="' + INK_DARK + '" stroke-width="3.2" stroke-linejoin="round"/>' +
        '<path d="M94 135 Q100 130 106 135" fill="#ff5f7a" opacity=".8"/>';
    }
    if (expr === 'surprise') return '<ellipse cx="100" cy="132" rx="4.5" ry="6" fill="#f08a9a" stroke="' + INK_DARK + '" stroke-width="3"/>';
    if (expr === 'sleepy') return '<path d="M94 130 Q100 134 106 130" ' + stroke + '/>';
    if (expr === 'smirk') return '<path d="M91 129 Q101 137 111 126" ' + stroke + '/>';
    return '<path d="M91 127 Q100 135 109 127" ' + stroke + '/>';
  }

  function face(expr) {
    return '<ellipse cx="68" cy="129" rx="8" ry="5" fill="#f59a96" opacity=".55"/>' +
      '<ellipse cx="132" cy="129" rx="8" ry="5" fill="#f59a96" opacity=".55"/>' +
      eyes(expr) + mouth(expr);
  }

  /** 手と足。ちいさな「u」のかたち。 */
  function limbs() {
    const u = function (d) { return '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>'; };
    return u('M50 136 q-9 3 -7 13') + u('M150 136 q9 3 7 13') +
      u('M78 158 q2 10 13 6') + u('M122 158 q-2 10 -13 6');
  }

  // ---------------------------------------------------------------- 服・小物
  // back = 体のうしろ、front = 体の前。座標は ざっそうくんの 200 x 200。
  const star4 = function (x, y, r, fill) {
    return '<path d="M' + x + ' ' + (y - r) + ' Q' + (x + r * 0.18) + ' ' + (y - r * 0.18) + ' ' + (x + r) + ' ' + y +
      ' Q' + (x + r * 0.18) + ' ' + (y + r * 0.18) + ' ' + x + ' ' + (y + r) +
      ' Q' + (x - r * 0.18) + ' ' + (y + r * 0.18) + ' ' + (x - r) + ' ' + y +
      ' Q' + (x - r * 0.18) + ' ' + (y - r * 0.18) + ' ' + x + ' ' + (y - r) + 'Z" fill="' + (fill || '#fff7b0') + '"/>';
  };
  const bubble = function (x, y, r) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" stroke="#bfe6f5" stroke-width="2.4"/>' +
      '<circle cx="' + r1(x - r * 0.35) + '" cy="' + r1(y - r * 0.35) + '" r="' + r1(r * 0.22) + '" fill="#e9f8ff"/>';
  };
  const petal = function (x, y, rot, fill) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="7" ry="4.2" fill="' + fill + '" transform="rotate(' + rot + ' ' + x + ' ' + y + ')"/>';
  };
  const flower = function (x, y, s) {
    let g = '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">';
    for (let i = 0; i < 5; i++) {
      g += '<circle cx="0" cy="-9" r="6.5" fill="#fff" stroke="#e7b9c8" stroke-width="1.6" transform="rotate(' + (i * 72) + ')"/>';
    }
    return g + '<circle r="5.2" fill="#ffd54f" stroke="#e0a800" stroke-width="1.6"/></g>';
  };

  const ACC = {
    sprout: { front:
      '<path d="M100 74 Q101 56 100 44" stroke="#5f9a3a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M100 48 Q80 40 78 56 Q96 60 100 48Z" fill="#8ed25a" stroke="#4f7f2e" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M101 52 Q120 42 124 58 Q106 64 101 52Z" fill="#a4e26e" stroke="#4f7f2e" stroke-width="3" stroke-linejoin="round"/>' },
    umbrella: { front:
      '<path d="M30 70 Q40 14 100 12 Q160 14 170 70 Q154 58 142 70 Q128 56 114 70 Q100 56 86 70 Q72 56 58 70 Q44 58 30 70Z" fill="#ff8a8a" stroke="#a84a4a" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M100 14 Q86 40 86 70 M100 14 Q114 40 114 70 M100 14 L100 70" fill="none" stroke="#ffd0d0" stroke-width="3" opacity=".7"/>' +
      '<path d="M156 150 L156 84" stroke="#7a5434" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M100 70 L156 84" stroke="#7a5434" stroke-width="4" stroke-linecap="round" opacity="0"/>' +
      '<path d="M156 84 Q132 66 100 70" fill="none" stroke="#7a5434" stroke-width="4.5" stroke-linecap="round"/>' },
    scarf: { front:
      '<path d="M44 138 Q100 156 158 136 L160 150 Q100 168 42 152 Z" fill="#ef6b6b" stroke="#a84a4a" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M60 144 l3 14 M84 150 l3 14 M110 152 l3 14 M134 148 l3 14" stroke="#ffd0d0" stroke-width="4" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M134 152 L150 186 L166 180 L152 146Z" fill="#ef6b6b" stroke="#a84a4a" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M142 160 l12 -4 M146 170 l12 -4" stroke="#ffd0d0" stroke-width="3.5" stroke-linecap="round"/>' },
    hanaflower: { front: flower(144, 66, 1.35) + flower(60, 80, 0.8) },
    foam: { front:
      bubble(76, 70, 17) + bubble(104, 56, 21) + bubble(132, 70, 16) + bubble(90, 88, 11) + bubble(118, 90, 10) + bubble(150, 54, 7) },
    swimring: { front:
      '<ellipse cx="102" cy="146" rx="70" ry="15" fill="none" stroke="#ff7a8a" stroke-width="15"/>' +
      '<ellipse cx="102" cy="146" rx="70" ry="15" fill="none" stroke="#fff" stroke-width="15" stroke-dasharray="22 44" stroke-dashoffset="8"/>' +
      '<ellipse cx="102" cy="146" rx="77.5" ry="21" fill="none" stroke="#c05060" stroke-width="3"/>' +
      '<ellipse cx="102" cy="146" rx="62.5" ry="9" fill="none" stroke="#c05060" stroke-width="3"/>' },
    ribbon: { front:
      '<path d="M146 66 L120 52 L122 86 Z" fill="#ff7fa8" stroke="#b84a6e" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M146 66 L172 52 L170 86 Z" fill="#ff7fa8" stroke="#b84a6e" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<circle cx="146" cy="68" r="8" fill="#ff5f8f" stroke="#b84a6e" stroke-width="3.5"/>' +
      '<circle cx="132" cy="66" r="2" fill="#fff"/><circle cx="160" cy="68" r="2" fill="#fff"/>' },
    ninja: {
      back: '<path d="M160 98 L196 82 L190 96 L200 110 L162 112Z" fill="#2f3a7a" stroke="#1d2450" stroke-width="3.5" stroke-linejoin="round"/>',
      front: '<path d="M38 96 Q100 84 164 98 L162 114 Q100 100 40 112 Z" fill="#3b4796" stroke="#1d2450" stroke-width="4" stroke-linejoin="round"/>' +
        '<rect x="82" y="92" width="36" height="16" rx="4" fill="#cfd6e4" stroke="#6b7488" stroke-width="3"/>' +
        '<path d="M94 100 l6 -4 l6 4 l-6 4Z" fill="#6b7488"/>' },
    pirate: { front:
      '<path d="M46 86 Q60 30 100 28 Q140 30 156 86 Q100 70 46 86Z" fill="#2b2b3a" stroke="#14141e" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M40 88 Q100 66 160 88 Q150 98 100 94 Q50 98 40 88Z" fill="#3b3b50" stroke="#14141e" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="62" r="9" fill="#f6f3ea"/><circle cx="96.5" cy="61" r="2.2" fill="#2b2b3a"/><circle cx="103.5" cy="61" r="2.2" fill="#2b2b3a"/>' +
      '<path d="M88 74 L112 80 M112 74 L88 80" stroke="#f6f3ea" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M70 112 L92 124" stroke="#14141e" stroke-width="2.6"/><ellipse cx="83" cy="117" rx="11" ry="9" fill="#2b2b3a" stroke="#14141e" stroke-width="2.5"/>' },
    sunglasses: { front:
      '<path d="M66 108 H134 V120 Q132 134 120 134 Q108 134 106 120 H94 Q92 134 80 134 Q68 134 66 120Z" fill="#26262e" stroke="#101016" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M72 114 l8 -2 M110 114 l8 -2" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M66 110 L52 104 M134 110 L148 104" stroke="#26262e" stroke-width="3" stroke-linecap="round"/>' },
    chef: { front:
      '<path d="M66 90 L68 62 Q54 52 66 40 Q74 28 90 34 Q100 18 116 32 Q134 28 138 44 Q150 54 136 64 L134 90 Q100 98 66 90Z" fill="#fff" stroke="#c9c2b4" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M68 82 Q100 90 134 82" fill="none" stroke="#c9c2b4" stroke-width="3"/>' +
      '<path d="M86 62 v16 M100 58 v22 M114 62 v16" stroke="#e8e2d4" stroke-width="3" stroke-linecap="round"/>' },
    witch: { front:
      '<path d="M44 92 Q100 74 156 92 Q100 106 44 92Z" fill="#7b4fa3" stroke="#46286a" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M66 88 Q76 40 112 8 Q112 52 138 88 Q102 78 66 88Z" fill="#9b6fd0" stroke="#46286a" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M69 80 Q102 70 135 80 L138 88 Q102 78 66 88Z" fill="#ffd54f" stroke="#b8860b" stroke-width="2.6" stroke-linejoin="round"/>' +
      star4(104, 50, 8, '#fff3a6') + flower(66, 90, 0.7) },
    wand: { front:
      '<path d="M158 156 L176 98" stroke="#9a6a3a" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M176 70 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1Z" fill="#ffd54f" stroke="#c99400" stroke-width="3" stroke-linejoin="round"/>' +
      star4(196, 62, 6) + star4(158, 84, 5) },
    crown: { front:
      '<path d="M62 86 L64 50 L84 68 L100 40 L116 68 L136 50 L138 86 Q100 96 62 86Z" fill="#ffd54f" stroke="#b8860b" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="64" r="5" fill="#ff5f7a" stroke="#b8860b" stroke-width="2"/><circle cx="76" cy="78" r="3.6" fill="#6fc3ff"/><circle cx="124" cy="78" r="3.6" fill="#6fc3ff"/>' +
      '<circle cx="64" cy="50" r="3.4" fill="#fff"/><circle cx="100" cy="40" r="3.4" fill="#fff"/><circle cx="138" cy="50" r="3.4" fill="#fff"/>' },
    cape: { back:
      '<path d="M44 108 Q18 150 14 188 Q100 176 186 188 Q182 150 156 108Z" fill="#d6455d" stroke="#8c2236" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M18 182 Q100 170 182 182" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="6 6" opacity=".9"/>',
      front: '<path d="M52 140 Q100 158 150 140 L148 150 Q100 168 54 150Z" fill="#fff" stroke="#c9c2b4" stroke-width="3" stroke-linejoin="round"/>' +
        '<circle cx="64" cy="146" r="2.4" fill="#2b2b3a"/><circle cx="88" cy="152" r="2.4" fill="#2b2b3a"/><circle cx="114" cy="153" r="2.4" fill="#2b2b3a"/><circle cx="138" cy="148" r="2.4" fill="#2b2b3a"/>' },
    halo: {
      back: '<path d="M44 108 Q-6 70 14 40 Q28 70 50 98Z" fill="#fff" stroke="#c9d7ea" stroke-width="3.5" stroke-linejoin="round"/>' +
        '<path d="M156 108 Q206 70 186 40 Q172 70 150 98Z" fill="#fff" stroke="#c9d7ea" stroke-width="3.5" stroke-linejoin="round"/>',
      front: '<ellipse cx="100" cy="40" rx="30" ry="9" fill="none" stroke="#ffe27a" stroke-width="7"/>' +
        '<ellipse cx="100" cy="40" rx="30" ry="9" fill="none" stroke="#fff6c4" stroke-width="2.4"/>' },
    nightcap: { front:
      '<path d="M46 94 Q60 40 126 38 Q150 40 168 76 Q150 56 128 58 Q92 60 50 100Z" fill="#6f86d6" stroke="#3b4a8c" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M40 96 Q90 72 156 94 Q150 104 100 100 Q48 104 40 96Z" fill="#eaf0ff" stroke="#9aa8d6" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<circle cx="170" cy="78" r="9" fill="#fff" stroke="#9aa8d6" stroke-width="3"/>' +
      star4(104, 66, 5, '#fff3a6') },
    zzz: { front:
      '<text x="150" y="86" font-size="26" font-weight="900" fill="#ffffff" stroke="#6f86d6" stroke-width="1.4" font-family="sans-serif">Z</text>' +
      '<text x="170" y="62" font-size="18" font-weight="900" fill="#ffffff" stroke="#6f86d6" stroke-width="1.2" font-family="sans-serif">z</text>' },
    sparkle: { front: star4(36, 62, 11) + star4(170, 54, 9) + star4(182, 138, 12) + star4(24, 140, 8) + star4(100, 20, 7) },
    aura: { back:
      '<ellipse cx="100" cy="106" rx="96" ry="88" fill="url(#GLOW)" />' },
    rainbowarc: { back:
      '<path d="M2 190 A98 98 0 0 1 198 190" fill="none" stroke="#ff8f9c" stroke-width="9" opacity=".8"/>' +
      '<path d="M12 190 A88 88 0 0 1 188 190" fill="none" stroke="#ffd36e" stroke-width="9" opacity=".8"/>' +
      '<path d="M22 190 A78 78 0 0 1 178 190" fill="none" stroke="#a9e58b" stroke-width="9" opacity=".8"/>' +
      '<path d="M32 190 A68 68 0 0 1 168 190" fill="none" stroke="#86d4ff" stroke-width="9" opacity=".8"/>' },
    leaves: { front:
      '<path d="M100 76 Q100 50 100 22" stroke="#3f8a45" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M100 36 Q70 22 56 40 Q84 52 100 36Z" fill="#76d27c" stroke="#2f6e3a" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<path d="M100 36 Q130 22 144 40 Q116 52 100 36Z" fill="#8be08d" stroke="#2f6e3a" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<path d="M100 56 Q64 50 50 70 Q82 80 100 56Z" fill="#69c471" stroke="#2f6e3a" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<path d="M100 56 Q136 50 150 70 Q118 80 100 56Z" fill="#7fd886" stroke="#2f6e3a" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<path d="M100 24 Q92 6 100 2 Q108 6 100 24Z" fill="#b6f0a0" stroke="#2f6e3a" stroke-width="3" stroke-linejoin="round"/>' +
      star4(66, 20, 7, '#f2ffd0') + star4(138, 18, 6, '#f2ffd0') + star4(172, 62, 8, '#f2ffd0') + star4(30, 70, 7, '#f2ffd0') }
  };

  // ---------------------------------------------------------------- 背景 (viewBox 240 x 210)
  function stars(name, n, area, color) {
    const rnd = seeded(name);
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = area[0] + rnd() * (area[2] - area[0]);
      const y = area[1] + rnd() * (area[3] - area[1]);
      s += rnd() < 0.4 ? star4(r1(x), r1(y), r1(3 + rnd() * 4), color) :
        '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(0.8 + rnd() * 1.4) + '" fill="' + (color || '#fff') + '" opacity=".9"/>';
    }
    return s;
  }
  function cloud(x, y, s, fill) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="' + (fill || '#fff') + '">' +
      '<ellipse cx="0" cy="0" rx="22" ry="9"/><ellipse cx="-10" cy="-7" rx="11" ry="9"/><ellipse cx="8" cy="-9" rx="13" ry="11"/></g>';
  }
  function hill(c1, c2) {
    return '<path d="M0 178 Q60 160 120 170 Q180 158 240 172 L240 210 L0 210Z" fill="' + c1 + '"/>' +
      '<path d="M0 192 Q70 178 130 188 Q190 178 240 190 L240 210 L0 210Z" fill="' + c2 + '"/>';
  }
  function sky(uid, c1, c2) {
    return '<defs><linearGradient id="' + uid + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="240" height="210" fill="url(#' + uid + 's)"/>';
  }
  function dots(name, color, n, minR, maxR) {
    const rnd = seeded(name);
    let s = '';
    for (let i = 0; i < n; i++) {
      s += '<circle cx="' + r1(rnd() * 240) + '" cy="' + r1(rnd() * 210) + '" r="' + r1(minR + rnd() * (maxR - minR)) + '" fill="' + color + '"/>';
    }
    return s;
  }

  const BG = {
    meadow: function (u) {
      return sky(u, '#d9f1ff', '#f3fbe2') + cloud(52, 44, 1.1) + cloud(190, 64, 0.8) + hill('#bfe29c', '#a6d481') +
        '<circle cx="40" cy="186" r="3" fill="#fff"/><circle cx="198" cy="184" r="3" fill="#ffe27a"/><circle cx="214" cy="192" r="2.4" fill="#fff"/>';
    },
    sun: function (u) {
      let rays = '';
      for (let i = 0; i < 12; i++) rays += '<path d="M120 60 L' + r1(120 + Math.cos(i * Math.PI / 6) * 260) + ' ' + r1(60 + Math.sin(i * Math.PI / 6) * 260) + '" stroke="#fff3b0" stroke-width="10" opacity=".35"/>';
      return sky(u, '#ffe9a8', '#fff6d6') + rays + '<circle cx="196" cy="42" r="20" fill="#ffd54f" stroke="#f2b200" stroke-width="3"/>' + hill('#cfe89a', '#b7d97a');
    },
    night: function (u) {
      return sky(u, '#262a68', '#5c4a9a') + stars('night', 22, [6, 6, 234, 130], '#fff7c4') +
        '<path d="M190 28 a22 22 0 1 0 14 38 a17 17 0 1 1 -14 -38Z" fill="#fff3b0"/>' + hill('#3c3f86', '#2f326e');
    },
    rain: function (u) {
      const rnd = seeded('rain');
      let r = '';
      for (let i = 0; i < 26; i++) { const x = rnd() * 250, y = rnd() * 190; r += '<path d="M' + r1(x) + ' ' + r1(y) + ' l-5 13" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>'; }
      return sky(u, '#aebfd6', '#d4dfec') + cloud(60, 34, 1.3, '#8b9bb4') + cloud(176, 42, 1.1, '#9aa9c0') + r +
        hill('#9cc59a', '#86b585') + '<ellipse cx="46" cy="194" rx="20" ry="4" fill="#cfe3f5"/>';
    },
    snow: function (u) {
      return sky(u, '#cfe4f7', '#eef6fd') + dots('snow', '#fff', 26, 1.4, 3.2) + cloud(184, 40, 0.9, '#f6fbff') +
        '<path d="M0 176 Q70 160 130 172 Q190 160 240 174 L240 210 L0 210Z" fill="#fff"/><path d="M0 194 Q80 182 140 192 Q200 182 240 192 L240 210 L0 210Z" fill="#e5f0fa"/>';
    },
    sea: function (u) {
      let waves = '';
      for (let i = 0; i < 5; i++) waves += '<path d="M' + (i * 52 - 10) + ' ' + (150 + (i % 2) * 6) + ' q13 -9 26 0 t26 0 t26 0" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".75"/>';
      return sky(u, '#aee4ff', '#e8f8ff') + '<circle cx="42" cy="38" r="19" fill="#ffd54f"/>' + cloud(170, 38, 1, '#fff') +
        '<rect y="128" width="240" height="82" fill="#58c0e6"/><rect y="128" width="240" height="6" fill="#8fdcf5"/>' + waves + '<path d="M0 192 Q60 182 120 192 T240 192 L240 210 L0 210Z" fill="#3fa9d4"/>';
    },
    sunset: function (u) {
      return sky(u, '#ff9aa0', '#ffe2a6') + '<circle cx="120" cy="150" r="46" fill="#ffd27a" opacity=".9"/>' +
        cloud(40, 60, 1, '#ffd0c4') + cloud(200, 48, 0.9, '#ffd8c0') + '<path d="M0 170 Q60 150 120 166 Q180 150 240 168 L240 210 L0 210Z" fill="#c4577a"/><path d="M0 190 Q80 176 140 188 Q200 176 240 188 L240 210 L0 210Z" fill="#9a3f66"/>';
    },
    pirate: function (u) {
      let waves = '';
      for (let i = 0; i < 5; i++) waves += '<path d="M' + (i * 52 - 10) + ' ' + (150 + (i % 2) * 8) + ' q13 -9 26 0 t26 0 t26 0" fill="none" stroke="#9fdff2" stroke-width="3.4" stroke-linecap="round"/>';
      return sky(u, '#ffb88a', '#ffe9b8') + '<circle cx="190" cy="104" r="26" fill="#ffd27a"/>' + cloud(50, 40, 1, '#fff0dc') +
        '<rect y="124" width="240" height="86" fill="#2f8fb4"/>' + waves +
        '<path d="M26 128 l0 -30 l22 22Z" fill="#fff" stroke="#8a6a4a" stroke-width="2"/><path d="M26 128 l0 -34" stroke="#8a6a4a" stroke-width="3"/><path d="M14 130 H48 L42 138 H20Z" fill="#8a6a4a"/>' +
        '<path d="M0 192 Q60 182 120 192 T240 192 L240 210 L0 210Z" fill="#237a9e"/>';
    },
    bamboo: function (u) {
      let b = '';
      [18, 52, 196, 224].forEach(function (x, i) {
        b += '<rect x="' + x + '" y="0" width="12" height="190" fill="' + (i % 2 ? '#8fcf8a' : '#a6dc9a') + '"/>';
        for (let y = 30; y < 190; y += 44) b += '<rect x="' + (x - 1) + '" y="' + (y + (i % 2) * 12) + '" width="14" height="4" fill="#5f9f66"/>';
      });
      return sky(u, '#c6e6c4', '#eef7e2') + '<circle cx="122" cy="40" r="20" fill="#fffbe0"/>' + b + hill('#9cc98e', '#82b676');
    },
    sakura: function (u) {
      const rnd = seeded('sakura');
      let p = '';
      for (let i = 0; i < 24; i++) p += petal(r1(rnd() * 240), r1(rnd() * 190), r1(rnd() * 180), i % 3 ? '#ffc4d6' : '#ffe1ea');
      return sky(u, '#ffe6ef', '#fff7f2') + cloud(44, 40, 0.9, '#fff') + p + hill('#cfe8a8', '#b9dc8c');
    },
    bubbles: function (u) {
      const rnd = seeded('bubbles');
      let b = '';
      for (let i = 0; i < 12; i++) b += bubble(r1(rnd() * 230 + 5), r1(rnd() * 150 + 10), r1(5 + rnd() * 11));
      return sky(u, '#c8f0f7', '#eafaf8') + '<rect y="168" width="240" height="42" fill="#fff"/>' + b;
    },
    kitchen: function (u) {
      let c = '';
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) c += '<rect x="' + (i * 30) + '" y="' + (150 + j * 15) + '" width="30" height="15" fill="#f6dba0"/>';
      return sky(u, '#fff4d0', '#fffaf0') + '<rect y="150" width="240" height="60" fill="#fff0c4"/>' + c +
        '<circle cx="38" cy="50" r="16" fill="#fff" stroke="#e8d9b0" stroke-width="3"/><path d="M38 50 V40 M38 50 L46 54" stroke="#b69a60" stroke-width="2.6" stroke-linecap="round"/>' +
        '<rect x="170" y="30" width="46" height="34" rx="5" fill="#ffd9c4" stroke="#e7b49a" stroke-width="3"/>';
    },
    dots: function (u) {
      return sky(u, '#ffe0ec', '#fff3f6') + dots('dots', '#ffc2d8', 24, 3, 8) + hill('#cfe8a8', '#b9dc8c');
    },
    sparkle: function (u) {
      return sky(u, '#d6f1ff', '#f4eaff') + stars('sparkle', 20, [8, 8, 232, 160], '#fff') + cloud(54, 150, 1.1, '#fff') + cloud(190, 140, 1, '#fff');
    },
    heaven: function (u) {
      return sky(u, '#a9dcff', '#f2fbff') + '<ellipse cx="120" cy="40" rx="110" ry="60" fill="#fff8c8" opacity=".5"/>' +
        cloud(48, 150, 1.8) + cloud(200, 156, 1.7) + cloud(120, 192, 2.4) + stars('heaven', 8, [10, 10, 230, 100], '#fff7b0');
    },
    gold: function (u) {
      let rays = '';
      for (let i = 0; i < 16; i++) rays += '<path d="M120 112 L' + r1(120 + Math.cos(i * Math.PI / 8) * 300) + ' ' + r1(112 + Math.sin(i * Math.PI / 8) * 300) + '" stroke="#fff6bf" stroke-width="13" opacity=".4"/>';
      return '<defs><radialGradient id="' + u + 's" cx=".5" cy=".53" r=".7"><stop offset="0" stop-color="#fff7c4"/><stop offset=".6" stop-color="#ffd966"/><stop offset="1" stop-color="#e8a712"/></radialGradient></defs>' +
        '<rect width="240" height="210" fill="url(#' + u + 's)"/>' + rays + stars('gold', 16, [8, 8, 232, 190], '#fffbe0');
    },
    rainbow: function (u) {
      return sky(u, '#bfe8ff', '#fff7e8') +
        '<path d="M-10 200 A130 130 0 0 1 250 200" fill="none" stroke="#ff9aa8" stroke-width="12" opacity=".85"/><path d="M4 200 A116 116 0 0 1 236 200" fill="none" stroke="#ffd27a" stroke-width="12" opacity=".85"/>' +
        '<path d="M18 200 A102 102 0 0 1 222 200" fill="none" stroke="#b8e68c" stroke-width="12" opacity=".85"/><path d="M32 200 A88 88 0 0 1 208 200" fill="none" stroke="#8fd4ff" stroke-width="12" opacity=".85"/>' +
        '<path d="M46 200 A74 74 0 0 1 194 200" fill="none" stroke="#c9a2ff" stroke-width="12" opacity=".85"/>' +
        cloud(30, 168, 1.3) + cloud(212, 170, 1.2) + hill('#c8ebb0', '#b0dd92') + stars('rainbow', 8, [10, 10, 230, 80], '#fff');
    },
    forest: function (u) {
      let trunks = '';
      [[16, 36], [60, 22], [186, 30], [222, 44]].forEach(function (t) {
        trunks += '<rect x="' + t[0] + '" y="' + t[1] + '" width="14" height="170" fill="#6a8f58"/><ellipse cx="' + (t[0] + 7) + '" cy="' + t[1] + '" rx="26" ry="22" fill="#79b560"/>';
      });
      return sky(u, '#d6f5c0', '#9ed38a') + '<path d="M120 0 L60 210 L180 210Z" fill="#fff8c4" opacity=".35"/>' + trunks + hill('#6fbb6a', '#58a85a') + stars('forest', 14, [10, 10, 230, 170], '#f6ffd0');
    },
    red: function (u) {
      return sky(u, '#d9506b', '#a52e4c') + '<path d="M0 0 Q30 90 0 210 M240 0 Q210 90 240 210" stroke="#7d1f38" stroke-width="30" fill="none" opacity=".5"/>' +
        '<rect y="176" width="240" height="34" fill="#f0c36a"/><rect y="176" width="240" height="5" fill="#fff0b0"/>' + stars('red', 10, [60, 10, 180, 100], '#ffe9a0');
    }
  };

  // ---------------------------------------------------------------- 組み立て
  /**
   * ざっそうくんだけを描く。
   * look = { tone, expr, acc: [名前...] }。silhouette: true なら かげ絵。
   */
  function zassou(look, opts) {
    const o = opts || {};
    const uid = o.uid || nextUid();
    const tone = (look && look.tone) || 'green';
    const expr = (look && look.expr) || 'smile';
    const accs = ((look && look.acc) || []).map(function (n) { return ACC[n]; }).filter(Boolean);
    let defs = bodyDefs(uid, tone);
    let back = '', front = '';
    accs.forEach(function (a) {
      if (a.back) back += a.back.replace('url(#GLOW)', 'url(#' + uid + 'g)');
      if (a.front) front += a.front;
    });
    if (back.indexOf(uid + 'g') >= 0) {
      defs += '<radialGradient id="' + uid + 'g"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#bfe6ff" stop-opacity=".55"/><stop offset="1" stop-color="#bfe6ff" stop-opacity="0"/></radialGradient>';
    }
    if (o.silhouette) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="' + BODY + '" fill="#a79fc4" stroke="#a79fc4" stroke-width="6" stroke-linejoin="round"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>' + defs + '</defs>' +
      '<g class="z-back">' + back + '</g>' +
      '<g class="z-body">' + limbs() + bodyShape(uid, tone) + face(expr) + '</g>' +
      '<g class="z-front">' + front + '</g></svg>';
  }

  /** 背景つきの絵 (カードの窓に入れる)。 */
  function scene(look, opts) {
    const o = opts || {};
    const uid = nextUid();
    const bg = BG[(look && look.bg) || 'meadow'] || BG.meadow;
    const inner = zassou(look, { uid: uid + 'z', silhouette: o.silhouette })
      .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const shadow = '<ellipse cx="120" cy="190" rx="66" ry="8" fill="#000" opacity=".16"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 210" preserveAspectRatio="xMidYMid slice">' +
      (o.silhouette ? '<rect width="240" height="210" fill="#d6d0e6"/>' : bg(uid)) + shadow +
      '<g class="z-wrap" transform="translate(20 14) scale(1)">' + inner + '</g></svg>';
  }

  /** 背景だけ (ホーム画面の舞台)。下を基準に、はみ出したぶんを切る。 */
  function background(look) {
    const uid = nextUid();
    const bg = BG[(look && look.bg) || 'meadow'] || BG.meadow;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 210" preserveAspectRatio="xMidYMax slice">' + bg(uid) + '</svg>';
  }

  return {
    zassou: zassou, scene: scene, background: background,
    BG_NAMES: Object.keys(BG), ACC_NAMES: Object.keys(ACC), TONE_NAMES: Object.keys(TONES),
    EXPRS: ['smile', 'open', 'sleepy', 'happy', 'surprise', 'smirk']
  };
});
