const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ignored = new Set(['.git', 'node_modules']);

function collect(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

const files = collect(path.join(__dirname, '..'));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Sintaxe aprovada: ${files.length} arquivos JavaScript.`);
