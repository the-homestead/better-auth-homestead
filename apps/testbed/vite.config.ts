import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

function workspaceSource(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export default defineConfig({
  plugins: [tanstackStart(), react()],
  resolve: {
    alias: [
      {
        find: "@homestead/ba-cfx/client",
        replacement: workspaceSource("../../packages/cfx/src/client.ts"),
      },
      {
        find: "@homestead/ba-cfx",
        replacement: workspaceSource("../../packages/cfx/src/index.ts"),
      },
      {
        find: "@homestead/ba-steam/client",
        replacement: workspaceSource("../../packages/steam/src/client/index.ts"),
      },
      {
        find: "@homestead/ba-steam",
        replacement: workspaceSource("../../packages/steam/src/index.ts"),
      },
      {
        find: "@homestead/ba-tebex/client",
        replacement: workspaceSource("../../packages/tebex/src/client/index.ts"),
      },
      {
        find: "@homestead/ba-tebex",
        replacement: workspaceSource("../../packages/tebex/src/index.ts"),
      },
    ],
  },
  server: { port: 3000 },
});
