/* ホーム画面のアイコンを作る: node make-icon.js
 * ざっそうくん (art.js) を、やさしい緑の地に置いた絵を PNG で書き出す。
 * iOS は apple-touch-icon に SVG を使えず、透けた所があると黒くなるので、全面を塗る。 */
const fs = require('node:fs');
const path = require('node:path');
const Art = require('./art.js');

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright が必要です: npm i -D playwright'); process.exit(1); }
  const zassou = Art.zassou({ tone: 'green', expr: 'open', acc: ['sparkle'] });
  const html = `<body style="margin:0;width:512px;height:512px;overflow:hidden;background:radial-gradient(circle at 50% 38%,#fffbe0 0,#ffeaa6 45%,#bfe29c 100%)">
    <div style="position:absolute;left:0;right:0;bottom:0;height:150px;background:#a6d481;border-radius:60% 60% 0 0/40% 40% 0 0"></div>
    <div style="position:absolute;left:56px;top:70px;width:400px;height:400px">${zassou.replace('<svg ', '<svg width="400" height="400" ')}</div></body>`;
  const browser = await chromium.launch();
  for (const size of [512, 192, 180]) {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
    await page.setContent(html);
    await page.screenshot({ path: path.join(__dirname, `icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
  console.log('icon-512/192/180.png を書き出した');
})();
