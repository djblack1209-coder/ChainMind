# Security and data boundaries

ChainMind is a development-stage, local-first application. It has not undergone
an independent security audit and is not a hardened multi-tenant service.

- Keep the development server on `127.0.0.1`. Do not expose the API routes as a public service.
- Model prompts and attachments are sent to the provider/base URL you configure.
  Local persistence does not imply offline inference.
- API keys are encrypted in IndexedDB. The desktop path obtains its secret from
  a per-device file with owner-only permissions (not an OS keychain); the browser fallback is derived from device properties
  and should not be treated as a secure credential vault.
- Desktop tools can access files, commands and configured MCP/plugin processes.
  Use trusted inputs and review tool permissions. These are not verified OS sandboxes.
- `npm run check:secrets` checks common credential patterns in current files.
  It does not scan Git history, revoke leaked credentials, or prove the absence of secrets.

If a key was ever committed, revoke or rotate it at the provider. Removing a file
does not invalidate the key or remove it from existing clones and history.

## Reporting

Never put exploit details, credentials, or personal data in a public issue. Use
GitHub's **Security → Report a vulnerability** if private reporting is available.
Otherwise open a minimal issue requesting a private contact route, without sensitive
details. No dedicated response time or bug-bounty program is currently promised.

## Release prerequisites

Before a public desktop release: verify the current Electron major on target platforms, verify signing
and updates, review permissions and dependency licenses, and exercise real provider
and recovery paths. Passing npm audit alone is not a release approval.
