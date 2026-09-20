# Publishing Orbitarium to GitHub Pages

## Delivery status

The complete original 178-file source archive is preserved byte-for-byte in the
initial local Git commit. The next commit adds automatic Pages deployment,
validation, documentation, and a guarded publishing helper. These local commits
are delivered in `orbitarium-main.bundle` and are **not evidence of a GitHub push**.

The connected GitHub repository was confirmed to be empty when this package was
prepared. The connection reported repository push/admin permissions, but its
exposed actions supported reads only. The shell could not resolve `github.com`
and had no configured GitHub CLI authentication. No remote push, Pages settings
change, or deployment was completed from that environment.

## Publish the prepared commits

Use Git, Node.js 20 or newer, and GitHub CLI (`gh`) on your own authenticated
machine. Sign in using `gh auth login --hostname github.com` if not already signed
in. Do not place a token in this repository or paste credentials into chat.

Download `orbitarium-main.bundle` and run:

```sh
git clone orbitarium-main.bundle Orbitarium
cd Orbitarium
node scripts/publish-github.mjs --dry-run
node scripts/publish-github.mjs
```

The helper targets **only** `wieslawsoltes/Orbitarium`. It requires a clean `main`
checkout, verifies repository access and existing ancestry, performs a normal
non-force push, verifies the remote commit SHA, configures Pages to use GitHub
Actions, dispatches a uniquely identified deployment, waits for that exact run,
and checks the live HTML plus `revision.txt` against the pushed commit.

Git uses the local `gh` credential helper only for the invoked Git commands;
the script does not change global Git configuration or expose credential values.
The script does not publish packages to npm or create releases.

If remote `main` has gained unrelated or newer commits, the helper stops rather
than deleting or overwriting them. It can be rerun after an interrupted initial
publication. Permissions or network errors are reported rather than misreported
as success. It may push successfully and then fail on Pages permissions; the
output distinguishes these stages.

## Deployment workflow

`.github/workflows/pages.yml` runs on `main` pushes and manual dispatch. It
installs the local workspace, checks JavaScript syntax, runs the numerical tests,
builds `dist/`, verifies project-site-relative assets, and uploads only `dist/`.
The deploy job has `pages: write` and `id-token: write` and uses the `github-pages`
environment. Builds and deployments are serialized without cancelling an active
release. Only `main` is eligible for deployment.

The repository must have Pages configured to use **GitHub Actions**. Adding a
workflow file by itself does not change that repository setting. The helper
performs the setting change after the first commit has been pushed, then requests
a fresh deployment to avoid a race with the first push's automatic run.

The default expected address, once publication actually succeeds, is:

```text
https://wieslawsoltes.github.io/Orbitarium/
```

The helper uses GitHub's returned `html_url`, accommodating an already configured
custom domain without changing it. It fails live verification if the server does
not serve the exact committed revision. A local build intentionally omits
`revision.txt`; the marker is emitted only when `GITHUB_SHA` is supplied in CI.

## Reproduce validation

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
node scripts/verify-pages.mjs
```

The static validator checks all twelve import-map package references, relative
entry/style/icon URLs at the `/Orbitarium/` base, all three WGSL resources, the
standalone app, `.nojekyll`, and the absence of symlinks or `node_modules` in the
Pages artifact.

The browser test runner supports `--artifacts PATH` so new validation does not
overwrite the delivered original evidence. In this delivery environment a
normal local HTTP navigation was blocked by browser policy before the app loaded
(`ERR_BLOCKED_BY_ADMINISTRATOR`). Its evidence is retained under
`artifacts/pages-validation/`; it is not a passed browser-origin test. The
separate offline regression run cannot validate real-origin IndexedDB, WebGPU,
HTTP path loading, or a remote deployment.

## References

- GitHub custom Pages workflows:
  https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Pages configuration API and required permissions:
  https://docs.github.com/en/rest/pages/pages

The API documents that creating/updating Pages configuration requires appropriate
Pages and Administration write permissions for fine-grained credentials. Pushing
workflow files and dispatching Actions also require a credential authorized for
those operations; repository metadata reporting push permission alone does not
prove that every credential scope is available.
