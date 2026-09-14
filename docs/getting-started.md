# Getting started

## Choose a path

| Goal | Command and page | Credentials |
| :--- | :--- | :--- |
| Understand the workflow | `npm run dev`, then `/demo` | None; authored sample |
| Use chat or chain discussions | `npm run dev`, then `/workspace` | Your model provider |
| Develop desktop integrations | `npm run electron:dev` | Depends on the integration |

Use Node.js 22.12+ within 22.x (`nvm use` if you use nvm), then `npm ci`.
The browser development server listens on `127.0.0.1:3000` by default.
To change the port: `npm run dev -- --port 3001`.
An `.env.local` file is not required for the sample.

## First live discussion

1. Open `/workspace` and choose a provider in the setup wizard or **API 设置**.
2. Enter your own API key and base URL. The connection check probes model discovery;
   success means the model list was accessible, not that every model can generate.
   Some providers/gateways do not support discovery; configure a model manually if needed.
3. Choose a model your account can actually access. Displayed model suggestions are
   not an availability guarantee.
4. Create a chat and send a small, non-sensitive prompt. Verify streaming and **停止**.
5. Switch to **Chain**, create a discussion, and inspect the proposal and follow-up stages.
6. Reopen the application to check persistence before relying on it for important work.

The setup wizard no longer imports another tool's credentials or a bundled relay key
automatically. `OPENAI_API_KEY` and similar shell variables are not loaded into the
current frontend key store; use the UI.

## Where data lives

- Browser conversations and encrypted API-key payloads use IndexedDB via
  [`lib/storage.ts`](../lib/storage.ts), with an `aichain:` key prefix.
- Preferences and some memory data use localStorage. Storage belongs to the browser
  origin; switching between `localhost`, `127.0.0.1`, or ports creates separate stores.
- Electron administration data uses SQLite in its application user-data directory.
- The sample's plan, stage and language are React state; reloading resets them. It does
  not create conversations or alter API keys. Export explicitly downloads a Markdown file.
- Cloud inference sends the supplied prompt/context to your configured endpoint.

## Native module troubleshooting

`better-sqlite3` 13 uses Node-API and ships prebuilt binaries for supported
platforms. Unlike the earlier version used here, it does not normally need separate
Node/Electron ABI rebuilds. This change is documented in the
[upstream 13.0.0 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0).

| Symptom | Action |
| :--- | :--- |
| Native loading fails after updating | Run `npm ci` to remove old binaries; confirm Node 22.12+ |
| No prebuild for your platform | Try `npm run rebuild:node-native` with a native compiler toolchain |
| Native compilation fails on macOS | Install Xcode Command Line Tools with `xcode-select --install` |
| Native compilation fails on Linux | Install Python 3, make and a C++ compiler for your distribution |

`npm test` and `npm run test:ci` do not change the native ABI. The old
`rebuild:electron-native` and `electron:fix-native` command names remain as aliases
for `npm rebuild better-sqlite3` for existing developer workflows.

## Build and distribution

```bash
npm run build
npm run start
```

The start script copies the public/static assets into Next.js standalone output
and launches it on `127.0.0.1:3000`. Use `npm run start -- --port 3001` for another
port. It reports a clear error if no production build exists.

Packaging scripts (`electron:pack`, `electron:build`) are development scaffolding,
not a verified release pipeline. Before distribution, supply the missing platform
icons, replace the placeholder release repository, verify the Electron version
across target platforms, review licensing, and verify signing, installation and updates.

## Safe local use

Keep this server on loopback. The browser API path is not an authenticated,
multi-tenant service. Avoid running untrusted plugins or giving tool-enabled models
access to sensitive directories. See [SECURITY.md](../SECURITY.md).
