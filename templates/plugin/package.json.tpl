{
  "name": "{{PLUGIN_PACKAGE_NAME}}",
  "version": "0.0.0",
  "private": true,
  "description": "{{PLUGIN_DESCRIPTION}}",
  "author": "Homestead Systems <dabz@homestead.systems>",
  "license": "MIT",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/the-homestead/better-auth-homestead.git",
    "directory": "packages/{{PLUGIN_NAME}}"
  },
  "homepage": "https://github.com/the-homestead/better-auth-homestead/tree/main/packages/{{PLUGIN_NAME}}#readme",
  "bugs": {
    "url": "https://github.com/the-homestead/better-auth-homestead/issues"
  },
  "keywords": [
    "better-auth",
    "authentication",
    "{{PLUGIN_NAME}}",
    "homestead"
  ],
  "files": [
    "dist",
    "CHANGELOG.md",
    "LICENSE",
    "README.md"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "bun run clean && tsc -p tsconfig.json",
    "clean": "bun -e \"import { rm } from 'node:fs/promises'; await rm('dist', { force: true, recursive: true });\"",
    "test": "bun test",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "peerDependencies": {
    "better-auth": ">=1.6.0 <2"
  },
  "devDependencies": {
    "@homestead-systems/ba-plugin-kit": "workspace:*"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
