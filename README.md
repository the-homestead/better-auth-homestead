# Better Auth Homestead

[![CI](https://github.com/the-homestead/better-auth-homestead/actions/workflows/ci.yml/badge.svg)](https://github.com/the-homestead/better-auth-homestead/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Homestead's collection of focused, independently versioned plugins for
[Better Auth](https://www.better-auth.com/). The repository is maintained by
[ItzDabbzz](https://github.com/ItzDabbzz).

## Packages

| Package                             | Status                    | Description                    |
| ----------------------------------- | ------------------------- | ------------------------------ |
| `@itzdabbzz/better-auth-steam`      | Private release candidate | Steam account authentication   |
| `@itzdabbzz/better-auth-cfx`        | Private release candidate | Cfx.re account authentication  |
| `@itzdabbzz/better-auth-plugin-kit` | Private, unpublished      | Shared Bun-native test helpers |

Steam and Cfx.re now contain their provider implementations but remain intentionally private until
their first live provider-flow verification and release review are complete.

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
bun run build               # Build all workspaces
bun run lint                # Run type-aware Oxlint
bun run format              # Format with Oxfmt
bun run plugin:create twitch # Scaffold a future plugin
bun run changeset           # Describe a public package change
```

## Repository structure

```text
packages/              Publishable plugins and private shared tooling
scripts/               Tested repository and release automation
templates/plugin/      Source template for future plugins
docs/                  Plugin-authoring and maintainer guidance
.changeset/            Independent package release metadata
.github/               CI, releases, ownership, and contribution forms
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes and
[docs/plugin-authoring.md](docs/plugin-authoring.md) before starting a plugin.

## License

[MIT](LICENSE) © ItzDabbzz
