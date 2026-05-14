#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const stageDir = path.join(repoRoot, '.release-tmp');
const manifestPath = path.join(repoRoot, 'manifest.json');

function cleanDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const artifactName = `${sanitizeName(manifest.name)}-v${manifest.version}.zip`;
const zipPath = path.join(distDir, artifactName);
const excludedRelativeFiles = new Set(['src/manifest.json']);

const includePaths = [
  'manifest.json',
  'popup.html',
  'privacy.md',
  'icons',
  'src'
];

cleanDir(stageDir);
ensureDir(stageDir);
ensureDir(distDir);

for (const relativePath of includePaths) {
  const srcPath = path.join(repoRoot, relativePath);
  const destPath = path.join(stageDir, relativePath);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`Missing required path: ${relativePath}`);
  }

  copyRecursive(srcPath, destPath);
}

for (const relativePath of excludedRelativeFiles) {
  const stagedPath = path.join(stageDir, relativePath);
  if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true });
}

if (process.platform === 'win32') {
  const cmd = `Compress-Archive -Path '${path.join(stageDir, '*')}' -DestinationPath '${zipPath}' -Force`;
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { stdio: 'inherit' });
} else {
  execSync(`cd \"${stageDir}\" && zip -r \"${zipPath}\" .`, { stdio: 'inherit' });
}

cleanDir(stageDir);
console.log(`Created ${path.relative(repoRoot, zipPath)}`);
