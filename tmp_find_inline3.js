const fs = require('fs');
const path = require('path');
const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/onclick/i.test(line)) {
      console.log(file + ' L' + (idx + 1) + ': ' + line.trim());
    }
  });
});
