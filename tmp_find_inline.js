const fs = require('fs');
const path = require('path');
const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.html'));
files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const re = /on(click|change|submit|load|error|input|keyup|keydown)\s*=/gi;
  const matches = [...content.matchAll(re)];
  if (matches.length) {
    console.log(file + ': ' + matches.length + ' occurrences -> ' + matches.map(m => m[0]).join(', '));
  }
});
