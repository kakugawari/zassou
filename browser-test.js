/*
 * ブラウザで実際に動かして確かめるテスト。
 *
 *   npm i -D playwright && npm run test:ui
 *
 * 本物のブラウザを立ち上げ、指の操作をそのまま再現する。
 * 対象は iPhone 16 Plus (430 x 932pt) だけ。
 * 手もとのブラウザは安全域 (上59・下34) が 0 なので、測るときは差し込む。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.PORT || 8123);
const URL = `http://localhost:${PORT}/`;
const ROOT = __dirname;
const CHROMIUM = process.env.CHROMIUM_PATH;

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + message); }
  else { failed++; console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message); }
}
function section(name) { console.log('\n' + name); }

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(URL, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 10000) reject(new Error('サーバーが起動しない'));
          else setTimeout(tick, 100);
        });
    };
    tick();
  });
}

const VIEW = { width: 430, height: 932 };
// 実機の安全域。手もとのブラウザでは 0 なので、変数を差し込んでまねる。
const SAFE = ':root { --safe-top: 59px !important; --safe-bottom: 34px !important; }';

async function openPage(browser, { safe = true, state = null, init = null } = {}) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // この作業環境では外部の書体が読めない (実機では読める)。書体の失敗は数えない。
    if (m.type() === 'error' && !/fonts\.|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  if (state) await page.addInitScript((s) => { localStorage.setItem('zassou.save.v1', s); }, JSON.stringify(state));
  if (init) await page.addInitScript(init);
  await page.goto(URL);
  await page.waitForFunction(() => window.__app);
  if (safe) await page.addStyleTag({ content: SAFE });
  await page.waitForTimeout(150);
  return { page, context, errors };
}

/** 状態を一部だけ書き換える。 */
function patch(page, fn, arg) {
  return page.evaluate(({ code, arg }) => {
    const s = JSON.parse(JSON.stringify(window.__app.state()));
    // eslint-disable-next-line no-new-func
    new Function('s', 'arg', code)(s, arg);
    window.__app.setState(s);
  }, { code: fn, arg });
}

/** 指定の乱数列を使う (0〜1 の値を順に返し、尽きたら繰り返す)。 */
function fixRng(page, values) {
  return page.evaluate((v) => {
    let i = 0;
    window.__app.setRng(() => v[i++ % v.length]);
  }, values);
}

function startDraw(page, mode) {
  return page.evaluate((m) => { setTimeout(() => window.__app.draw(m), 0); }, mode);
}

/** 演出を最後まで進める (カプセルをタップ → つぎへ → とじる)。 */
async function finishReveal(page, { limit = 30000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const st = await page.evaluate(() => ({
      open: !document.getElementById('reveal').hidden,
      hint: !document.getElementById('revealHint').hidden,
      next: !document.getElementById('revealActions').hidden,
      sum: !document.getElementById('revealSummary').hidden
    }));
    if (!st.open) return true;
    if (st.sum) await page.locator('#revealClose').tap();
    else if (st.next) await page.locator('#revealNext').tap();
    else if (st.hint) await page.locator('#revealStage').tap({ position: { x: 215, y: 466 } });
    await page.waitForTimeout(120);
  }
  return false;
}

function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

