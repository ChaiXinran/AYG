const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'dist');
const site = process.argv[2];
const supportedSites = new Set(['home', 'ayg']);

if (!supportedSites.has(site)) {
  console.error('Usage: node scripts/build-site.js <home|ayg>');
  process.exit(1);
}

function copy(source, destination) {
  const sourcePath = path.join(repoRoot, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing build input: ${source}`);
  fs.cpSync(sourcePath, path.join(outputDir, destination), { recursive: true });
}

function normalizeSiteHtml() {
  for (const filename of fs.readdirSync(outputDir)) {
    if (!filename.endsWith('.html')) continue;
    const filePath = path.join(outputDir, filename);
    const html = fs.readFileSync(filePath, 'utf8')
      .replace(/<base href="\.\.\/\.\.\/">/g, '');
    fs.writeFileSync(filePath, html);
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

copy(`sites/${site}`, '.');
if (fs.existsSync(path.join(repoRoot, `sites/${site}/profile`))) copy(`sites/${site}/profile`, 'profile');
if (fs.existsSync(path.join(repoRoot, `sites/${site}/submission`))) copy(`sites/${site}/submission`, 'submission');
copy('background', 'background');

if (site !== 'home') {
  copy('core', 'core');
  copy('assets', 'assets');
  normalizeSiteHtml();
}

console.log(`Built ${site} -> ${path.relative(repoRoot, outputDir)}`);
