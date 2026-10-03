/*!
 * app.js — 操作・描画・演出。ルールは core.js、絵は art.js / looks.js。
 */
(function () {
  'use strict';

  const C = window.Core;
  const L = window.Looks;
  const A = window.Art;
  const K = window.Kuni;

  const VERSION = 'v0.1';
  const SAVE_KEY = 'zassou.save.v1';
  const $ = function (id) { return document.getElementById(id); };

  const els = {
    coinCount: $('coinCount'), ownedCount: $('ownedCount'), ownedTotal: $('ownedTotal'),
    pillCoin: $('pillCoin'),
    homeBg: $('homeBg'), zassou: $('zassou'), zassouArt: $('zassouArt'), bubble: $('bubble'),
    gauge: $('gauge'), freeBanner: $('freeBanner'), air: $('air'),
    machine: $('machine'), pityText: $('pityText'),
    btnFree: $('btnFree'), btnOne: $('btnOne'), btnTen: $('btnTen'), btnRates: $('btnRates'),
    albumHave: $('albumHave'), albumAll: $('albumAll'), albumBar: $('albumBar'),
    filters: $('filters'), albumGrid: $('albumGrid'),
    gachaDot: $('gachaDot'), albumDot: $('albumDot'), kuniDot: $('kuniDot'),
    kuniName: $('kuniName'), kuniLv: $('kuniLv'), kuniTiles: $('kuniTiles'), kuniPeople: $('kuniPeople'),
    taxBtn: $('taxBtn'), taxFill: $('taxFill'), taxNow: $('taxNow'), taxCap: $('taxCap'), taxGo: $('taxGo'),
    kuniMap: $('kuniMap'), kuniRate: $('kuniRate'), sheet: $('sheet'),
    reveal: $('reveal'), revealCount: $('revealCount'), revealSkip: $('revealSkip'),
    revealStage: $('revealStage'), revealHint: $('revealHint'), revealActions: $('revealActions'),
    revealNext: $('revealNext'), revealSummary: $('revealSummary'), summaryGrid: $('summaryGrid'),
    summaryExtra: $('summaryExtra'), revealClose: $('revealClose'),
    zoom: $('zoom'), zoomBack: $('zoomBack'), zoomCard: $('zoomCard'), zoomClose: $('zoomClose'), btnHome: $('btnHome'),
    rates: $('rates'), ratesBody: $('ratesBody'), ratesPity: $('ratesPity'), ratesClose: $('ratesClose'),
    toast: $('toast')
  };

  // ---------------------------------------------------------------- 保存と読み込み
  function load() {
    let s;
    try { s = C.deserialize(localStorage.getItem(SAVE_KEY)); } catch (e) { s = C.newState(); }
    return K.normalize(s);
  }
  let saveTimer = 0;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try { localStorage.setItem(SAVE_KEY, C.serialize(S)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  /** 操作のたびに書かない。少し待ってまとめて書く。 */
  function saveSoon() {
    if (!saveTimer) saveTimer = setTimeout(saveNow, 400);
  }

  let S = load();
  let nowOverride = null;    // テスト用: 時計を差し替える
  const now = function () { return nowOverride !== null ? nowOverride : Date.now(); };
  let rngOverride = null;
  let todayOverride = null;
  const rng = function () { return rngOverride ? rngOverride() : Math.random(); };
  const today = function () { return todayOverride || C.todayKey(); };
  let busy = false;          // ガチャの演出中
  let coinHold = false;      // コインが飛んで着くまで、数字を増やさない
  let albumDirty = true;
  let homeShown = '';
  let currentScreen = 'homeScreen';
  let filter = 'all';

  function commit(next, urgent) {
    const homeChanged = next.home !== S.home;
    S = next;
    if (urgent) saveNow(); else saveSoon();
    renderHud();
    renderGauge();
    renderGacha();
    albumDirty = true;
    if (homeChanged) renderHome();
    if (currentScreen === 'albumScreen') renderAlbum();
    if (currentScreen === 'kuniScreen') { renderKuni(); refreshSheet(); }
  }

  // ---------------------------------------------------------------- 小さな道具
  let toastTimer = 0;
  function toast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2600);
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

  function animate(el, keys, opts) {
    const a = el.animate(keys, Object.assign({ fill: 'both' }, opts));
    return a;
  }
  function done(a) { return a.finished.catch(function () { /* 取り消されても進む */ }); }

  const BURST_COLORS = {
    N: ['#ffffff', '#d9ec9f', '#fff3b0'],
    R: ['#8fd3f4', '#ffffff', '#bfe9ff'],
    SR: ['#ffd54f', '#fff3a6', '#ff8fb3', '#ffffff'],
    UR: ['#ff9aa8', '#ffd27a', '#b8e68c', '#8fd4ff', '#c9a2ff', '#ffffff']
  };

  /** 点を中心から飛ばす。cx, cy は画面の座標。 */
  function burst(cx, cy, rarity, scale) {
    const colors = BURST_COLORS[rarity];
    const n = { N: 10, R: 16, SR: 26, UR: 44 }[rarity];
    const k = scale || 1;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'burst';
      const size = 7 + Math.random() * 11;
      p.style.width = p.style.height = size + 'px';
      p.style.background = colors[i % colors.length];
      if (i % 3 === 0) p.style.borderRadius = '2px';
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = (90 + Math.random() * 200) * k;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const a = p.animate([
        { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(1)', opacity: 1 },
        { transform: 'translate(' + (cx + dx) + 'px,' + (cy + dy) + 'px) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(' + (cx + dx * 1.08) + 'px,' + (cy + dy * 1.08 + 70) + 'px) scale(.2) rotate(240deg)', opacity: 0 }
      ], { duration: 800 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
      a.onfinish = function () { p.remove(); };
    }
  }

  // ---------------------------------------------------------------- 上の帯・ゲージ・点
  let shownCoins = -1;
  function renderHud() {
    const coins = coinHold ? shownCoins : S.coins;
    if (String(coins) !== els.coinCount.textContent) {
      const up = coins > shownCoins && shownCoins >= 0;
      els.coinCount.textContent = String(coins);
      shownCoins = coins;
      if (up) bump(els.pillCoin);
    }
    const have = C.ownedCount(S);
    if (String(have) !== els.ownedCount.textContent) els.ownedCount.textContent = String(have);
    els.ownedTotal.textContent = '/' + C.CARDS.length;
    els.gachaDot.hidden = !C.freeAvailable(S, today());
    els.albumDot.hidden = !C.CARDS.some(function (c) { return C.isNewCard(S, c.id); });
    els.freeBanner.hidden = !C.freeAvailable(S, today());
    const tax = K.pending(S, now());
    els.kuniDot.hidden = !(tax >= 10 && tax >= K.capacity(S) * 0.5);
  }
  function bump(el) {
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }

  function buildGauge() {
    let h = '';
    for (let i = 0; i < C.TAP_GOAL; i++) h += '<i></i>';
    els.gauge.innerHTML = h;
  }
  function renderGauge() {
    const pips = els.gauge.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < S.tapCharge);
  }

  // ---------------------------------------------------------------- ホーム
  const TALK = ['ぷるぷる〜', 'くすぐったいよ', 'えへへ', 'もっと なでて!', 'おなかが すいたな', 'きょうも ざっそう!', 'くさ くさ くさ', 'ひなたぼっこ したい', 'ふふふ'];

  function renderHome() {
    if (homeShown === S.home) return;
    homeShown = S.home;
    const look = L.lookOf(S.home);
    els.homeBg.innerHTML = A.background(look);
    els.zassouArt.innerHTML = A.zassou(look);
  }

  function makeSpecks() {
    let h = '';
    for (let i = 0; i < 12; i++) h += '<i class="speck"></i>';
    els.air.innerHTML = h;
    Array.prototype.forEach.call(els.air.children, function (s, i) {
      s.style.left = (6 + Math.random() * 88) + '%';
      s.style.top = (30 + Math.random() * 50) + '%';
      s.animate([
        { transform: 'translate(0,0) scale(.6)', opacity: 0 },
        { transform: 'translate(' + (Math.random() * 30 - 15) + 'px,-60px) scale(1)', opacity: 0.9, offset: 0.5 },
        { transform: 'translate(' + (Math.random() * 40 - 20) + 'px,-130px) scale(.5)', opacity: 0 }
      ], { duration: 5000 + Math.random() * 4000, delay: i * 700, iterations: Infinity, easing: 'ease-in-out' });
    });
  }

  function floatText(html, x, y, cls) {
    const f = document.createElement('div');
    f.className = 'float' + (cls ? ' ' + cls : '');
    f.innerHTML = html;
    document.body.appendChild(f);
    const a = f.animate([
      { transform: 'translate(' + x + 'px,' + y + 'px) scale(.6)', opacity: 0 },
      { transform: 'translate(' + x + 'px,' + (y - 30) + 'px) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(' + x + 'px,' + (y - 80) + 'px) scale(1)', opacity: 0 }
    ], { duration: 900, easing: 'ease-out', fill: 'both' });
    a.onfinish = function () { f.remove(); };
  }

  let bubbleTimer = 0;
  function say(text) {
    els.bubble.textContent = text;
    els.bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { els.bubble.hidden = true; }, 1400);
  }

  function squish() {
    els.zassou.animate([
      { transform: 'scale(1,1)' },
      { transform: 'scale(1.1,.88)', offset: 0.3 },
      { transform: 'scale(.95,1.06)', offset: 0.65 },
      { transform: 'scale(1,1)' }
    ], { duration: 380, easing: 'ease-out', transformOrigin: '50% 88%' });
  }

  function onPet(ev) {
    ev.preventDefault();
    const r = C.tap(S);
    squish();
    floatText('♥', ev.clientX - 8 + (Math.random() * 50 - 25), ev.clientY - 20);
    if (Math.random() < 0.5 || r.pop) say(r.pop ? 'ぽんっ!' : pick(TALK));
    if (r.pop) {
      coinHold = true;
      shownCoins = S.coins;          // 着くまでは前の数字のまま
    }
    commit(r.state);
    if (r.pop) celebratePop(r.reward);
  }

  /** ぽんっ: 花がひらき、コインが上の財布へ飛んでいく。 */
  function celebratePop(reward) {
    const box = els.zassou.getBoundingClientRect();
    const sx = box.left + box.width / 2;
    const sy = box.top + box.height * 0.45;
    els.zassou.animate([
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(-34px) scale(.94,1.08)', offset: 0.35 },
      { transform: 'translateY(0) scale(1.1,.88)', offset: 0.65 },
      { transform: 'translateY(0) scale(1,1)' }
    ], { duration: 560, easing: 'ease-out' });
    burst(sx, sy, 'SR', 0.7);
    floatText('+' + reward, sx - 24, sy - 60, 'gold');

    const target = els.pillCoin.getBoundingClientRect();
    const tx = target.left + 14;
    const ty = target.top + 6;
    const n = 7;
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span');
      c.className = 'coin fly-coin';
      document.body.appendChild(c);
      const mx = sx + (Math.random() * 160 - 80);
      const my = sy - 80 - Math.random() * 60;
      const a = c.animate([
        { transform: 'translate(' + sx + 'px,' + sy + 'px) scale(.4)', opacity: 0 },
        { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.1)', opacity: 1, offset: 0.35 },
        { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.7)', opacity: 1 }
      ], { duration: 900, delay: 120 + i * 70, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' });
      a.onfinish = function () {
        c.remove();
        landed++;
        if (landed === n) { coinHold = false; renderHud(); }
      };
    }
    // 万一 animate が走らなくても、数字がいつまでも止まらないように
    setTimeout(function () { if (coinHold) { coinHold = false; renderHud(); } }, 2200);
  }

  // ---------------------------------------------------------------- カード
  function starsHtml(n) {
    let h = '';
    for (let i = 1; i <= C.MAX_STARS; i++) h += i <= n ? '★' : '<span class="off">★</span>';
    return h;
  }
  function statHtml(card) {
    const names = ['かわいさ', 'のんびり', 'ねばり'];
    return card.stats.map(function (v, i) {
      let dots = '';
      for (let k = 1; k <= 5; k++) dots += '<i' + (k <= v ? ' class="on"' : '') + '></i>';
      return '<div class="c-stat"><span>' + names[i] + '</span>' + dots + '</div>';
    }).join('');
  }

  /** カード 1 枚の HTML。locked なら未発見 (かげ絵と ???)。 */
  function cardHtml(card, opts) {
    const o = opts || {};
    const rar = C.RARITY[card.rarity];
    const seriesName = C.SERIES.filter(function (s) { return s.id === card.series; })[0].name;
    if (o.locked) {
      return '<div class="cardwrap"><div class="card r-' + card.rarity + ' locked"><div class="card-in">' +
        '<div class="c-head"><span class="c-no">' + C.noLabel(card) + '</span><span class="c-rar">' + card.rarity + '</span></div>' +
        '<div class="c-name">？？？</div>' +
        '<div class="c-art">' + A.scene(L.lookOf(card.id), { silhouette: true }) + '<div class="qmark">?</div></div>' +
        '<div class="c-mid"><span></span><span>' + seriesName + '</span></div>' +
        '<div class="c-text">まだ であっていない ざっそうくん</div>' +
        '<div class="c-stats">' + statHtml({ stats: [0, 0, 0] }) + '</div>' +
        '</div></div></div>';
    }
    return '<div class="cardwrap"><div class="card r-' + card.rarity + (o.live ? ' live' : '') + '" data-id="' + card.id + '"><div class="card-in">' +
      '<div class="c-head"><span class="c-no">' + C.noLabel(card) + '</span><span class="c-rar" title="' + rar.label + '">' + card.rarity + '</span></div>' +
      '<div class="c-name">' + card.name + '</div>' +
      '<div class="c-art">' + A.scene(L.lookOf(card.id)) + '</div>' +
      '<div class="c-mid"><span class="c-stars" aria-label="ぴかぴか">' + starsHtml(o.stars || 0) + '</span><span>' + seriesName + '</span></div>' +
      '<div class="c-text">' + card.text + '</div>' +
      '<div class="c-stats">' + statHtml(card) + '</div>' +
      '<div class="holo"></div></div></div></div>';
  }

  // ---------------------------------------------------------------- アルバム
  function buildFilters() {
    const items = [{ id: 'all', name: 'ぜんぶ' }].concat(C.SERIES.map(function (s) {
      return { id: s.id, name: s.name.replace(' ざっそう', '') };
    }));
    els.filters.innerHTML = items.map(function (f) {
      return '<button type="button" class="chip' + (f.id === filter ? ' on' : '') + '" data-f="' + f.id + '">' + f.name + '</button>';
    }).join('');
  }

  function renderAlbum() {
    if (!albumDirty && els.albumGrid.dataset.filter === filter) return;
    albumDirty = false;
    els.albumGrid.dataset.filter = filter;
    const have = C.ownedCount(S);
    els.albumHave.textContent = String(have);
    els.albumAll.textContent = String(C.CARDS.length);
    els.albumBar.style.width = Math.round(have / C.CARDS.length * 100) + '%';
    Array.prototype.forEach.call(els.filters.children, function (b) { b.classList.toggle('on', b.dataset.f === filter); });
    const list = C.CARDS.filter(function (c) { return filter === 'all' || c.series === filter; });
    const scroll = els.albumGrid.scrollTop;
    els.albumGrid.innerHTML = list.map(function (c) {
      const owned = S.owned[c.id] > 0;
      return '<button type="button" class="slot" data-id="' + c.id + '"' + (owned ? '' : ' data-locked="1"') +
        ' aria-label="' + (owned ? c.name : 'まだ であっていない ' + C.noLabel(c)) + '">' +
        (C.isNewCard(S, c.id) ? '<span class="newtag">NEW</span>' : '') +
        cardHtml(c, owned ? { stars: C.starsOf(S, c.id) } : { locked: true }) + '</button>';
    }).join('') + '<div class="ver" style="grid-column:1/-1;text-align:center;font-size:11px;color:#a07c58;padding:6px 0 2px">ざっそうくんのガチャ ' + VERSION + '</div>';
    els.albumGrid.scrollTop = scroll;
  }

  // ---------------------------------------------------------------- カードを大きく見る
  let zoomId = null;
  function openZoom(id) {
    if (!(S.owned[id] > 0)) {
      toast('まだ であっていない ざっそうくんだよ' + '\n' + 'ガチャで さがそう!');
      return;
    }
    zoomId = id;
    const card = C.cardById(id);
    if (C.isNewCard(S, id)) commit(C.markSeen(S, id));
    els.zoomCard.innerHTML = cardHtml(card, { stars: C.starsOf(S, id), live: true });
    updateZoomButtons();
    els.zoom.hidden = false;
    const c = els.zoomCard.firstElementChild;
    animate(c, [{ transform: 'scale(.7) translateY(30px)', opacity: 0 }, { transform: 'scale(1) translateY(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.3,.4,1)' });
  }
  function updateZoomButtons() {
    const isHome = S.home === zoomId;
    els.btnHome.setAttribute('aria-disabled', isHome ? 'true' : 'false');
    els.btnHome.querySelector('.gbtn-main').textContent = isHome ? 'かざってるよ' : 'ホームに かざる';
  }
  function closeZoom() { els.zoom.hidden = true; zoomId = null; }

  function tilt(ev) {
    const card = els.zoomCard.querySelector('.card');
    if (!card) return;
    const r = els.zoomCard.getBoundingClientRect();
    const px = Math.max(-0.5, Math.min(0.5, (ev.clientX - r.left) / r.width - 0.5));
    const py = Math.max(-0.5, Math.min(0.5, (ev.clientY - r.top) / r.height - 0.5));
    card.classList.add('tilt');
    card.style.setProperty('--rx', String(Math.round(px * 22)));
    card.style.setProperty('--ry', String(Math.round(-py * 22)));
    card.style.setProperty('--mx', Math.round((px + 0.5) * 100) + '%');
  }
  function untilt() {
    const card = els.zoomCard.querySelector('.card');
    if (!card) return;
    card.classList.remove('tilt');
    card.style.setProperty('--rx', '0');
    card.style.setProperty('--ry', '0');
  }

  // ---------------------------------------------------------------- くに
  const LAND_NAME = { yakusho: 'やくしょ', nohara: 'のはら', oka: 'おか', mori: 'もり', mizu: 'みずうみ', hana: 'はなばたけ' };
  let kuniSig = '';
  let sel = null;                 // 選んでいるマス { x, y }
  const fmt = function (n) { return String(Math.round(n * 10) / 10); };
  const pct = function (n) { return '+' + Math.round(n * 100) + '%'; };
  const shortName = function (card) { return card.name.replace(' ざっそう', ''); };

  function thumbSvg(id) { return A.zassou(L.lookOf(id)); }

  function tileHtml(x, y) {
    const st = K.statusOf(S, x, y);
    const type = K.typeAt(x, y);
    let inner = '';
    const cls = 'tile';
    if (st === 'owned') {
      const t = S.kuni.tiles[K.key(x, y)];
      inner = '<div class="ground">' + A.tile(type, x, y) + '</div>';
      if (t.res) {
        inner += '<div class="res">' + thumbSvg(t.res) + '</div><span class="bonus">' + pct(K.residentBonus(S, t.res)) + '</span>';
      }
    } else if (st === 'buy') {
      const price = K.canBuy(S, x, y).price;
      inner = '<div class="ground">' + A.tile(type, x, y) + '</div><span class="price' + (S.coins >= price ? '' : ' poor') + '"><span class="coin"></span>' + price + '</span>';
    } else {
      inner = '<div class="ground"></div>';
    }
    const label = st === 'owned' ? LAND_NAME[type] : st === 'buy' ? 'かえる とち' : 'まだ ひらけない とち';
    return '<button type="button" class="' + cls + '" data-x="' + x + '" data-y="' + y + '" data-s="' + st + '" aria-label="' + label + '">' + inner + '</button>';
  }

  function renderKuni() {
    const lv = K.levelOf(S);
    els.kuniName.textContent = lv.title;
    els.kuniLv.textContent = 'Lv.' + S.kuni.lv;
    els.kuniTiles.textContent = String(K.tileCount(S));
    els.kuniPeople.textContent = String(K.peopleCount(S));
    const rate = K.ratePerHour(S);
    els.kuniRate.innerHTML = '1じかんで <b>+' + fmt(rate) + '</b> コイン<small>ためておけるのは ' + lv.hours + 'じかんぶん (' + Math.floor(K.capacity(S)) + 'コイン)</small>';
    const sig = JSON.stringify([S.kuni.lv, S.kuni.tiles, Math.floor(S.coins / 5), S.owned]);   // 選んだマスは入れない (枠は class だけ付け替える)
    if (sig !== kuniSig) {
      kuniSig = sig;
      let h = '';
      for (let y = 0; y < K.SIZE; y++) for (let x = 0; x < K.SIZE; x++) h += tileHtml(x, y);
      els.kuniMap.innerHTML = h;
    }
    markSel();
    updateTax();
  }

  /** 選んでいるマスの枠。地図を描き直さずに、class だけ付け替える。 */
  function markSel() {
    const old = els.kuniMap.querySelector('.tile.sel');
    if (old) old.classList.remove('sel');
    if (!sel) return;
    const el = els.kuniMap.querySelector('.tile[data-x="' + sel.x + '"][data-y="' + sel.y + '"]');
    if (el) el.classList.add('sel');
  }

  /** たまっているぜいきんの表示だけを更新する (1秒ごと)。 */
  function updateTax() {
    const pend = K.pending(S, now());
    const cap = K.capacity(S);
    const whole = Math.floor(pend);
    const full = cap > 0 && pend >= cap - 0.01;
    if (els.taxNow.textContent !== String(whole)) els.taxNow.textContent = String(whole);
    els.taxCap.textContent = '/ ' + Math.floor(cap);
    els.taxFill.style.width = Math.min(100, cap > 0 ? pend / cap * 100 : 0).toFixed(1) + '%';
    els.taxGo.textContent = full ? 'いっぱい!' : 'うけとる';
    els.taxBtn.setAttribute('aria-disabled', whole >= 1 ? 'false' : 'true');
  }

  function onTax() {
    const r = K.collect(S, now());
    if (r.amount < 1) { toast('まだ たまっていないよ\nちょっと まってね'); return; }
    commit(r.state);
    const b = els.taxBtn.getBoundingClientRect();
    floatText('+' + r.amount, b.left + b.width / 2 - 24, b.top, 'gold');
    burst(b.left + 60, b.top + 28, 'R', 0.6);
    bump(els.pillCoin);
  }

  // --- 下から出る札 (土地・住民・役所)。マスの位置によって上か下に出し、選んだマスを隠さない
  function openSheet(x, y) {
    sel = { x: x, y: y };
    renderKuni();
    refreshSheet();
  }
  function closeSheet() {
    sel = null;
    els.sheet.hidden = true;
    renderKuni();
  }

  function refreshSheet() {
    if (!sel) { els.sheet.hidden = true; return; }
    const x = sel.x, y = sel.y;
    const st = K.statusOf(S, x, y);
    const type = K.typeAt(x, y);
    els.sheet.dataset.pos = y >= 4 ? 'top' : 'bottom';
    let h = '';
    const head = function (title, sub) {
      return '<div class="sheet-top"><div><h3>' + title + '</h3><small>' + sub + '</small></div><button type="button" class="sheet-x" data-act="close" aria-label="とじる">✕</button></div>';
    };
    if (st === 'buy') {
      const c = K.canBuy(S, x, y);
      const gain = K.BASE_RATE * K.TYPES[type].mult * K.levelOf(S).mult;
      h = head(LAND_NAME[type] + 'の とち', 'となりに つづく あたらしい とち') +
        '<div class="sheet-body">かうと、ぜいきんが 1じかんで <b>+' + fmt(gain) + '</b> ふえるよ。' +
        (K.TYPES[type].mult > 1 ? '<br>' + LAND_NAME[type] + 'は ふえやすい とち!' : '') + '</div>' +
        '<div class="sheet-row"><button type="button" class="gbtn gray" data-act="close"><span class="gbtn-main">やめる</span></button>' +
        '<button type="button" class="gbtn one" data-act="buy" aria-disabled="' + (c.ok ? 'false' : 'true') + '"><span class="gbtn-main">かう</span><span class="gbtn-sub"><span class="coin"></span>' + c.price + '</span></button></div>';
    } else if (st === 'owned' && type === 'yakusho') {
      const lv = K.levelOf(S);
      const info = K.upgradeInfo(S);
      h = head('ざっそうやくしょ', lv.title + ' / Lv.' + S.kuni.lv);
      h += '<div class="sheet-body">ぜいきんを ためて、くにを おおきく するところ。<br>ためておけるのは <b>' + lv.hours + 'じかん</b>、しゅうにゅうは <b>x' + lv.mult + '</b></div>';
      if (info.max) {
        h += '<div class="empty-note">やくしょは いちばん おおきくなったよ!</div>';
      } else {
        const n = info.next;
        const lack = function (what) { return info.lacks.some(function (l) { return l.what === what; }); };
        h += '<div class="sheet-body" style="margin-top:6px">Lv.' + n.lv + ' <b>' + n.title + '</b> に するには:</div><ul class="need">' +
          '<li class="' + (lack('tiles') ? '' : 'ok') + '">とちが ' + n.need.tiles + 'こ いじょう (いま ' + K.tileCount(S) + ')</li>' +
          (n.need.people ? '<li class="' + (lack('people') ? '' : 'ok') + '">すみびとが ' + n.need.people + 'にん いじょう (いま ' + K.peopleCount(S) + ')</li>' : '') +
          '<li class="' + (lack('coins') ? '' : 'ok') + '">コイン ' + n.cost + '</li></ul>' +
          '<div class="sheet-row"><button type="button" class="gbtn ten" data-act="upgrade" aria-disabled="' + (info.ok ? 'false' : 'true') + '"><span class="gbtn-main">レベルアップ</span>' +
          '<span class="gbtn-sub"><span class="coin"></span>' + n.cost + '</span></button></div>';
      }
    } else if (st === 'owned') {
      const t = S.kuni.tiles[K.key(x, y)];
      const base = K.TYPES[type].mult;
      h = head(LAND_NAME[type], 'ぜいきん 1じかんで +' + fmt(K.tileRate(S, x, y) * K.levelOf(S).mult) + ' (' + (base > 1 ? 'ふえやすい とち' : 'ふつうの とち') + ')');
      if (t.res) {
        const card = C.cardById(t.res);
        h += '<div class="sheet-body res-now"><div class="thumb">' + thumbSvg(t.res) + '</div><div class="meta"><b>' + shortName(card) + '</b>' +
          '<small>ぜいきん ' + pct(K.residentBonus(S, t.res)) + '</small></div>' +
          '<button type="button" class="gbtn gray" data-act="home"><span class="gbtn-main">かえす</span></button></div>';
      } else {
        h += '<div class="sheet-body">ざっそうくんを すませると、ぜいきんが ふえるよ。</div>';
      }
      const picks = C.CARDS.filter(function (c) { return K.freeCopies(S, c.id) > 0; })
        .sort(function (a, b) { return K.residentBonus(S, b.id) - K.residentBonus(S, a.id); });
      if (picks.length) {
        h += '<div class="picks">' + picks.map(function (c) {
          const free = K.freeCopies(S, c.id);
          return '<button type="button" class="pick" data-act="pick" data-id="' + c.id + '"><div class="thumb">' + thumbSvg(c.id) + '</div>' +
            '<span class="nm">' + shortName(c) + '</span><span class="up">' + pct(K.residentBonus(S, c.id)) + '</span>' + (free > 1 ? '<span class="n">あと ' + free + 'まい</span>' : '') + '</button>';
        }).join('') + '</div>';
      } else if (!t.res) {
        h += '<div class="empty-note">すませる ざっそうくんが いないよ。<br>ガチャで あつめよう!</div>';
      }
    }
    els.sheet.innerHTML = h;
    els.sheet.hidden = false;
  }

  function onSheetClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !sel) return;
    const act = el.dataset.act;
    if (act === 'close') { closeSheet(); return; }
    if (el.getAttribute('aria-disabled') === 'true') {
      if (act === 'buy') toast('コインが たりないよ!\nホームで なでて ためよう');
      if (act === 'upgrade') toast('まだ じょうけんが そろってないよ');
      return;
    }
    if (act === 'buy') {
      const r = K.buy(S, sel.x, sel.y, now());
      if (r.ok) {
        const tx = sel.x, ty = sel.y;
        commit(r.state);
        sel = null;
        els.sheet.hidden = true;
        renderKuni();
        const tile = els.kuniMap.querySelector('.tile[data-x="' + tx + '"][data-y="' + ty + '"]');
        if (tile) {
          tile.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.18)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
          const b = tile.getBoundingClientRect();
          burst(b.left + 27, b.top + 27, 'N', 0.5);
        }
        toast('あたらしい とちを てにいれた!');
      } else {
        toast('かえなかったよ');
      }
    } else if (act === 'pick' || act === 'home') {
      const r = K.assign(S, sel.x, sel.y, act === 'pick' ? el.dataset.id : null, now());
      if (r.ok) commit(r.state);
    } else if (act === 'upgrade') {
      const r = K.upgrade(S, now());
      if (r.ok) {
        commit(r.state);
        burst(215, 300, 'SR', 1);
        toast(K.levelOf(S).title + ' に なったよ!\nもっと ひろい とちが かえるよ');
      }
    }
  }

  function onMapClick(e) {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const x = Number(tile.dataset.x), y = Number(tile.dataset.y);
    const st = tile.dataset.s;
    if (st === 'level') { toast('やくしょの レベルを あげると\nここまで ひろげられるよ'); return; }
    if (st === 'far') { toast('となりの とちを かってから!'); return; }
    openSheet(x, y);
  }

  // ---------------------------------------------------------------- ガチャの画面
  const CAP_COLORS = ['#8fd3f4', '#ffd54f', '#ff8fb3', '#a6d96a', '#c9a2ff', '#ff9a62'];

  function machineSvg() {
    const caps = [[100, 196], [150, 202], [200, 196], [76, 160], [126, 166], [176, 164], [224, 158], [104, 126], [158, 128], [204, 120], [128, 92], [172, 88]];
    let capSvg = '';
    caps.forEach(function (p, i) {
      const x = p[0], y = p[1], r = 25, col = CAP_COLORS[i % CAP_COLORS.length];
      capSvg += '<g transform="rotate(' + ((i * 47) % 60 - 30) + ' ' + x + ' ' + y + ')">' +
        '<path d="M' + (x - r) + ' ' + y + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z" fill="' + col + '"/>' +
        '<path d="M' + (x - r) + ' ' + y + ' A' + r + ' ' + r + ' 0 0 0 ' + (x + r) + ' ' + y + 'Z" fill="#fff"/>' +
        '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="#6b4a7a" stroke-width="2.6"/>' +
        '<ellipse cx="' + (x - 9) + '" cy="' + (y - 11) + '" rx="6" ry="3.4" fill="#fff" opacity=".8" transform="rotate(-30 ' + (x - 9) + ' ' + (y - 11) + ')"/></g>';
    });
    const mascot = A.zassou({ tone: 'green', expr: 'open', acc: [] })
      .replace(/^<svg[^>]*>/, '<svg x="96" y="-28" width="108" height="108" viewBox="0 0 200 200" overflow="visible">');
    return '<svg viewBox="0 -56 300 452" style="font-family:var(--font)">' +
      '<defs>' +
      '<radialGradient id="mdome" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#dff3ff" stop-opacity=".85"/><stop offset="1" stop-color="#a9dcf5" stop-opacity=".9"/></radialGradient>' +
      '<linearGradient id="mbody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7ea1"/><stop offset=".5" stop-color="#ffa6c0"/><stop offset="1" stop-color="#ff7ea1"/></linearGradient>' +
      '<clipPath id="mclip"><circle cx="150" cy="128" r="101"/></clipPath></defs>' +
      '<ellipse cx="150" cy="378" rx="120" ry="12" fill="#6b4a2f" opacity=".18"/>' +
      '<g id="mMascot">' + mascot + '</g>' +
      '<rect x="62" y="336" width="176" height="30" rx="10" fill="#c9486c" stroke="#7d2a45" stroke-width="4"/>' +
      '<rect x="32" y="196" width="236" height="150" rx="30" fill="url(#mbody)" stroke="#7d2a45" stroke-width="5"/>' +
      '<path d="M50 214 Q50 204 62 204 H238" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>' +
      '<g id="mCaps" clip-path="url(#mclip)"><rect x="40" y="20" width="220" height="220" fill="#eaf7ff"/>' + capSvg + '</g>' +
      '<circle cx="150" cy="128" r="104" fill="url(#mdome)" opacity=".42"/>' +
      '<circle cx="150" cy="128" r="104" fill="none" stroke="#7d2a45" stroke-width="5"/>' +
      '<path d="M84 70 Q104 42 140 36" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".85"/>' +
      '<rect x="78" y="220" width="144" height="28" rx="14" fill="#fff6dc" stroke="#7d2a45" stroke-width="4"/>' +
      '<text x="150" y="240" text-anchor="middle" font-size="15" font-weight="900" fill="#c9486c">ざっそう ガチャ</text>' +
      '<circle cx="150" cy="286" r="34" fill="#fff6dc" stroke="#7d2a45" stroke-width="4.5"/>' +
      '<g id="mCrank" style="transform-box:fill-box;transform-origin:center"><rect x="112" y="279" width="76" height="14" rx="7" fill="#ffd54f" stroke="#a87800" stroke-width="3.6"/>' +
      '<circle cx="188" cy="286" r="12" fill="#ffd54f" stroke="#a87800" stroke-width="3.6"/><circle cx="150" cy="286" r="9" fill="#ffb300" stroke="#a87800" stroke-width="3.4"/></g>' +
      '<rect x="206" y="268" width="46" height="46" rx="12" fill="#7d2a45"/><rect x="214" y="276" width="30" height="30" rx="8" fill="#3a1424"/>' +
      '<path d="M68 306 Q68 322 84 322 H112" fill="none" stroke="#7d2a45" stroke-width="0"/></svg>';
  }

  function renderGacha() {
    const free = C.freeAvailable(S, today());
    els.btnFree.hidden = !free;
    els.btnOne.setAttribute('aria-disabled', S.coins >= C.PRICE_ONE ? 'false' : 'true');
    els.btnTen.setAttribute('aria-disabled', S.coins >= C.PRICE_TEN ? 'false' : 'true');
    const left = Math.max(1, C.PITY - S.sinceSR);
    els.pityText.innerHTML = 'あと <b>' + left + '</b> かいで SR いじょう かくてい!';
  }

  async function machineRun() {
    const crank = $('mCrank');
    const caps = $('mCaps');
    const machine = els.machine.firstElementChild;
    const a1 = animate(crank, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(540deg)' }], { duration: 850, easing: 'ease-in-out' });
    animate(caps, [
      { transform: 'translate(0,0)' }, { transform: 'translate(-6px,4px)' }, { transform: 'translate(6px,-3px)' },
      { transform: 'translate(-5px,-4px)' }, { transform: 'translate(5px,3px)' }, { transform: 'translate(0,0)' }
    ], { duration: 850, easing: 'linear' });
    animate(machine, [
      { transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' },
      { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }
    ], { duration: 850 });
    await done(a1);
  }

  // ---------------------------------------------------------------- ガチャの演出
  let wake = null;
  function waitFor(setup) {
    return new Promise(function (resolve) {
      wake = function () { wake = null; resolve(); };
      setup(wake);
    });
  }
  let skipped = false;

  function capTopStyle(rarity) {
    if (rarity === 'UR') return 'conic-gradient(#ff9aa8, #ffd27a, #b8e68c, #8fd4ff, #c9a2ff, #ff9aa8)';
    return { N: 'linear-gradient(#a9e0f7, #6ec3ec)', R: 'linear-gradient(#ffe27a, #ffc21f)', SR: 'linear-gradient(#ffb0cb, #ff7aa6)' }[rarity];
  }

  function makeCapsule(rarity) {
    const cap = document.createElement('div');
    cap.className = 'capsule';
    cap.style.setProperty('--cap-top', capTopStyle(rarity));
    cap.innerHTML = '<div class="cap-half cap-bot"></div><div class="cap-half cap-top"></div><i class="cap-shine"></i>';
    return cap;
  }

  async function showOne(r, i, n) {
    const rarity = r.card.rarity;
    els.revealStage.innerHTML = '';
    els.revealActions.hidden = true;
    els.revealCount.textContent = n > 1 ? (i + 1) + ' / ' + n : '';
    els.revealHint.hidden = true;

    // 1. カプセルがころんと落ちてくる
    const cap = makeCapsule(rarity);
    els.revealStage.appendChild(cap);
    const drop = animate(cap, [
      { transform: 'translateY(-720px) rotate(-60deg)' },
      { transform: 'translateY(0) rotate(0deg)', offset: 0.55 },
      { transform: 'translateY(-70px) rotate(8deg)', offset: 0.7 },
      { transform: 'translateY(0) rotate(0)', offset: 0.85 },
      { transform: 'translateY(-16px)', offset: 0.93 },
      { transform: 'translateY(0)' }
    ], { duration: i === 0 ? 950 : 650, easing: 'ease-in' });
    await done(drop);
    if (skipped) return;

    // 2. タップで ひらく
    els.revealHint.textContent = 'タップして ひらこう!';
    els.revealHint.hidden = false;
    const wob = animate(cap, [
      { transform: 'rotate(-5deg) scale(1)' }, { transform: 'rotate(5deg) scale(1.04)' }, { transform: 'rotate(-5deg) scale(1)' }
    ], { duration: 520, iterations: Infinity, easing: 'ease-in-out' });
    await waitFor(function (resolve) {
      const onTap = function () { els.revealStage.removeEventListener('click', onTap); els.revealHint.removeEventListener('click', onTap); resolve(); };
      els.revealStage.addEventListener('click', onTap);
      els.revealHint.addEventListener('click', onTap);
    });
    wob.cancel();
    if (skipped) return;
    els.revealHint.hidden = true;

    // 3. ぱかっ! 光と点
    const box = cap.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const top = cap.querySelector('.cap-top'), bot = cap.querySelector('.cap-bot');
    animate(top, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(-40px,-120px) rotate(-40deg)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
    animate(bot, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(40px,90px) rotate(30deg)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
    const flash = document.createElement('div');
    flash.className = 'flash';
    els.revealStage.appendChild(flash);
    animate(flash, [{ opacity: 0 }, { opacity: rarity === 'UR' ? 1 : rarity === 'SR' ? 0.9 : 0.6, offset: 0.25 }, { opacity: 0 }], { duration: rarity === 'UR' ? 900 : 520 });
    burst(cx, cy, rarity);
    if (rarity === 'UR') setTimeout(function () { burst(cx, cy - 40, 'UR', 1.2); }, 260);
    await wait(rarity === 'N' ? 280 : 380);
    cap.remove();
    if (skipped) return;

    // 4. カードが くるっと出てくる
    const holder = document.createElement('div');
    holder.className = 'rcard';
    holder.innerHTML = cardHtml(r.card, { stars: r.stars, live: true });
    els.revealStage.appendChild(holder);
    const flip = animate(holder, [
      { transform: 'scale(.15) rotateY(180deg)', opacity: 0 },
      { transform: 'scale(1.12) rotateY(0deg)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1) rotateY(0deg)', opacity: 1 }
    ], { duration: 620, easing: 'cubic-bezier(.2,.8,.3,1)' });
    await done(flip);

    const label = badgeFor(r);
    if (label) {
      const b = document.createElement('div');
      b.className = 'rbadge ' + label.cls;
      b.innerHTML = label.html;
      els.revealStage.appendChild(b);
      animate(b, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 360, easing: 'ease-out' });
    }
    if (rarity === 'SR' || rarity === 'UR') {
      animate(holder, [{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(6px,-3px)' }, { transform: 'translate(0,0)' }], { duration: 260, delay: 0 });
      burst(cx, cy, rarity, 1.2);
    }
    els.revealNext.querySelector('.gbtn-main').textContent = n === 1 ? 'とじる' : i === n - 1 ? 'けっかを みる' : 'つぎへ';
    await wait(450);
    if (skipped) return;
    els.revealActions.hidden = false;
    await waitFor(function (resolve) {
      const onNext = function () { els.revealNext.removeEventListener('click', onNext); resolve(); };
      els.revealNext.addEventListener('click', onNext);
    });
  }

  function badgeFor(r) {
    if (r.isNew) return { cls: 'new', html: 'NEW!' + (r.card.rarity === 'UR' ? ' でんせつ!!' : r.card.rarity === 'SR' ? ' すごい!' : '') };
    if (r.refund) return { cls: 'refund', html: 'もう ★5! <span class="coin"></span>+' + r.refund };
    if (r.levelUp) return { cls: 'up', html: 'ぴかぴか アップ! ★' + r.stars };
    return null;
  }

  async function playReveal(res) {
    const results = res.results;
    const n = results.length;
    skipped = false;
    els.reveal.hidden = false;
    els.revealSummary.hidden = true;
    els.revealSkip.hidden = n < 2;
    els.revealStage.hidden = false;
    for (let i = 0; i < n && !skipped; i++) await showOne(results[i], i, n);

    els.revealStage.innerHTML = '';
    els.revealActions.hidden = true;
    els.revealHint.hidden = true;
    els.revealSkip.hidden = true;
    els.revealCount.textContent = '';

    const extras = [];
    const refund = results.reduce(function (s, r) { return s + r.refund; }, 0);
    if (refund) extras.push('かぶった ぶんの コイン +' + refund);
    res.milestones.forEach(function (m) { extras.push('🎉 ' + m[0] + 'まい あつめた ごほうび! コイン +' + m[1]); });

    if (n === 1 && !skipped) {
      els.reveal.hidden = true;
      if (res.milestones.length) toast(extras.slice(-res.milestones.length).join('\n'));
      return;
    }
    // まとめ
    els.summaryGrid.className = n === 1 ? 'one' : '';
    els.summaryGrid.innerHTML = results.map(function (r) {
      return '<div class="slot" aria-label="' + r.card.name + '">' + (r.isNew ? '<span class="newtag">NEW</span>' : '') +
        cardHtml(r.card, { stars: r.stars }) + '</div>';
    }).join('');
    els.summaryExtra.innerHTML = extras.join('<br>');
    els.revealSummary.hidden = false;
    animate(els.summaryGrid, [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
    await waitFor(function (resolve) {
      const onClose = function () { els.revealClose.removeEventListener('click', onClose); resolve(); };
      els.revealClose.addEventListener('click', onClose);
    });
    els.revealSummary.hidden = true;
    els.reveal.hidden = true;
  }

  async function startDraw(mode) {
    if (busy) return;
    const res = C.draw(S, mode, rng, today());
    if (!res.ok) {
      if (res.reason === 'coins') toast('コインが たりないよ!\nホームで ざっそうくんを なでて ためよう');
      return;
    }
    busy = true;
    commit(res.state, true);
    try {
      await machineRun();
      await playReveal(res);
    } finally {
      busy = false;
      renderGacha();
      renderHud();
    }
  }

  // ---------------------------------------------------------------- ていしゅつわりあい
  function openRates() {
    const total = C.RARITIES.reduce(function (s, r) { return s + C.RARITY[r].weight; }, 0);
    els.ratesBody.innerHTML = C.RARITIES.slice().reverse().map(function (r) {
      const names = C.cardsOf(r).map(function (c) { return c.name.replace(' ざっそう', ''); }).join('・');
      return '<div class="rate-row"><span class="tag ' + r + '">' + r + '</span>' +
        '<span class="name">' + C.RARITY[r].label + '<br><small>' + names + '</small></span>' +
        '<span class="pct">' + Math.round(C.RARITY[r].weight / total * 1000) / 10 + '%</span></div>';
    }).join('');
    els.ratesPity.textContent = C.PITY + 'かい つづけて SR いじょう が でないときは、' + C.PITY + 'かいめは かならず SR いじょう! 10かいは R いじょうが 1まい かならず はいるよ。';
    els.rates.hidden = false;
  }

  // ---------------------------------------------------------------- 画面の切りかえ
  function show(screenId) {
    currentScreen = screenId;
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.toggle('on', s.id === screenId); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('on', t.dataset.screen === screenId); });
    if (screenId === 'albumScreen') { buildFilters(); albumDirty = true; renderAlbum(); }
    if (screenId === 'gachaScreen') renderGacha();
    if (screenId === 'kuniScreen') { renderKuni(); refreshSheet(); }
    if (screenId !== 'kuniScreen' && sel) { sel = null; els.sheet.hidden = true; kuniSig = ''; }
  }

  // ---------------------------------------------------------------- 起動
  function main() {
    buildGauge();
    els.machine.innerHTML = machineSvg();
    makeSpecks();
    buildFilters();
    renderHome();
    if (!S.kuni.tick) S = K.settle(S, now());     // 国のぜいきんは、はじめて開いたときから数える
    commit(S);                    // 画面を今の状態に合わせる

    els.zassou.addEventListener('pointerdown', onPet);
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { show(t.dataset.screen); });
    });
    els.kuniMap.addEventListener('click', onMapClick);
    els.sheet.addEventListener('click', onSheetClick);
    els.taxBtn.addEventListener('click', onTax);
    // 国のぜいきんは時間でたまる。見ている間は 1秒ごとに表示を進め、赤い点は 20秒ごとに見直す
    setInterval(function () { if (!document.hidden && currentScreen === 'kuniScreen') updateTax(); }, 1000);
    setInterval(function () { if (!document.hidden) renderHud(); }, 20000);
    els.freeBanner.addEventListener('click', function () { show('gachaScreen'); });
    els.btnFree.addEventListener('click', function () { startDraw('free'); });
    els.btnOne.addEventListener('click', function () { startDraw('one'); });
    els.btnTen.addEventListener('click', function () { startDraw('ten'); });
    els.btnRates.addEventListener('click', openRates);
    els.ratesClose.addEventListener('click', function () { els.rates.hidden = true; });
    els.revealSkip.addEventListener('click', function () { skipped = true; if (wake) wake(); });

    els.filters.addEventListener('click', function (e) {
      const b = e.target.closest('.chip');
      if (!b) return;
      filter = b.dataset.f;
      albumDirty = true;
      renderAlbum();
    });
    els.albumGrid.addEventListener('click', function (e) {
      const slot = e.target.closest('.slot');
      if (slot) openZoom(slot.dataset.id);
    });
    els.zoomClose.addEventListener('click', closeZoom);
    els.zoomBack.addEventListener('click', closeZoom);
    els.btnHome.addEventListener('click', function () {
      if (!zoomId || S.home === zoomId) return;
      commit(C.setHome(S, zoomId));
      updateZoomButtons();
      toast('ホームに かざったよ!');
    });
    els.zoomCard.addEventListener('pointermove', tilt);
    els.zoomCard.addEventListener('pointerleave', untilt);
    els.zoomCard.addEventListener('pointerup', untilt);
    els.zoomCard.addEventListener('pointercancel', untilt);

    document.addEventListener('visibilitychange', function () { if (document.hidden) saveNow(); else { renderHud(); renderGacha(); } });
    window.addEventListener('pagehide', saveNow);

    // 自動テストから中身をのぞくための入口
    window.__app = {
      version: VERSION,
      state: function () { return S; },
      setState: function (s) { commit(s, true); },
      setRng: function (f) { rngOverride = f; },
      setNow: function (ms) { nowOverride = ms; renderHud(); if (currentScreen === 'kuniScreen') renderKuni(); },
      setToday: function (d) { todayOverride = d; renderHud(); renderGacha(); },
      draw: startDraw,
      show: show,
      openZoom: openZoom,
      busy: function () { return busy; },
      saveNow: saveNow,
      cardHtml: cardHtml
    };
  }

  main();
})();
