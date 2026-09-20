#!/usr/bin/env node
/** Push this complete committed tree and publish Pages using the user's local gh login.
 * No tokens are read, logged, copied or stored by this script. Never force-pushes.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = 'wieslawsoltes/Orbitarium';
const remote = `https://github.com/${repo}.git`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiVersion = '2026-03-10';
const gitAuth = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];

function command(file, args, { allowFailure = false, live = false, timeout = 120_000 } = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: live ? 'inherit' : 'pipe',
    timeout,
    env: { ...process.env, GH_HOST: 'github.com', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`${file} ${args.join(' ')} failed:\n${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  return result;
}
const git = (...args) => command('git', args).stdout.trim();
const gh = (...args) => command('gh', args).stdout.trim();
function api(endpoint, args = [], allowFailure = false) {
  return command('gh', ['api', '--hostname', 'github.com', '-H', `X-GitHub-Api-Version: ${apiVersion}`, endpoint, ...args], { allowFailure });
}
function jsonApi(endpoint, args = []) { return JSON.parse(api(endpoint, args).stdout); }

async function main() {
  const options = process.argv.slice(2);
  if (options.includes('--help')) {
    console.log('Usage: node scripts/publish-github.mjs [--dry-run]\nRequires Git, Node.js >=20, and GitHub CLI authenticated for wieslawsoltes/Orbitarium.');
    return;
  }
  if (options.some(arg => arg !== '--dry-run')) throw new Error('Unknown argument. Use --help.');
  const sha = git('rev-parse', 'HEAD');
  if (git('branch', '--show-current') !== 'main') throw new Error('Check out main before publishing.');
  if (git('status', '--porcelain')) throw new Error('Working tree is not clean. Commit or remove local changes first.');
  console.log(`Repository: ${repo}\nCommit: ${sha}\nTarget: ${remote}`);
  if (options.includes('--dry-run')) {
    console.log('Dry run only: validate access; push without force; enable Actions-based Pages; dispatch and watch deployment; verify published revision.');
    return;
  }

  command('gh', ['--version']);
  command('gh', ['auth', 'status', '--hostname', 'github.com']);
  const info = jsonApi(`repos/${repo}`);
  if (info.full_name !== repo || info.archived || !info.permissions?.push) {
    throw new Error('The authenticated account cannot push to the expected active repository.');
  }
  const heads = command('git', [...gitAuth, 'ls-remote', remote, 'refs/heads/main']).stdout.trim();
  if (heads) {
    const remoteSha = heads.split(/\s+/)[0];
    command('git', [...gitAuth, 'fetch', '--no-tags', remote, 'refs/heads/main']);
    const ancestor = command('git', ['merge-base', '--is-ancestor', remoteSha, sha], { allowFailure: true });
    if (ancestor.status !== 0) throw new Error('Remote main contains unrelated or newer commits. Refusing to overwrite them.');
  }
  // A normal push also guards against a concurrent non-fast-forward remote update.
  command('git', [...gitAuth, 'push', remote, 'HEAD:refs/heads/main'], { live: true });
  const ref = jsonApi(`repos/${repo}/git/ref/heads/main`);
  if (ref.object?.sha !== sha) throw new Error('Remote main does not match the pushed commit.');
  console.log(`Verified remote main: ${sha}`);

  // Configuring Pages on a previously empty repository requires the initial push first.
  const siteRead = api(`repos/${repo}/pages`, [], true);
  if (siteRead.error) throw siteRead.error;
  if (siteRead.status === 0) {
    const currentSite = JSON.parse(siteRead.stdout);
    if (currentSite.build_type !== 'workflow') {
      api(`repos/${repo}/pages`, ['--method', 'PUT', '-f', 'build_type=workflow']);
    }
  } else if (/HTTP 404/.test(siteRead.stderr || '')) {
    api(`repos/${repo}/pages`, ['--method', 'POST', '-f', 'build_type=workflow']);
  } else {
    throw new Error(`Unable to read Pages settings; refusing to treat an authorization or network error as a missing site:\n${siteRead.stderr}`);
  }

  // A fresh manual run avoids any initial-push/Pages-enablement race.
  const requestId = `publish-${Date.now()}-${sha.slice(0, 12)}`;
  let dispatched = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = command('gh', ['workflow', 'run', 'pages.yml', '--repo', repo, '--ref', 'main', '-f', `request_id=${requestId}`], { allowFailure: true });
    if (result.status === 0) { dispatched = true; break; }
    if (!/404|could not find any workflows/i.test(result.stderr || '')) {
      throw new Error(`Workflow dispatch failed:\n${result.error?.message || result.stderr}`);
    }
    await sleep(2000);
  }
  if (!dispatched) throw new Error('The Pages workflow is not registered yet. Re-run this idempotent helper.');

  let run;
  for (let attempt = 0; attempt < 40; attempt++) {
    const runs = JSON.parse(gh('run', 'list', '--repo', repo, '--workflow', 'pages.yml', '--branch', 'main', '--commit', sha,
      '--event', 'workflow_dispatch', '--limit', '30', '--json', 'databaseId,displayTitle,headSha,url'));
    run = runs.find(candidate => candidate.displayTitle === `Orbitarium Pages · ${requestId}` && candidate.headSha === sha);
    if (run) break;
    await sleep(3000);
  }
  if (!run) throw new Error('The dispatched deployment was not found. Inspect the repository Actions tab.');
  console.log(`Deployment: ${run.url}`);
  command('gh', ['run', 'watch', String(run.databaseId), '--repo', repo, '--exit-status', '--interval', '3'], { live: true, timeout: 20 * 60_000 });
  const site = jsonApi(`repos/${repo}/pages`);
  if (!site.html_url) throw new Error('Pages returned no site URL.');
  const siteUrl = new URL(site.html_url.endsWith('/') ? site.html_url : `${site.html_url}/`);
  if (siteUrl.protocol !== 'https:') throw new Error('The reported Pages URL is not HTTPS.');

  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const revisionUrl = new URL('revision.txt', siteUrl);
      revisionUrl.searchParams.set('commit', sha);
      const revision = await fetch(revisionUrl, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!revision.ok || (await revision.text()).trim() !== sha) throw new Error('Published revision is not yet the pushed commit.');
      const page = await fetch(siteUrl, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!page.ok || !(await page.text()).includes('Orbitarium')) throw new Error('Published application did not return the expected HTML.');
      console.log(`Published and verified: ${siteUrl}\nCommit: ${sha}`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(3000);
    }
  }
  throw new Error(`Deployment succeeded, but live-site verification did not: ${lastError?.message}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
