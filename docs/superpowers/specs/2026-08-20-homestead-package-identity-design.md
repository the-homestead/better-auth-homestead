# Homestead package identity migration

## Goal

Establish the first-release package and maintainer identity for the Homestead Better Auth monorepo before any package is published to npm.

## Decisions

- Use the `@homestead-systems/ba-*` npm namespace for all first-party workspace packages.
- Rename the publishable packages to:
  - `@homestead-systems/ba-steam`
  - `@homestead-systems/ba-cfx`
  - `@homestead-systems/ba-tebex`
- Rename private workspace packages consistently:
  - `@homestead-systems/ba-plugin-kit`
  - `@homestead-systems/ba-testbed`
- Make the plugin generator produce `@homestead-systems/ba-${name}` package names.
- Update all first-party imports, workspace dependencies, TypeScript paths, Vite aliases, test fixtures, templates, READMEs, changelogs, release guidance, and design specifications.
- Use `Homestead Systems <dabz@homestead.systems>` for package author metadata.
- Use `support@homestead.systems` for support and security contact text.
- Use `noreply@homestead.systems` only for automation or no-reply metadata where such metadata exists.
- Preserve unrelated external GitHub links and references.

## Approach

Perform one repository-wide identity migration, then regenerate `bun.lock`. No compatibility package aliases are needed because the old names have not been released.

## Validation

1. Run focused generator and package-check tests.
2. Regenerate and verify the Bun lockfile.
3. Search first-party files for stale `@itzdabbzz` references and old maintainer contact details.
4. Run formatting, linting, typechecking, package checks, unit/integration/React tests, build, and E2E validation through `bun run validate`.
5. Inspect the final diff for accidental changes to unrelated external references.
