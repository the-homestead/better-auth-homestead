# Better Auth Homestead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a release-ready Bun monorepo for independently versioned Homestead Better Auth plugins, beginning with private Steam and Cfx.re scaffolds.

**Architecture:** A private Bun workspace owns plugin packages, shared tooling, an unpublished template, and a tested generator. TypeScript 7 emits ESM libraries, Better Auth's test harness verifies plugin integration, Oxc enforces source quality, and Changesets plus GitHub Actions handle independent releases.

**Tech Stack:** Bun 1.3, TypeScript 7, Better Auth 1.6 test utilities, Oxlint, Oxfmt, Changesets, Commitlint, Husky, GitHub Actions.

---

### Task 1: Root workspace and toolchain

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `oxlint.config.ts`
- Create: `oxfmt.config.ts`
- Create: `commitlint.config.ts`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.npmrc`
- Create: `.husky/commit-msg`

- [ ] Add a private Bun workspace manifest with exact root scripts for format, lint, type checking, testing, building, validation, Changesets, plugin creation, and guarded publishing.
- [ ] Pin TypeScript 7 and current tool versions in `devDependencies` while keeping Better Auth available for workspace development.
- [ ] Configure strict ESM compilation, declarations, source maps, Bun test types, type-aware Oxlint, and Oxfmt.
- [ ] Configure Commitlint's Conventional Commits preset and a Husky `commit-msg` hook.
- [ ] Run `bun install` and confirm a reproducible `bun.lock` is created.
- [ ] Commit with `chore: configure workspace toolchain`.

### Task 2: Plugin generator using TDD

**Files:**

- Create: `scripts/create-plugin.test.ts`
- Create: `scripts/create-plugin.ts`
- Create: `templates/plugin/package.json.tpl`
- Create: `templates/plugin/tsconfig.json`
- Create: `templates/plugin/src/index.ts.tpl`
- Create: `templates/plugin/src/index.test.ts.tpl`
- Create: `templates/plugin/README.md.tpl`
- Create: `templates/plugin/CHANGELOG.md`

- [ ] Write tests proving valid kebab-case names generate substituted package files in an injected temporary root.
- [ ] Write tests proving uppercase, traversal, empty, and reserved names are rejected and existing packages are never overwritten.
- [ ] Run `bun test scripts/create-plugin.test.ts` and confirm failure because the generator does not exist.
- [ ] Implement validation, template discovery, safe destination resolution, token replacement, and collision protection.
- [ ] Run the generator tests and confirm they pass.
- [ ] Commit with `feat: add reusable plugin generator`.

### Task 3: Initial plugin workspaces and Better Auth integration tests

**Files:**

- Create: `packages/steam/package.json`
- Create: `packages/steam/tsconfig.json`
- Create: `packages/steam/src/index.ts`
- Create: `packages/steam/src/index.test.ts`
- Create: `packages/steam/README.md`
- Create: `packages/steam/CHANGELOG.md`
- Create: `packages/cfx/package.json`
- Create: `packages/cfx/tsconfig.json`
- Create: `packages/cfx/src/index.ts`
- Create: `packages/cfx/src/index.test.ts`
- Create: `packages/cfx/README.md`
- Create: `packages/cfx/CHANGELOG.md`
- Create: `packages/plugin-kit/package.json`
- Create: `packages/plugin-kit/tsconfig.json`
- Create: `packages/plugin-kit/src/index.ts`

- [ ] Write failing package contract tests for stable plugin IDs and Better Auth installation through the official `testUtils()` plugin.
- [ ] Generate the Steam and Cfx.re package structures using the tested generator.
- [ ] Implement minimal typed plugin factories returning `BetterAuthPlugin` objects.
- [ ] Add private package manifests with final npm names, explicit export maps, Better Auth peer dependencies, and publish allowlists.
- [ ] Run package tests, type checking, and builds; confirm outputs include JavaScript, declarations, maps, and no test files.
- [ ] Commit with `feat: scaffold steam and cfx plugins`.

### Task 4: Release safeguards and package inspection

**Files:**

- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Create: `scripts/check-packages.ts`
- Create: `scripts/check-packages.test.ts`
- Create: `scripts/publish.ts`
- Create: `scripts/publish.test.ts`

- [ ] Write failing tests for package-output validation and clean-main-branch release guards.
- [ ] Implement package inspection that rejects missing output, source/test leakage, and non-private packages without required metadata.
- [ ] Implement the manual publish guard with injectable Git and command adapters so destructive publication is never invoked by tests.
- [ ] Configure Changesets for independent public package versions and public access.
- [ ] Run all script tests and verify their failure-path messages.
- [ ] Commit with `feat: add guarded release tooling`.

### Task 5: GitHub automation and repository documentation

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/CODEOWNERS`
- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/plugin.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `SUPPORT.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `docs/plugin-authoring.md`
- Create: `docs/releases.md`

- [ ] Add CI jobs for Conventional Commits and the full validation command.
- [ ] Add a Changesets release workflow with scoped permissions, npm provenance, concurrency control, and Bun setup.
- [ ] Add ownership, dependency update, issue, and pull-request configuration.
- [ ] Document setup, repository layout, package status, contribution standards, security reporting, plugin creation, and release operation.
- [ ] Commit with `docs: add community and release guidance`.

### Task 6: Complete verification

**Files:**

- Modify only files revealed by verification failures.

- [ ] Run `bun install --frozen-lockfile`.
- [ ] Run `bun run format:check`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun test`.
- [ ] Run `bun run build`.
- [ ] Run `bun run packages:check`.
- [ ] Run `bun run validate` from a clean checkout-equivalent state.
- [ ] Inspect `git diff --check`, `git status`, package tarball contents, and recent commit authorship.
- [ ] Commit any verification-only corrections with an appropriate Conventional Commit message.
