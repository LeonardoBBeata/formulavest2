const fs = require('fs');
const path = require('path');
const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
files.forEach(file => {
  const html = fs.readFileSync(path.join(dir, file), 'utf8');
  const matches = [...html.matchAll(/onclick="[^"]*"/g)];
  if (matches.length) {
    console.log(file + ':');
    matches.forEach(m => console.log('  ' + m[0]));
  }
});
