// verify-csp-hashes.js
const fs = require('fs');
const crypto = require('crypto');

const html = fs.readFileSync(process.argv[2], 'utf8');
const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match, i = 0;

while ((match = regex.exec(html)) !== null) {
  i++;
  const body = match[1];
  const hash = crypto.createHash('sha384').update(body, 'utf8').digest('base64');
  console.log(`Inline script #${i}: sha384-${hash}`);
}