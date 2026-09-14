# Licensing and attribution status

ChainMind did not have a root license when this documentation was added.
No license is granted by a badge, a public repository, or this document.

## Dependencies

Direct dependencies are listed in [`package.json`](../package.json); exact versions
are recorded in [`package-lock.json`](../package-lock.json). Their licenses and notices
remain applicable. A dependency and asset notice inventory is still required before
redistributing desktop binaries.

## GVA references

Some desktop modules describe themselves as ported from or inspired by GVA patterns,
including `config-manager`, `local-auth`, `operation-logger`, `storage-manager`, and
SQLite administration services. These comments are provenance clues, not proof of
the exact source repository, version, copied material, or license compliance.

Before selecting a root license or shipping binaries, the maintainer should:

1. Identify the actual source and revision used for each adapted module.
2. Distinguish copied/adapted code from design inspiration.
3. Preserve required copyright, license and NOTICE material.
4. Choose compatible terms for the project's own code and document them at the root.

This is an outstanding release task; the current documentation does not assert
that every module was independently authored or that all upstream obligations have
already been satisfied.
