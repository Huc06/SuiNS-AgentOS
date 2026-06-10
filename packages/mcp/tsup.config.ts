import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Note: src/index.ts already starts with a `#!/usr/bin/env node` shebang,
  // so we must NOT add another via `banner` or the duplicate breaks `node`.
});
