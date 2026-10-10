import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deploy rollback/staging snapshots created by the CLAUDE.md runbook — compiled
    // output, not source. Without these, `npm run lint` reports ~963 errors from
    // build artifacts and buries every real finding.
    ".next.old/**",
    ".next.new/**",
    ".next.broken/**",
    // Vendored Claude Code skill scripts — third-party, not part of the app build
    ".agents/**",
    ".claude/**",
    // k6 load test scripts — CommonJS Node.js, not part of Next.js build
    "load-tests/**",
    // Dev-only smoke/verification CommonJS scripts — not part of Next.js build
    "scripts/**/*.cjs",
    // GSD worktree copies — orphaned snapshots used by parallel executors
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
