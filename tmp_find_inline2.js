const fs = require('fs');
const path = require('path');
const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const re = /on(click|change|submit|load|error|input|keyup|keydown)\s*=\s*"/gi;
  const matches = [...content.matchAll(re)];
  if (matches.length) {
    console.log(file + ': ' + matches.length + ' occurrences');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (re.test(line)) console.log('  L' + (idx+1) + ': ' + line.trim());
    });
  }
});
