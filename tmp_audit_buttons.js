const fs = require('fs');
const path = require('path');

const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const html = fs.readFileSync(path.join(dir, file), 'utf8');
  const jsFileGuess = file.replace('.html', '.js');
  const scriptMatch = html.match(/<script src="\/?([\w.-]+\.js)"/g) || [];
  const jsFiles = scriptMatch.map(m => m.match(/\/?([\w.-]+\.js)/)[1]);

  const idMatches = [...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]);
  const btnIds = idMatches.filter(id => /btn$/i.test(id));

  let jsContent = '';
  jsFiles.forEach(jsFile => {
    const jsPath = path.join(dir, jsFile);
    if (fs.existsSync(jsPath)) {
      jsContent += fs.readFileSync(jsPath, 'utf8');
    }
  });

  const missing = btnIds.filter(id => !jsContent.includes(id));
  if (missing.length) {
    console.log(`${file} (scripts: ${jsFiles.join(', ') || 'none'}):`);
    missing.forEach(id => console.log(`  - missing handler reference: ${id}`));
  }
});
