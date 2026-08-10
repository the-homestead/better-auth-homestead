# Better Auth Homestead Monorepo Design

## Purpose

`better-auth-homestead` is the public Homestead home for independently published Better Auth plugins maintained by ItzDabbzz. The repository starts with Steam and Cfx.re plugin workspaces and a reusable generator for future plugins.

## Ownership and naming

- Repository: `the-homestead/better-auth-homestead`
- Author and primary maintainer: `ItzDabbzz`
- npm scope: `@itzdabbzz`
- Initial package names: `@itzdabbzz/better-auth-steam` and `@itzdabbzz/better-auth-cfx`
- License: MIT
- Project-facing branding: Homestead
- No generated-by, Codex, or OpenAI attribution is added to source, documentation, commits, or package metadata.

## Architecture

The repository is a private Bun workspace root containing independent plugin packages under `packages/*`. Steam and Cfx.re start as private packages so unfinished provider implementations cannot be published. Each package already has its final npm name, build configuration, export map, tests, and documentation structure.

`packages/plugin-kit` is an unpublished workspace for shared types and testing helpers. It must not become a speculative OAuth abstraction: shared runtime behavior moves there only after at least two plugins need the same behavior.

`templates/plugin` is not publishable. `scripts/create-plugin.ts` copies that template, validates a kebab-case plugin name, and replaces package names, display names, and plugin identifiers. This gives future plugins the same structure without copying Steam or Cfx.re implementation details.

## Toolchain

- Bun manages dependencies, workspaces, scripts, and tests.
- TypeScript 7 compiles ESM JavaScript, declarations, declaration maps, and source maps.
- Oxlint performs correctness and type-aware linting.
- Oxfmt formats source, configuration, Markdown, and workflow files.
- Better Auth is a peer dependency for public plugins and a development dependency for compilation and integration tests.
- Changesets provides independent versions, changelogs, release pull requests, and npm publication.
- Commitlint and Husky enforce Conventional Commits locally. CI validates every commit in pull requests and pushes.

## Package contract

Each plugin package:

- uses named exports rather than a default export;
- has an explicit ESM export map pointing only to built files;
- publishes only `dist`, `README.md`, `LICENSE`, and `CHANGELOG.md`;
- declares Better Auth as a peer dependency;
- exposes separate server and client entry points only when client behavior exists;
- includes package-specific setup, configuration, and API documentation;
- remains `private: true` until its real provider implementation and release Changeset are ready.

The initial Steam and Cfx.re source files expose minimal Better Auth plugin factories with stable plugin IDs. They are scaffolding contracts, not claims that OAuth flows are implemented.

## Testing and verification

Tests use Bun's test runner. Better Auth integration tests use its official `getTestInstance()` harness with an isolated SQLite database and real Better Auth instances. External provider HTTP calls are mocked only at the network boundary.

The initial scaffold verifies plugin identity, Better Auth installation, package exports, generator validation, template substitution, and collision protection. Provider implementations must later cover callback success, provider rejection, malformed profiles, missing identifiers, account linking, and type compatibility.

The full verification pipeline runs formatting checks, Oxlint, TypeScript checks, tests, builds, and packed-package content inspection. Pull requests and `main` use the same commands as local development.

## Releases

Changesets versions public packages independently. A GitHub Actions release workflow maintains a version pull request and publishes approved versions to npm with provenance. Publishing permissions exist only in the release job.

A guarded manual release script is also provided. It requires a clean working tree on `main`, runs the entire verification pipeline, and then invokes Changesets publishing. Packages remain protected from accidental publication while marked private.

## Repository documentation

The repository includes:

- root and package READMEs;
- MIT license;
- contributing, security, support, and code-of-conduct policies;
- plugin-authoring and maintainer release guides;
- bug, feature, and plugin-proposal issue forms;
- pull-request template and CODEOWNERS;
- Dependabot and GitHub Actions configuration;
- Changesets instructions and generated per-package changelogs.

## Scope boundaries

This scaffold does not invent the Steam or Cfx.re OAuth implementations, credentials, provider behavior, or consumer framework examples. Those are added when the existing plugin code is introduced. It does establish the tested package contracts and release-safe repository into which that code can be placed.
