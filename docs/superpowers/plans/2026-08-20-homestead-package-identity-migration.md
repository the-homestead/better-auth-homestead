# Homestead Package Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all first-party packages and references to the Homestead `@homestead-systems/ba-*` first-release identity before npm publication.

**Architecture:** Keep the existing Bun workspace layout and public APIs unchanged. Update package names at the manifest boundary, then propagate those names through TypeScript/Vite resolution, imports, generator templates, tests, and documentation. Regenerate the Bun lockfile after manifests are consistent; no aliases or compatibility shims are added.

**Tech Stack:** Bun 1.3.13, TypeScript 7, Vite, Bun test, Playwright, Markdown, Bun lockfile.

---

### Task 1: Rename workspace package metadata

**Files:**

- Modify: `package.json`
- Modify: `packages/plugin-kit/package.json`
- Modify: `packages/steam/package.json`
- Modify: `packages/cfx/package.json`
- Modify: `packages/tebex/package.json`
- Modify: `apps/testbed/package.json`

- [ ] Replace old first-party package names with `@homestead-systems/ba-plugin-kit`, `@homestead-systems/ba-steam`, `@homestead-systems/ba-cfx`, `@homestead-systems/ba-tebex`, and `@homestead-systems/ba-testbed`.
- [ ] Replace workspace dependency keys and the root typecheck filter with the new names.
- [ ] Preserve existing versions, scripts, repository URLs, author metadata, and unrelated dependencies.

### Task 2: Update resolver and source references

**Files:**

- Modify: `tsconfig.json`
- Modify: `apps/testbed/vite.config.ts`
- Modify: `apps/testbed/src/auth/auth-client.ts`
- Modify: `apps/testbed/test-support/plugins.ts`
- Modify: affected files under `apps/testbed/tests/` and `packages/`

- [ ] Replace old package imports and subpath imports with the matching `@homestead-systems/ba-*` names.
- [ ] Update TypeScript path aliases and Vite aliases to point at the existing source directories.
- [ ] Keep runtime behavior and export paths unchanged.

### Task 3: Update generator and package templates

**Files:**

- Modify: `scripts/create-plugin.ts`
- Modify: `scripts/create-plugin.test.ts`
- Modify: `scripts/check-packages.ts`
- Modify: `scripts/check-packages.test.ts`
- Modify: `templates/plugin/package.json.tpl`
- Modify: `templates/plugin/src/index.test.ts.tpl`

- [ ] Generate package names as `@homestead-systems/ba-${options.name}`.
- [ ] Update generator expectations, package checker fixtures, and template imports to the new private plugin-kit name.
- [ ] Retain the generator's lowercase kebab-case validation and file rendering behavior.

### Task 4: Update first-party documentation and release material

**Files:**

- Modify: `README.md`
- Modify: `docs/plugin-authoring.md`
- Modify: `docs/releases.md`
- Modify: package `README.md` and `CHANGELOG.md` files under `packages/`
- Modify: relevant files under `docs/superpowers/specs/`

- [ ] Replace old first-party package names, installation commands, dependency examples, and import examples.
- [ ] Use Homestead support/security contact details where package-maintainer contact text is present.
- [ ] Preserve the user's existing unrelated README changes and unrelated external URLs.

### Task 5: Regenerate and validate

**Files:**

- Modify: `bun.lock`

- [ ] Run `bun install` from the repository root to regenerate workspace package entries and dependency links.
- [ ] Run focused tests: `bun test scripts/create-plugin.test.ts scripts/check-packages.test.ts packages/cfx/src packages/plugin-kit/src packages/steam/tests packages/tebex/tests`.
- [ ] Search for stale first-party references with `rg -n '@itzdabbzz|better-auth-(steam|cfx|tebex|plugin-kit|testbed)' --glob '!bun.lock'` and review every result.
- [ ] Run `bun run validate` and fix only migration-related failures.
- [ ] Run `git diff --check` and inspect the final diff for accidental unrelated changes.
