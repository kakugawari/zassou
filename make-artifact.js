/* テストプレイ用に、全ファイルを 1 枚にまとめる: node make-artifact.js <出力先.html>
 *
 * Artifact に公開すると、外側 (<html>・<head>・上下の安全域の余白) は公開時に付く。
 * なので出力は「中身だけ」(title・書体の読み込み・style・画面・script)。
 * 外側がすでに安全域ぶん余白をとるので、アプリ側の安全域は 0 にして二重にしない
 * (重なる演出の層だけは、画面の端まで届くので env() のまま)。
 * 画像ファイルは使っていないので小さい。manifest・アイコンは Artifact では使わない。 */
const fs = require('node:fs');
const path = require('node:path');

const out = process.argv[2];
if (!out) { console.error('使い方: node make-artifact.js <出力先.html>'); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const index = read('index.html');

const title = index.match(/<title>([^<]*)<\/title>/)[1];
const fonts = index.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
let body = index.match(/<body>([\s\S]*)<\/body>/)[1];
body = body.replace(/<script src="\.\/([\w.-]+\.js)"><\/script>/g, (m, f) => {
  const code = read(f);
  if (/<\/script/i.test(code)) throw new Error(f + ' に </script が入っている');
  return '<script>\n' + code + '\n</script>';
});

const override = `
/* --- Artifact 用: 外側が安全域の余白をとるので、アプリの分は 0 にする --- */
html, body { height: 100%; }
#app { padding-top: 0; height: 100%; }
#tabbar { padding-bottom: 8px; }
`;

const html = '<title>' + title + '</title>\n' + fonts + '\n<style>\n' + read('styles.css') + override + '</style>\n' + body;
fs.writeFileSync(out, html);
console.log(out + ' を書き出した (' + Math.round(html.length / 1024) + 'KB)');
