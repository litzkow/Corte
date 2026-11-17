// Marca a versão em todos os arquivos do site publicado (só na cópia _site, o código fica limpo).
// Sem isso o navegador do celular pode misturar arquivo novo com arquivo velho do cache por alguns minutos
// depois de uma atualização, e o app quebra de jeitos estranhos.
// Uso: node tools/stamp.mjs _site <versão>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, ver] = process.argv.slice(2);
if (!dir || !ver) { console.error('uso: node tools/stamp.mjs _site <versão>'); process.exit(1); }
const q = '?v=' + encodeURIComponent(ver);
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let n = 0;
for (const f of walk(join(dir, 'js')).filter(f => f.endsWith('.js'))) {
  const s = readFileSync(f, 'utf8');
  const out = s
    .replace(/(from\s*|import\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, (m, a, qt, p) => { n++; return a + qt + p + q + qt; })
    .replace(/new URL\((['"])(\.{1,2}\/[^'"?]+\.js)\1/g, (m, qt, p) => { n++; return 'new URL(' + qt + p + q + qt; });
  if (out !== s) writeFileSync(f, out);
}
const ih = join(dir, 'index.html');
writeFileSync(ih, readFileSync(ih, 'utf8').replace(/href="css\/app\.css"/, `href="css/app.css${q}"`).replace(/src="js\/app\.js(\?v=[^"]*)?"/, `src="js/app.js${q}"`));
console.log(`versão ${ver} marcada em ${n} imports`);
