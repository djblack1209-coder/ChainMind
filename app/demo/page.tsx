import type { Metadata } from "next";
import DiscussionDemo from "@/components/demo/DiscussionDemo";

export const metadata: Metadata = {
  title: "ChainMind — Explore a sample discussion",
  description:
    "Walk through a multi-agent decision: frame, review, assign, verify, and deliver. No API key required.",
};

export default function DemoPage() {
  return <DiscussionDemo />;
}