async function run() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    console.error('playwright が必要です:  npm i -D playwright');
    process.exit(1);
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await waitForServer();
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ================================================== 起動と画面の収まり
    section('起動と画面の収まり (実機の安全域 上59・下34 を差し込んで)');
    {
      const { page, context, errors: errs } = await openPage(browser);
      ok(true, 'ページが開いて、画面のしくみが立ち上がる');
      const fit = await page.evaluate(() => ({
        wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        high: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        h: innerHeight, w: innerWidth
      }));
      ok(fit.w === 430 && fit.h === 932, `画面は 430 x 932 (${fit.w} x ${fit.h})`);
      ok(fit.wide <= 0 && fit.high <= 0, `はみ出して動く所がない (横 ${fit.wide} / 縦 ${fit.high})`);

      // どのボタンも、画面の中に見えていて、上に別のものが重なっていない
      const screens = [['homeScreen', '#zassou', '#petBox', '#freeBanner'], ['gachaScreen', '#btnOne', '#btnTen', '#btnRates'], ['albumScreen', '.chip', '.slot']];
      for (const [id, ...sels] of screens) {
        await page.evaluate((s) => window.__app.show(s), id);
        await page.waitForTimeout(80);
        for (const sel of sels) {
          const info = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el || el.offsetParent === null) return { hidden: true };
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 40);
            const top = document.elementFromPoint(x, y);
            const bar = document.getElementById('tabbar').getBoundingClientRect();
            return { hidden: false, inside: r.left >= 0 && r.right <= 430 && r.top >= 0 && r.bottom <= bar.top + 1, hit: !!top && (top === el || el.contains(top) || top.contains(el)), r: [r.left, r.top, r.right, r.bottom].map(Math.round) };
          }, sel);
          if (info.hidden) continue;
          ok(info.inside, `${id} の ${sel} が画面の中に収まる (${info.r})`);
          ok(info.hit, `${id} の ${sel} の真ん中を押すと、そのボタンに当たる`);
        }
      }
      // ガチャの画面は、いちばん下のボタンまでタブの上に収まる
      await page.evaluate(() => window.__app.show('gachaScreen'));
      const g = await rectOf(page, '#btnRates');
      const bar = await rectOf(page, '#tabbar');
      ok(g.bottom <= bar.top, `ガチャ画面の最下段が タブの上に収まる (${Math.round(g.bottom)} <= ${Math.round(bar.top)})`);
      const top = await rectOf(page, '#topbar');
      ok(Math.abs(top.top - 59) < 1, `上の帯は安全域のぶん下がっている (top ${Math.round(top.top)})`);
      const tab = await rectOf(page, '#tabbar');
      ok(Math.abs(tab.bottom - 932) < 1, `下のタブは画面の底までとどく (bottom ${Math.round(tab.bottom)})`);

      // 版と窓の高さが読める (実機の写真 1 枚で確かめるため)
      await page.evaluate(() => window.__app.show('albumScreen'));
      const ver = await page.evaluate(() => document.querySelector('.ver') && document.querySelector('.ver').textContent);
      ok(/v\d/.test(ver || ''), `アルバムの下に版の番号が出る (${ver})`);
      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== ホーム: なでる
    section('ホーム: なでるとコインがたまる');
    {
      const { page, context, errors: errs } = await openPage(browser);
      const before = await page.evaluate(() => window.__app.state().coins);
      for (let i = 0; i < 7; i++) { await page.locator('#zassou').tap(); await page.waitForTimeout(40); }
      const mid = await page.evaluate(() => ({ coins: window.__app.state().coins, on: document.querySelectorAll('#gauge i.on').length, charge: window.__app.state().tapCharge }));
      ok(mid.coins === before && mid.charge === 7, `7回では まだコインは増えない (${mid.coins}, ゲージ ${mid.charge})`);
      ok(mid.on === 7, `ゲージが 7つ ともっている (${mid.on})`);
      await page.locator('#zassou').tap();
      await page.waitForTimeout(150);
      const dur = await page.evaluate(() => document.getElementById('coinCount').textContent);
      ok(dur === String(before), `コインが飛んでいる間は 数字を増やさない (${dur})`);
      await page.waitForTimeout(2100);
      const after = await page.evaluate(() => ({ coins: window.__app.state().coins, shown: document.getElementById('coinCount').textContent, on: document.querySelectorAll('#gauge i.on').length, fly: document.querySelectorAll('.fly-coin').length, burst: document.querySelectorAll('.burst').length, floats: document.querySelectorAll('.float').length }));
      ok(after.coins === before + 20 && after.shown === String(after.coins), `8回目に +20 コイン (${before} → ${after.coins}、表示 ${after.shown})`);
      ok(after.on === 0, 'ゲージは空に戻る');
      ok(after.fly === 0 && after.burst === 0 && after.floats === 0, `飛ばした飾りが残らない (コイン${after.fly}・点${after.burst}・字${after.floats})`);

      // 速く連打しても数え落とさない
      const c0 = await page.evaluate(() => window.__app.state().coins);
      for (let i = 0; i < 16; i++) await page.locator('#zassou').tap({ delay: 0 });
      await page.waitForTimeout(2200);
      const c1 = await page.evaluate(() => window.__app.state().coins);
      ok(c1 === c0 + 40, `16回 つづけてなでると +40 (${c0} → ${c1})`);
      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== ガチャ: 1かい
    section('ガチャ: 1かいまわす');
    {
      const { page, context, errors: errs } = await openPage(browser);
      await page.locator('#tabGacha').tap();
      ok(await page.evaluate(() => !document.getElementById('btnFree').hidden), 'はじめは「きょうの むりょう」が出ている');
      ok(await page.evaluate(() => !document.getElementById('gachaDot').hidden), 'ガチャのタブに赤い点がついている');

      // N のカード (乱数 0.01 → N → 先頭のカード)
      await fixRng(page, [0.01, 0.01]);
      await page.locator('#btnOne').tap();
      await page.waitForSelector('#revealHint:not([hidden])', { timeout: 5000 });
      const coinsNow = await page.evaluate(() => window.__app.state().coins);
      ok(coinsNow === 60, `1かいで 30コイン つかう (90 → ${coinsNow})`);

      // 演出中にもう一度押しても、二重には回らない
      await page.evaluate(() => window.__app.draw('one'));
      ok(await page.evaluate(() => window.__app.state().coins) === 60, '演出のあいだに押しても 二重に回らない');
      ok(await page.evaluate(() => window.__app.state().pulls) === 1, '回した数は 1');

      const cover = await rectOf(page, '#reveal');
      ok(cover.width === 430 && cover.height === 932, `演出は画面いっぱい (${cover.width} x ${cover.height})`);

      await page.locator('#revealStage').tap({ position: { x: 215, y: 466 } });
      await page.waitForSelector('#revealActions:not([hidden])', { timeout: 5000 });
      const shown = await page.evaluate(() => ({
        name: document.querySelector('#revealStage .c-name').textContent,
        badge: (document.querySelector('#revealStage .rbadge') || {}).textContent
      }));
      ok(shown.name === 'ざっそう', `出たカードの名前が出る (${shown.name})`);
      ok(/NEW/.test(shown.badge || ''), `はじめて出たら NEW (${shown.badge})`);
      const cardBox = await rectOf(page, '#revealStage .card');
      ok(cardBox.left >= 0 && cardBox.right <= 430 && cardBox.top >= 59 && cardBox.bottom <= 932 - 34, `カードが画面に収まる (${Math.round(cardBox.left)}-${Math.round(cardBox.right)} x ${Math.round(cardBox.top)}-${Math.round(cardBox.bottom)})`);
      const btnBox = await rectOf(page, '#revealNext');
      ok(btnBox.top >= cardBox.bottom, 'ボタンはカードに重ならない');
      ok(await finishReveal(page), '「とじる」で演出が終わる');
      await page.waitForTimeout(1500);
      ok(await page.evaluate(() => document.querySelectorAll('.burst').length) === 0, '飛ばした点が残らない');

      // アルバムに入った
      const owned = await page.evaluate(() => window.__app.state().owned);
      ok(owned.futsu === 1 && Object.keys(owned).length === 1, `アルバムに 1まい入った (${JSON.stringify(owned)})`);
      ok(await page.evaluate(() => document.getElementById('ownedCount').textContent) === '1', '上の「あつめた数」が 1');

      // 同じカードがかぶると ★ が増える
      await patch(page, 's.coins = 500');
      await startDraw(page, 'one');
      await page.waitForSelector('#revealHint:not([hidden])', { timeout: 5000 });
      await page.locator('#revealStage').tap({ position: { x: 215, y: 466 } });
      await page.waitForSelector('#revealActions:not([hidden])', { timeout: 5000 });
      const dup = await page.evaluate(() => (document.querySelector('#revealStage .rbadge') || {}).textContent);
      ok(/ぴかぴか.*2/.test(dup || ''), `かぶると「ぴかぴか アップ ★2」(${dup})`);
      await finishReveal(page);

      // コインが足りないとき
      await patch(page, 's.coins = 10');
      await page.locator('#btnOne').tap({ force: true });   // 「押せない」見た目でも、指では押せる
      await page.waitForTimeout(200);
      ok(await page.evaluate(() => !document.getElementById('toast').hidden && /たりない/.test(document.getElementById('toast').textContent)), 'コインが足りないと、理由を教えてくれる');
      ok(await page.evaluate(() => document.getElementById('reveal').hidden), '足りないときは演出が始まらない');
      ok(await page.evaluate(() => window.__app.state().coins) === 10, '足りないときはコインが減らない');
      ok(await page.evaluate(() => document.getElementById('btnOne').getAttribute('aria-disabled')) === 'true', 'ボタンが「押せない」見た目になる');

      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== ガチャ: きょうのむりょう / 10かい
    section('ガチャ: 無料と 10かい');
    {
      const { page, context, errors: errs } = await openPage(browser);
      await page.evaluate(() => window.__app.setToday('2026-10-03'));
      await page.locator('#tabGacha').tap();
      await fixRng(page, [0.2, 0.3, 0.6, 0.5, 0.1, 0.9, 0.7]);
      const c0 = await page.evaluate(() => window.__app.state().coins);
      await page.locator('#btnFree').tap();
      await page.waitForSelector('#revealHint:not([hidden])', { timeout: 5000 });
      ok(await finishReveal(page), '無料ガチャが最後まで進む');
      const after = await page.evaluate(() => ({ coins: window.__app.state().coins, free: document.getElementById('btnFree').hidden, dot: document.getElementById('gachaDot').hidden, banner: document.getElementById('freeBanner').hidden, pulls: window.__app.state().pulls }));
      ok(after.coins === c0, `無料はコインが減らない (${c0} → ${after.coins})`);
      ok(after.pulls === 1, '1かい ぶん まわった');
      ok(after.free && after.dot, '使ったあと、無料ボタンと赤い点が消える');
      await page.evaluate(() => window.__app.show('homeScreen'));
      ok(after.banner, 'ホームの「むりょうガチャ」の案内も消える');
      await page.evaluate(() => window.__app.setToday('2026-10-04'));
      ok(await page.evaluate(() => !document.getElementById('btnFree').hidden), '次の日になると、また使える');

      // 10かい (R 以上が最後に入る: 乱数をぜんぶ 0 に近い=N にして試す)
      await patch(page, 's.coins = 1000; s.claimed = [6, 12, 18, 24]');   // ごほうびのコインが混ざらないように
      await fixRng(page, [0.01, 0.0, 0.01, 0.1, 0.01, 0.2, 0.01, 0.3, 0.01, 0.4, 0.01, 0.5, 0.01, 0.6, 0.01, 0.7, 0.01, 0.8, 0.01, 0.9, 0.5, 0.5]);
      await page.evaluate(() => window.__app.show('gachaScreen'));
      await page.locator('#btnTen').tap();
      await page.waitForSelector('#revealHint:not([hidden])', { timeout: 5000 });
      ok(await page.evaluate(() => window.__app.state().coins) === 730, '10かいで 270コイン つかう');
      ok(await page.evaluate(() => !document.getElementById('revealSkip').hidden), '「ぜんぶ みる」が出ている');
      await page.locator('#revealSkip').tap();
      await page.waitForSelector('#revealSummary:not([hidden])', { timeout: 5000 });
      const sum = await page.evaluate(() => ({ n: document.querySelectorAll('#summaryGrid .slot').length, pulls: window.__app.state().pulls }));
      ok(sum.n === 10, `まとめに 10まい 並ぶ (${sum.n})`);
      ok(sum.pulls === 11, `とばしても 10かいぶん 手に入っている (${sum.pulls})`);
      const grid = await rectOf(page, '#summaryGrid');
      const closeBtn = await rectOf(page, '#revealClose');
      ok(grid.right <= 430 && grid.bottom <= closeBtn.top, 'まとめがボタンに重ならず、画面に収まる');
      await page.locator('#revealClose').tap();
      await page.waitForTimeout(300);
      ok(await page.evaluate(() => document.getElementById('reveal').hidden), 'まとめを閉じると演出が終わる');
      ok(await page.evaluate(() => document.getElementById('revealStage').children.length) === 0, '舞台に何も残らない');
      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== レア演出
    section('ガチャ: SR / UR の演出');
    {
      const { page, context, errors: errs } = await openPage(browser);
      await patch(page, 's.coins = 1000');
      await page.locator('#tabGacha').tap();
      for (const [label, value, rar] of [['SR', 0.9, 'SR'], ['UR', 0.995, 'UR']]) {
        await fixRng(page, [value, 0.5]);
        await startDraw(page, 'one');
        await page.waitForSelector('#revealHint:not([hidden])', { timeout: 5000 });
        const capColor = await page.evaluate(() => getComputedStyle(document.querySelector('.capsule .cap-top'), '::before').backgroundImage);
        ok(/gradient/.test(capColor), `${label}: カプセルの色が出ている`);
        await page.locator('#revealStage').tap({ position: { x: 215, y: 466 } });
        await page.waitForSelector('#revealActions:not([hidden])', { timeout: 6000 });
        const info = await page.evaluate(() => ({ cls: document.querySelector('#revealStage .card').className, badge: document.querySelector('#revealStage .rbadge').textContent, holo: getComputedStyle(document.querySelector('#revealStage .holo')).display }));
        ok(info.cls.includes('r-' + rar), `${label}: ${rar} の枠のカード`);
        ok(info.holo === 'block', `${label}: きらきらの層が出る`);
        ok(/すごい|でんせつ/.test(info.badge), `${label}: 「${info.badge}」`);
        await finishReveal(page);
        await page.waitForTimeout(1600);
        ok(await page.evaluate(() => document.querySelectorAll('.burst').length) === 0, `${label}: 点が残らない`);
      }
      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== アルバム
    section('アルバム');
    {
      const { page, context, errors: errs } = await openPage(browser);
      await patch(page, `s.owned = { futsu: 1, ame: 3, mahou: 2 }; s.seen = { futsu: true }; s.home = 'futsu'`);
      await page.locator('#tabAlbum').tap();
      await page.waitForTimeout(150);
      const a = await page.evaluate(() => ({
        slots: document.querySelectorAll('#albumGrid .slot').length,
        have: document.getElementById('albumHave').textContent,
        all: document.getElementById('albumAll').textContent,
        locked: document.querySelectorAll('#albumGrid .card.locked').length,
        news: document.querySelectorAll('#albumGrid .newtag').length,
        text: document.getElementById('albumGrid').textContent,
        bar: document.getElementById('albumBar').style.width
      }));
      ok(a.slots === 24 && a.locked === 21, `24 枠のうち 3まい 発見 (枠${a.slots} / かげ${a.locked})`);
      ok(a.have === '3' && a.all === '24', `「3 / 24 まい」(${a.have} / ${a.all})`);
      ok(a.bar === '13%', `進み具合の棒 (${a.bar})`);
      ok(a.news === 2, `見ていないカードに NEW (${a.news})`);
      ok(!/まほうつかい|おうごん|にじいろ|せかいじゅ/.test(a.text.replace('まほうつかい ざっそう', '')) , '未発見のカードの名前が、画面に漏れていない');
      ok(await page.evaluate(() => [...document.querySelectorAll('#albumGrid .card.locked .c-name')].every((e) => e.textContent === '？？？')), '未発見は「？？？」');
      ok(a.text.includes('No.024'), 'No.024 まで番号が出ている');

      // 絞りこみ
      await page.locator('.chip[data-f="futsu"]').tap();
      ok(await page.evaluate(() => document.querySelectorAll('#albumGrid .slot').length) === 6, '「いつもの」は 6まい');
      await page.locator('.chip[data-f="kira"]').tap();
      ok(await page.evaluate(() => document.querySelectorAll('#albumGrid .slot').length) === 8, '「キラキラ」は 8まい');
      await page.locator('.chip[data-f="all"]').tap();

      // 未発見をタップ → 拡大しない
      await page.locator('.slot[data-id="ogon"]').scrollIntoViewIfNeeded();
      await page.locator('.slot[data-id="ogon"]').tap();
      ok(await page.evaluate(() => document.getElementById('zoom').hidden), '未発見をタップしても拡大しない');
      ok(await page.evaluate(() => !document.getElementById('toast').hidden), 'かわりに ひとこと出る');

      // 発見ずみをタップ → 拡大
      await page.locator('.slot[data-id="ame"]').scrollIntoViewIfNeeded();
      await page.locator('.slot[data-id="ame"]').tap();
      await page.waitForTimeout(350);
      const z = await page.evaluate(() => ({
        shown: !document.getElementById('zoom').hidden,
        name: document.querySelector('#zoomCard .c-name').textContent,
        stars: document.querySelectorAll('#zoomCard .c-stars span.off').length,
        seen: window.__app.state().seen.ame
      }));
      ok(z.shown && z.name === 'あめふり ざっそう', `拡大して名前が読める (${z.name})`);
      ok(z.stars === 2, `★3 のカードは ★ が 3つ光る (消えている★ ${z.stars})`);
      ok(z.seen === true, '見たら NEW のしるしが消える');
      const zc = await rectOf(page, '#zoomCard .card');
      const zb = await rectOf(page, '#zoomButtons');
      ok(zc.bottom <= zb.top && zb.bottom <= 932 - 34 + 1 && zc.top >= 59, `拡大カードとボタンが画面に収まる (カード ${Math.round(zc.top)}-${Math.round(zc.bottom)} ボタン ${Math.round(zb.top)}-${Math.round(zb.bottom)})`);

      // かたむけると きらめきが動く
      await page.locator('.slot[data-id="mahou"]').scrollIntoViewIfNeeded().catch(() => {});
      await page.locator('#zoomClose').tap();
      await page.locator('.slot[data-id="mahou"]').scrollIntoViewIfNeeded();
      await page.locator('.slot[data-id="mahou"]').tap();
      await page.waitForTimeout(350);
      const box = await rectOf(page, '#zoomCard');
      await page.mouse.move(box.left + 20, box.top + box.height / 2);
      await page.mouse.move(box.left + 40, box.top + box.height / 2);
      const m1 = await page.evaluate(() => document.querySelector('#zoomCard .card').style.getPropertyValue('--mx'));
      await page.mouse.move(box.right - 20, box.top + box.height / 2);
      const m2 = await page.evaluate(() => document.querySelector('#zoomCard .card').style.getPropertyValue('--mx'));
      ok(m1 && m2 && m1 !== m2, `カードをなぞると きらめきが動く (${m1} → ${m2})`);

      // ホームにかざる
      await page.locator('#btnHome').tap();
      await page.waitForTimeout(100);
      const home = await page.evaluate(() => ({ home: window.__app.state().home, svg: document.getElementById('zassouArt').innerHTML.length }));
      ok(home.home === 'mahou', `ホームにかざれた (${home.home})`);
      ok(await page.evaluate(() => document.querySelector('#btnHome .gbtn-main').textContent) === 'かざってるよ', 'かざったあとはボタンの文字が変わる');
      await page.locator('#zoomClose').tap();
      await page.locator('#tabHome').tap();
      ok(await page.evaluate(() => document.getElementById('zassouArt').innerHTML.includes('#9b6fd0')), 'ホームのざっそうくんが まほうつかいの帽子をかぶっている');
      ok(await page.evaluate(() => document.getElementById('homeBg').innerHTML.includes('#262a68')), 'ホームの背景も そのカードの夜空になる');

      // 持っていないカードは かざれない
      const keep = await page.evaluate(() => { const s = window.__app.state(); return s.home; });
      await patch(page, `s.home = 'ogon'`);
      ok(keep === 'mahou', 'ホームの表示は 持っているカードだけ');
      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== 絵と文字
    section('カードの絵と文字 (24まい ぜんぶ)');
    {
      const all = {};
      const { page, context, errors: errs } = await openPage(browser, { state: (() => { const o = {}; ['futsu','nikkori','nemu','hinata','bonyari','mebae','ame','yuki','hanami','ofuro','umi','ribbon','ninja','kaizoku','gokigen','gochiso','mahou','osama','hoshizora','kirakira','tenshi','ogon','niji','sekaiju'].forEach((id) => { o[id] = 5; }); return { v: 1, coins: 500, owned: o, seen: {}, pulls: 0, sinceSR: 0, lastFree: '', tapCharge: 0, home: 'futsu', claimed: [6, 12, 18, 24] }; })() });
      await page.locator('#tabAlbum').tap();
      await page.waitForTimeout(200);
      // 拡大サイズで 24まい 順に調べる
      const res = await page.evaluate(async () => {
        const out = [];
        for (const c of Core.CARDS) {
          window.__app.openZoom(c.id);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const card = document.querySelector('#zoomCard .card');
          const name = card.querySelector('.c-name');
          const text = card.querySelector('.c-text');
          const art = card.querySelector('.c-art svg');
          const g = art.querySelector('.z-wrap');
          const bb = g.getBBox();
          out.push({
            id: c.id,
            nameFit: name.scrollWidth <= name.clientWidth + 1,
            textFit: text.scrollHeight <= text.clientHeight + 1,
            inner: card.querySelector('.card-in').scrollHeight <= card.querySelector('.card-in').clientHeight + 1,
            bb: [bb.x + 20, bb.y + 14, bb.x + bb.width + 20, bb.y + bb.height + 14].map((n) => Math.round(n * 10) / 10)
          });
          document.getElementById('zoomClose').click();
        }
        return out;
      });
      const bad = (k) => res.filter((r) => !r[k]).map((r) => r.id);
      ok(bad('nameFit').length === 0, `名前が 1行に収まる (${bad('nameFit').join(',') || '24まいとも'})`);
      ok(bad('textFit').length === 0, `ひとことが 枠に収まる (${bad('textFit').join(',') || '24まいとも'})`);
      ok(bad('inner').length === 0, `カードの中身が 枠からはみ出さない (${bad('inner').join(',') || '24まいとも'})`);
      const outside = res.filter((r) => r.bb[0] < 1 || r.bb[1] < 1 || r.bb[2] > 239 || r.bb[3] > 209).map((r) => r.id + JSON.stringify(r.bb));
      ok(outside.length === 0, `ざっそうくんと服が 絵の窓から はみ出さない (${outside.join(' ') || '24まいとも'})`);

      // id が重ならない (重なると、見えていない側の色が使われてしまう)
      const dup = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        return ids.filter((x, i) => ids.indexOf(x) !== i);
      });
      ok(dup.length === 0, `画面の中で id が重ならない (${dup.slice(0, 5).join(',') || '重なり 0'})`);

      // ガチャ機の上のマスコットが画面に見えている
      await page.locator('#tabGacha').tap();
      const mc = await page.evaluate(() => {
        const svg = document.querySelector('#machine > svg');
        const vb = svg.viewBox.baseVal;
        const bb = document.getElementById('mMascot').getBBox();
        return { top: bb.y - vb.y, left: bb.x - vb.x, right: vb.x + vb.width - (bb.x + bb.width) };
      });
      ok(mc.top >= 0 && mc.left >= 0 && mc.right >= 0, `ガチャ機のマスコットが 枠の中に収まる (上の余白 ${Math.round(mc.top)})`);
      // 入れ子の SVG に 「幅100%」が かかって巨大になる不具合の見張り (実際に描かれた大きさで測る)
      const mw = await rectOf(page, '#mMascot svg');
      ok(mw.width <= 110 && mw.width >= 60, `機械の上のマスコットは 小さいまま (幅 ${Math.round(mw.width)}px)`);
      const mr = await rectOf(page, '#machine > svg');
      ok(mr.top >= 59 + 56, `ガチャ機が 上の帯に隠れない (top ${Math.round(mr.top)})`);
      all.n = res.length;
      ok(errs.length === 0, 'JS エラーなし' + (errs.length ? ': ' + errs.join(' / ') : ''));
      await context.close();
    }

    // ================================================== ていしゅつわりあい
    section('ていしゅつわりあい');
    {
      const { page, context } = await openPage(browser);
      await page.locator('#tabGacha').tap();
      await page.locator('#btnRates').tap();
      const r = await page.evaluate(() => ({
        pcts: [...document.querySelectorAll('#ratesBody .pct')].map((e) => parseFloat(e.textContent)),
        shown: !document.getElementById('rates').hidden,
        note: document.querySelector('#rates .fine').textContent
      }));
      ok(r.shown && r.pcts.length === 4, '4つのレア度が出る');
      ok(Math.abs(r.pcts.reduce((a, b) => a + b, 0) - 100) < 0.2, `わりあいの合計が 100% (${r.pcts.join(' + ')})`);
      ok(/おかね/.test(r.note), 'おかねは つかわないと書いてある');
      const sh = await rectOf(page, '#rates .sheet');
      ok(sh.top >= 0 && sh.bottom <= 932, 'わりあいの札が画面に収まる');
      await page.locator('#ratesClose').tap();
      ok(await page.evaluate(() => document.getElementById('rates').hidden), '閉じられる');
      await context.close();
    }

    // ================================================== 保存
    section('保存と読みこみ');
    {
      const { page, context } = await openPage(browser);
      await patch(page, `s.coins = 321; s.owned = { ame: 2, ogon: 1 }; s.home = 'ogon'; s.lastFree = '2026-10-03'`);
      await page.evaluate(() => window.__app.saveNow());
      await page.reload();
      await page.waitForFunction(() => window.__app);
      const s = await page.evaluate(() => window.__app.state());
      ok(s.coins === 321 && s.owned.ame === 2 && s.owned.ogon === 1 && s.home === 'ogon', `閉じて開き直しても残っている (コイン ${s.coins})`);
      ok(await page.evaluate(() => document.getElementById('coinCount').textContent) === '321', '開いた直後の表示も 321');

      // なでるだけでも、少し待てば保存される (操作のたびには書かない)
      await page.evaluate(() => { window.__writes = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { window.__writes++; return o.apply(this, arguments); }; });
      await page.evaluate(() => {
        const z = document.getElementById('zassou');
        for (let i = 0; i < 6; i++) z.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 215, clientY: 500 }));
      });
      const w1 = await page.evaluate(() => window.__writes);
      await page.waitForTimeout(700);
      const w2 = await page.evaluate(() => window.__writes);
      ok(w1 === 0 && w2 === 1, `6回すばやくなでても 書き込みは まとめて 1回 (${w1} → ${w2})`);
      await context.close();

      // 壊れた保存でも開ける
      const bad = await openPage(browser, { init: () => localStorage.setItem('zassou.save.v1', '{こわれた') });
      const s2 = await bad.page.evaluate(() => window.__app.state());
      ok(s2.coins === 90 && Object.keys(s2.owned).length === 0, '壊れた保存は はじめからに戻って開く');
      ok(bad.errors.length === 0, '壊れた保存でも JS エラーなし');
      await bad.context.close();
    }

    // ================================================== 重さ
    section('遅い端末 (CPU 4倍遅い) での動き');
    {
      const { page, context } = await openPage(browser);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.bringToFront();
      await page.waitForTimeout(400);
      const measure = (ms) => page.evaluate((ms) => new Promise((resolve) => {
        let n = 0; const t0 = performance.now();
        const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else resolve(Math.round(n / ((performance.now() - t0) / 1000))); };
        requestAnimationFrame(f);
      }), ms);
      const idle = await measure(1500);
      console.log(`  [測定] ホーム (そよぎ+粒): ${idle} fps`);
      ok(idle >= 40, `ホームで じっとしているとき 40fps 以上 (${idle})`);

      // なでている最中
      const taps = (async () => { for (let i = 0; i < 12; i++) { await page.locator('#zassou').tap(); await page.waitForTimeout(80); } })();
      const during = await measure(1500);
      await taps;
      console.log(`  [測定] なでている最中: ${during} fps`);
      ok(during >= 30, `なでている最中 30fps 以上 (${during})`);
      await page.waitForTimeout(2000);

      // ガチャ演出中 (SR のはなやかな場面)
      await patch(page, 's.coins = 1000');
      await page.locator('#tabGacha').tap();
      await fixRng(page, [0.995, 0.5]);
      await startDraw(page, 'one');
      await page.waitForSelector('#revealHint:not([hidden])', { timeout: 8000 });
      await page.locator('#revealStage').tap({ position: { x: 215, y: 466 } });
      const reveal = await measure(1500);
      console.log(`  [測定] UR を開いた直後: ${reveal} fps`);
      ok(reveal >= 20, `UR を開いた直後 20fps 以上 (${reveal})`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await finishReveal(page);

      // アルバムのスクロール
      await patch(page, `s.owned = Object.fromEntries(Core.CARDS.map((c) => [c.id, 1]))`.replace('Core.CARDS', 'window.Core.CARDS'));
      await page.locator('#tabAlbum').tap();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.waitForTimeout(500);
      const scrollFps = page.evaluate(() => new Promise((resolve) => {
        const g = document.getElementById('albumGrid'); let n = 0; const t0 = performance.now();
        const f = () => { n++; g.scrollTop += 14; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else resolve(Math.round(n / ((performance.now() - t0) / 1000))); };
        requestAnimationFrame(f);
      }));
      const sf = await scrollFps;
      console.log(`  [測定] アルバムをスクロール: ${sf} fps`);
      ok(sf >= 30, `アルバム (24まい) をスクロールして 30fps 以上 (${sf})`);
      await context.close();
    }

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
