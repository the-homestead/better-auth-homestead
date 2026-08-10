# Contributing

Thank you for improving Better Auth Homestead.

## Before you begin

- Use Bun 1.3.13 and run `bun install` from the repository root.
- Never commit OAuth secrets, session cookies, access tokens, refresh tokens, or personal account
  data.
- Discuss broad new plugins through the new-plugin proposal form before building them.
- Keep each package focused on one provider or Better Auth capability.

## Development workflow

1. Create a branch from `main`.
2. Add a failing test for behavior changes.
3. Implement the smallest change that makes the test pass.
4. Run `bun run validate`.
5. Run `bun run changeset` when a public package changes.
6. Open a pull request using the repository template.

## Commit messages

Every commit and pull-request title must follow
[Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(steam): add profile normalization
fix(cfx): reject profiles without an account id
docs: explain trusted publishing setup
test(steam): cover provider rejection
```

Husky runs Commitlint for local commits, and CI validates the complete pull-request range.

## Quality requirements

Pull requests must pass formatting, type-aware linting, TypeScript checks, tests, builds, and
package-content inspection. Provider behavior must use the official Better Auth test utilities and
mock only the external HTTP boundary.

## Changesets

Use `bun run changeset` and select each affected public package. Choose:

- `patch` for compatible fixes;
- `minor` for compatible features;
- `major` for breaking changes.

Private scaffolds and repository-only documentation do not require a Changeset.
