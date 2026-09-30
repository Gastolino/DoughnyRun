// Assembles the single page published as a claude.ai artifact: the page CSS
// and the game's own code inline, and Phaser from jsdelivr, pinned by an
// integrity hash computed from the installed npm package so that the CDN
// must serve exactly the bytes the game was built against.
//
// Usage: node scripts/build-artifact.mjs [--local-phaser]
// --local-phaser points the script tag at ./phaser.min.js instead, for
// testing without network access to the CDN.
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const dir = "dist-artifact";
const pkg = JSON.parse(readFileSync("node_modules/phaser/package.json", "utf8"));
const phaserPath = "node_modules/phaser/dist/phaser.min.js";
const integrity = "sha384-" + createHash("sha384").update(readFileSync(phaserPath)).digest("base64");
const local = process.argv.includes("--local-phaser");
const src = local ? "./phaser.min.js" : `https://cdn.jsdelivr.net/npm/phaser@${pkg.version}/dist/phaser.min.js`;
if (local) copyFileSync(phaserPath, `${dir}/phaser.min.js`);

const css = readFileSync(`${dir}/doughnyrun.css`, "utf8");
// Neither "</script" nor "<!--" may appear inside an inline script, in any
// case; "\x3C" reads back as "<" in strings, templates and regular expressions.
const js = readFileSync(`${dir}/game.js`, "utf8").replace(/<(?=\/script|!--)/gi, "\\x3C");
const failed =
  "document.getElementById('game').textContent = 'Could not load the game engine. Check your connection and reload.'";

const html = `<title>Doughny Run</title>
<style>
${css}
#game:not(:has(canvas)) { font: 16px/1.5 system-ui, sans-serif; text-align: center; }
</style>
<div id="game"></div>
<script src="${src}" integrity="${integrity}" crossorigin="anonymous" onerror="${failed}"></script>
<script>
${js}
</script>
`;
const out = `${dir}/${local ? "doughny-run.local.html" : "doughny-run.html"}`;
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(1)} kB, Phaser ${pkg.version} from ${src}`);
