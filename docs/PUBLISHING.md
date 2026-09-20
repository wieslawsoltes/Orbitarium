# Publishing Orbitarium

## Repository and application

- Repository: https://github.com/wieslawsoltes/Orbitarium
- Application: https://wieslawsoltes.github.io/Orbitarium/
- Deployment runs: https://github.com/wieslawsoltes/Orbitarium/actions/workflows/pages.yml

The complete project is committed to remote `main`, including source, twelve package archives, examples, standalone HTML, `dist/`, documentation and test evidence. Clone the remote repository for subsequent work:

```sh
git clone https://github.com/wieslawsoltes/Orbitarium.git
cd Orbitarium
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
node scripts/verify-pages.mjs
```

## Automatic publication

`.github/workflows/pages.yml` runs on pushes to `main` and manual dispatch. It checks syntax, executes numerical tests, builds `dist/`, verifies the `/Orbitarium/` project-site paths, uploads the Pages artifact and deploys through the `github-pages` environment. A final network check verifies the exact committed revision through `revision.txt`, then fetches HTML, JavaScript, stylesheet, GPU module and all three WGSL kernels. The run's summary records the published URL and commit only after those checks succeed.

The build job uses read permissions. The deployment job grants only repository read, Pages write and OIDC token write. Deployment concurrency is serialized. No personal token is stored in source, the application or build output. Public npm publication and release creation are separate operations and are not performed here.

`GITHUB_SHA` adds `dist/revision.txt` in CI. Local builds intentionally omit that marker. `node scripts/verify-pages.mjs` checks all twelve import-map packages, relative entry/style/icon URLs, all WGSL resources, the standalone app, `.nojekyll` and absence of deployment symlinks or `node_modules`.

## Import provenance

The initial environment could not push with Git or use connector write actions. Its original local commits remain in the separately delivered `orbitarium-main.bundle`. On retry, connector writes succeeded. The complete source was transferred as a SHA-256-verified archive and unpacked on GitHub Actions. Generated scenario files, distribution and package archives were rebuilt; all twelve archives matched their delivered SHA-1 and SHA-512 values. See `release/import-verification.json` and the executed import run:

https://github.com/wieslawsoltes/Orbitarium/actions/runs/35509271186

The remote history is a new, non-force import history; it does not reuse the original local bundle's commit IDs. The temporary transport chunks were removed from the final source tree. The one-time import workflow is inert when its READY marker is absent. Original local screenshots were replaced by fresh Chromium captures; `artifacts/SCREENSHOT-PROVENANCE.md` records that distinction. Historical local validation JSON/log files remain historical evidence, not claims about current CI.

Do not push the old bundle over remote `main`: its ancestry differs. `scripts/publish-github.mjs` is retained as an optional guarded CLI publisher for a current remote clone. It deliberately refuses unrelated/newer remote history and never force-pushes.

## Validation

The import passed 32 numerical and 38 real-origin browser checks, including IndexedDB CRUD and mobile layout. WebGPU execution was not run because the default headless browser did not expose an eligible adapter. Current CI artifacts and deployment statuses, rather than historical local reports, are the authoritative results for later revisions.

Official workflow reference:
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
