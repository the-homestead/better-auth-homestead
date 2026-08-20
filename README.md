# Better Auth Homestead

[![CI](https://github.com/the-homestead/better-auth-homestead/actions/workflows/ci.yml/badge.svg)](https://github.com/the-homestead/better-auth-homestead/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Homestead's collection of focused, independently versioned plugins for
[Better Auth](https://www.better-auth.com/).

> The repository is maintained by [Homestead Systems](https://github.com/the-homestead).

## Packages

| Package                            | Status                    | Description                    |
| ---------------------------------- | ------------------------- | ------------------------------ |
| `@homestead-systems/ba-steam`      | Public package            | Steam account authentication   |
| `@homestead-systems/ba-cfx`        | Public package            | Cfx.re account authentication  |
| `@homestead-systems/ba-tebex`      | Private release candidate | Tebex billing and entitlements |
| `@homestead-systems/ba-plugin-kit` | Private, unpublished      | Shared Bun-native test helpers |

Steam and Cfx.re contain their provider implementations and are published, while Tebex remains
private until its first live provider-flow verification and release review are complete.

## Requirements

- [Bun](https://bun.sh/) 1.3.13
- TypeScript 7.0.2

## Development

```bash
git clone https://github.com/the-homestead/better-auth-homestead.git
cd better-auth-homestead
bun install
bun run validate
```

Common commands:

```bash
bun test                    # Run every test
bun run test:e2e            # Run the TanStack Start browser suite
bun run test:all            # Run Bun and browser test layers
bun run testbed:dev         # Open the real plugin consumer application
bun run build               # Build all workspaces
bun run lint                # Run type-aware Oxlint
bun run format              # Format with Oxfmt
bun run plugin:create twitch # Scaffold a future plugin
bun run changeset           # Describe a public package change
```

## Repository structure

```text
apps/testbed/          TanStack Start consumer app and full integration/E2E harness
packages/              Publishable plugins and private shared tooling
scripts/               Tested repository and release automation
templates/plugin/      Source template for future plugins
docs/                  Plugin-authoring and maintainer guidance
.changeset/            Independent package release metadata
.github/               CI, releases, ownership, and contribution forms
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes and
[docs/plugin-authoring.md](docs/plugin-authoring.md) before starting a plugin. The
[testbed README](apps/testbed/README.md) explains provider mocks, test layers, browser setup, and how
to add coverage for another plugin.

## License

[MIT](LICENSE) © Homestead Systems
