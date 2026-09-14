# Roadmap

The product focus is a local-first, human-guided discussion workspace. These are
acceptance criteria, not delivery promises or completed features.

## Next: make the core loop trustworthy

- [ ] **Live discussion regression:** with user-supplied credentials, complete intake → selection → review → assignment → report; exercise provider failure, stop, retry, and reopen.
- [ ] **Workflow controller:** move guided-stage orchestration out of the large `ChainPanel`; cover transitions, duplicate actions, and late streaming events after cancellation.
- [ ] **MCP configuration:** replace the current URL-oriented panel with the real stdio command/args/env configuration; show connection, tool list, call result, timeout, and disconnect.
- [ ] **Credential storage:** replace the weak browser-derived fallback; specify migration, failure recovery and user consent.
- [ ] **Failure visibility:** distinguish interrupted, failed and completed stages; avoid success labels based only on input shape.

## Then: earn a desktop release

- [ ] Complete cross-platform regression of the Electron 44 migration: preload, IPC, native SQLite, rendering and packaged installation.
- [x] Unify application icons and point update metadata at this repository.
- [ ] Verify signing/notarization and an install/update/rollback checklist.
- [ ] Confirm root licensing and upstream notices before calling the project permissively licensed or distributing installers.
- [ ] Test export/import and recovery of conversations, keys and SQLite data independently.
- [ ] Reproduce installation and the primary discussion flow on macOS and Windows; record exact versions and evidence.

## Later: expand only with evidence

- [ ] Publish a small evaluation set comparing single-model and role-based runs under the same task and cost constraints.
- [ ] Decide whether a full DAG editor belongs in the product; currently its engine and nodes exist without a mounted editor.
- [ ] Assess team synchronization only after repeated user demand. Tenant isolation, queues, quotas and billing are not implemented.

## Community-sized improvements

- Improve keyboard and narrow-screen behavior in the main workspace.
- Add a reproducible failure case to streaming tests.
- Contribute an authored discussion example with explicit sample labeling.
- Verify setup instructions on a clean machine and report exact steps.

Use [issues](https://github.com/djblack1209-coder/ChainMind/issues/new/choose) to discuss
a concrete user problem before starting a large feature.
