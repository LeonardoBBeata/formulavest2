const fs = require('fs');
const path = require('path');
const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const matches = [...content.matchAll(/onclick=/g)];
  if (matches.length) {
    console.log(file + ': ' + matches.length + ' occurrences');
  }
});
