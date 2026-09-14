import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// A small, redacted guard for common credential formats. This is not a full audit.
const patterns = [
  /\bsk-[A-Za-z0-9_-]{24,}/,
  /\bAIza[A-Za-z0-9_-]{30,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const paths = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const failures = [];
for (const path of paths) {
  if (!existsSync(path)) continue;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue; // Binary assets.
  bytes
    .toString("utf8")
    .split("\n")
    .forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line)))
        failures.push(`${path}:${index + 1}`);
    });
}
if (failures.length) {
  console.error(
    `Potential credentials found (values redacted):\n${failures.join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Credential pattern check passed across ${paths.length} tracked/unignored files. Git history is not scanned.`,
  );
}
