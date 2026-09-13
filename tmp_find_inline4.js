const fs = require('fs');
const path = require('path');

function walk(dir, cb) {
  fs.readdirSync(dir).forEach(item => {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item === 'node_modules' || item === '.git') return;
      walk(full, cb);
    } else {
      cb(full);
    }
  });
}

walk('.', (file) => {
  if (!/\.(html|js)$/i.test(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/on(click|change|submit|load|error|input|keyup|keydown|mouseover|mouseout|focus|blur)\s*=/i.test(line)) {
      console.log(file + ' L' + (idx + 1) + ': ' + line.trim().slice(0, 200));
    }
  });
});
