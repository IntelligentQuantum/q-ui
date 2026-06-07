#!/usr/bin/env node
// release.mjs — cut a q-ui release.
//
// Bumps config/version, runs pre-flight checks, commits everything, creates the
// vX.Y.Z tag and pushes it. The GitHub "Release" workflow then builds and
// publishes the release artifacts (it also stamps the binary version from the
// tag, so this bump just keeps the repo/dev version in sync).
//
// Usage:
//   node scripts/release.mjs                 auto patch bump (1.0.7 -> 1.0.8)
//   node scripts/release.mjs minor           1.0.7 -> 1.1.0
//   node scripts/release.mjs major           1.0.7 -> 2.0.0
//   node scripts/release.mjs 1.2.3           explicit version
//   ... add --dry-run to preview, --skip-checks to skip go/tsc/build
//
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const skipChecks = argv.includes('--skip-checks');
const arg = argv.find((a) => !a.startsWith('-')); // version | patch|minor|major | undefined

const c = { red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };
const log = (m) => console.log(`${c.cyan}==>${c.reset} ${m}`);
const die = (m) => { console.error(`${c.red}ERROR:${c.reset} ${m}`); process.exit(1); };

function sh(cmd, { capture = false, env } = {}) {
  console.log(`${c.dim}$ ${cmd}${c.reset}`);
  if (dryRun) return '';
  return execSync(cmd, { cwd: root, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', env: { ...process.env, ...env } });
}
const out = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();

// Increment a semver string by the given level.
function bumpVersion(curr, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(curr);
  if (!m) die(`config/version "${curr}" isn't X.Y.Z — pass an explicit version (e.g. 1.0.8).`);
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (level === 'major') { major += 1; minor = 0; patch = 0; }
  else if (level === 'minor') { minor += 1; patch = 0; }
  else { patch += 1; }
  return `${major}.${minor}.${patch}`;
}

// ---- setup ----
try { out('git rev-parse --is-inside-work-tree'); } catch { die('Not inside a git repository.'); }
const versionFile = path.join(root, 'config', 'version');
const current = readFileSync(versionFile, 'utf8').trim();

// ---- resolve the target version ----
//  - no arg / patch|minor|major  -> auto-increment from current
//  - explicit X.Y.Z              -> use as-is
let version;
if (!arg || ['patch', 'minor', 'major'].includes(arg)) {
  version = bumpVersion(current, arg || 'patch');
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  version = arg;
} else {
  die(`Invalid argument "${arg}". Use a version (X.Y.Z), patch|minor|major, or nothing for an auto patch bump.`);
}

const tag = `v${version}`;
// Local tag check only — we deliberately avoid hitting the remote here so the
// script never blocks on an SSH passphrase prompt during validation. If the tag
// somehow exists only on origin, `git push origin <tag>` will reject it clearly.
if (out('git tag --list').split(/\r?\n/).includes(tag)) die(`Tag ${tag} already exists locally — bump the version.`);

const branch = out('git rev-parse --abbrev-ref HEAD');
log(`Releasing ${c.green}${tag}${c.reset}  (current ${current})  on branch ${c.yellow}${branch}${c.reset}`);
if (dryRun) log(`${c.yellow}dry-run: no files changed, nothing committed or pushed${c.reset}`);

// ---- pre-flight checks ----
if (skipChecks) {
  log(`${c.yellow}skipping checks (--skip-checks)${c.reset}`);
} else {
  log('Pre-flight: go build (CGO off)');
  sh('go build ./...', { env: { CGO_ENABLED: '0' } });
  log('Pre-flight: frontend typecheck');
  sh('npm --prefix frontend run typecheck');
  log('Pre-flight: frontend build');
  sh('npm --prefix frontend run build');
}

// ---- bump version ----
if (current === version) {
  log(`config/version already ${version}`);
} else {
  log(`Bumping config/version: ${current} -> ${version}`);
  if (!dryRun) writeFileSync(versionFile, `${version}\n`);
}

// ---- commit (everything), tag, push ----
log('Staging changes');
sh('git add -A');

const staged = dryRun ? 'dry-run' : out('git diff --cached --name-only');
if (!staged) {
  log(`${c.yellow}nothing to commit — tagging current HEAD${c.reset}`);
} else {
  log('Committing');
  sh(`git commit -m "release: ${tag}"`);
}

log('Tagging (annotated)');
sh(`git tag -a ${tag} -m "release ${tag}"`);

log(`Pushing ${branch} + ${tag}`);
sh(`git push origin ${branch}`);
sh(`git push origin ${tag}`);

console.log(`\n${c.green}✓ Released ${tag}.${c.reset} GitHub Actions ("Release") will build & publish it.`);
console.log(`  Verify when it finishes:`);
console.log(`    curl -sL https://api.github.com/repos/IntelligentQuantum/q-ui/releases/latest`);
