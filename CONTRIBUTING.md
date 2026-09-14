# Contributing to ChainMind

Thanks for helping make multi-agent discussions easier to inspect and use.
Small, reproducible improvements are welcome: onboarding, streaming failures,
accessibility, documentation, and examples are good places to start.

## Development

Use Node.js 22.12+ (22.x) and npm. A compiler toolchain may be needed for `better-sqlite3`
(Xcode Command Line Tools on macOS; Python, make and a C++ compiler on Linux).

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000/demo` for the no-key sample or `/workspace` for live use.
The demo contains authored content and never calls a model. Use your own credentials
for live requests. Do not put secrets into source code, screenshots or fixtures.

## Verification

```bash
npm run check:secrets
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

`npm test` and `test:ci` run the same suite. `better-sqlite3` 13 uses Node-API
prebuilds shared across compatible Node/Electron runtimes. There are no automatic
ABI rebuild hooks. If native loading fails after an upgrade, run `npm ci` to remove
stale artifacts; see [troubleshooting](docs/getting-started.md#native-module-troubleshooting).

Add regression tests for changed behavior; documentation-only changes need link
and diff checks. For UI changes, verify the running page at desktop and mobile sizes.
Use sample content in screenshots. Do not describe a mocked test as a live provider test.

## Pull requests

- Explain the user-visible problem and resulting behavior.
- Keep the change focused; preserve unrelated work.
- List relevant verification and remaining limits.
- Follow the project's current licensing status in the README. A root license and
  upstream attribution review are still pending; do not assume a permissive license.

For possible security issues, see [SECURITY.md](SECURITY.md).
