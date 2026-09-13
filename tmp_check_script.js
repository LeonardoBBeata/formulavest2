const fs = require('fs');
const content = fs.readFileSync('public/script.js', 'utf8');
const idx = content.indexOf('onclick');
console.log('found at index', idx);
if (idx >= 0) {
  console.log(content.slice(idx - 100, idx + 100));
}
