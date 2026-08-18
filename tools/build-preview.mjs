// Generates popup/_preview.html from the real popup/index.html so the popup can
// be opened in an ordinary browser tab for visual checks.
//
// The file is generated rather than hand-maintained on purpose: a copied test
// page drifts from the real markup within a few edits and then verifies a layout
// that no longer exists. Never edit _preview.html directly — it is overwritten.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'popup', 'index.html');
const target = path.join(root, 'popup', '_preview.html');
const STUB_TAG = '    <script src="_preview-stub.js"></script>';

const html = fs.readFileSync(source, 'utf8');

if (!html.includes('<head>')) {
    console.error('build-preview: no <head> found in popup/index.html — cannot inject the stub.');
    process.exit(1);
}

// Deliberately not deferred: this must run before the deferred popup scripts so
// window.browser exists by the time script.js executes.
fs.writeFileSync(target, html.replace('<head>', `<head>\n${STUB_TAG}`));

console.log('Generated popup/_preview.html');
console.log('Open http://localhost:8731/popup/_preview.html once the server is up.');
