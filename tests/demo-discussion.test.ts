import { describe, expect, it } from "vitest";
import {
  DEMO_STAGES,
  demoContent,
  exportDemoMarkdown,
} from "../lib/demo-discussion";

describe("sample discussion decisions and export", () => {
  it.each(["en", "zh"] as const)(
    "keeps the selected plan consistent through review, assignment and delivery (%s)",
    (language) => {
      for (let step = 1; step < DEMO_STAGES.length; step++) {
        expect(demoContent(step, "cloud", language)).not.toBe(
          demoContent(step, "local", language),
        );
      }
      expect(demoContent(0, "cloud", language)).toBe(
        demoContent(0, "local", language),
      );
    },
  );

  it.each(["en", "zh"] as const)(
    "exports all stages and the sample disclosure (%s)",
    (language) => {
      const report = exportDemoMarkdown("cloud", language);
      expect(report).toContain("No live AI inference");
      for (const stage of DEMO_STAGES)
        expect(report).toContain(`## ${stage[language]}`);
      expect(report).toContain(demoContent(4, "cloud", language));
      expect(report).not.toContain(demoContent(4, "local", language));
    },
  );
});
