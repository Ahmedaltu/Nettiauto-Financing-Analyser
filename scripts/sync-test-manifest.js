#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceManifestPath = path.join(repoRoot, 'manifest.json');
const testManifestPath = path.join(repoRoot, 'src', 'manifest.json');

function stripSrcPrefix(filePath) {
  return filePath.replace(/^src\//, '');
}

const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));

const contentScripts = (sourceManifest.content_scripts || []).map((entry) => ({
  matches: entry.matches || [],
  js: (entry.js || []).map(stripSrcPrefix),
  css: (entry.css || []).map(stripSrcPrefix),
  run_at: entry.run_at || 'document_idle'
}));

const testManifest = {
  manifest_version: sourceManifest.manifest_version,
  name: `${sourceManifest.name} (Test)`,
  version: sourceManifest.version,
  description: 'Test manifest for Playwright extension loading from ./src.',
  content_scripts: contentScripts,
  permissions: sourceManifest.permissions || [],
  host_permissions: sourceManifest.host_permissions || []
};

fs.writeFileSync(testManifestPath, `${JSON.stringify(testManifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(repoRoot, testManifestPath)}`);
