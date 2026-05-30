# Contributing

## Branch workflow

`main` is protected. **Do not push directly to `main`.**

1. Create a feature branch from `main`:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/your-change
   ```
2. Commit your changes and push the branch:
   ```bash
   git push -u origin feat/your-change
   ```
3. Open a **Pull Request** into `main` on GitHub.
4. Wait for **CI** to pass (`JavaScript / TypeScript`, `Move contracts`).
5. Merge the PR (squash or merge commit — either is fine).

## Branch naming

- `feat/` — new features
- `fix/` — bug fixes
- `chore/` — tooling, CI, docs
- `refactor/` — code changes without behavior change

## Local checks before opening a PR

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm contracts:test
```

## Releases & deploy

- **CI** runs automatically on every PR and push to `main`.
- **CD** (contract publish / frontend artifact) is manual via GitHub Actions → **CD** workflow.

See [README.md](./README.md) for monorepo layout and package overview.
