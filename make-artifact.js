/* テストプレイ用に、全ファイルを 1 枚の HTML にまとめる: node make-artifact.js <出力先.html>
 * CSS も JS もアイコンも埋め込む (画像ファイルは使っていないので小さい)。 */
const fs = require('node:fs');
const path = require('node:path');

const out = process.argv[2];
if (!out) { console.error('使い方: node make-artifact.js <出力先.html>'); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, f)).toString('base64');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="\.\/styles\.css">/, () => '<style>\n' + read('styles.css') + '\n</style>');
html = html.replace(/<script src="\.\/([\w.-]+\.js)"><\/script>/g, (m, f) => {
  const code = read(f);
  if (/<\/script/i.test(code)) throw new Error(f + ' に </script が入っている');
  return '<script>\n' + code + '\n</script>';
});
html = html.replace('href="./icon-192.png"', 'href="' + dataUri('icon-192.png') + '"');
html = html.replace('href="./icon-180.png"', 'href="' + dataUri('icon-180.png') + '"');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
fs.writeFileSync(out, html);
console.log(out + ' を書き出した (' + Math.round(html.length / 1024) + 'KB)');
