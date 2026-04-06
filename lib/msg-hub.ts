// MsgHub — Pub/sub message bus for multi-agent communication
// Inspired by AgentScope's MsgHub pattern
// Agents dynamically join/leave, broadcast messages, subscribe to topics

export interface AgentMessage {
  id: string;
  from: string;        // agent ID
  to: string | null;   // null = broadcast
  topic: string;       // message topic/channel
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export type MessageHandler = (msg: AgentMessage) => void | Promise<void>;

interface Participant {
  name: string;
  handler: MessageHandler;
}

let _nextId = 1;
function genId(): string {
  return `msg_${Date.now()}_${_nextId++}`;
}

export class MsgHub {
  private participants = new Map<string, Participant>();
  private history: AgentMessage[] = [];
  private topicSubs = new Map<string, Set<string>>(); // topic -> agent IDs

  // ── Participant management ──────────────────────────────

  join(agentId: string, name: string, handler: MessageHandler): void {
    this.participants.set(agentId, { name, handler });
  }

  leave(agentId: string): void {
    this.participants.delete(agentId);
    // Remove from all topic subscriptions
    for (const subs of this.topicSubs.values()) {
      subs.delete(agentId);
    }
  }

  getParticipants(): string[] {
    return Array.from(this.participants.keys());
  }

  getParticipantName(agentId: string): string | undefined {
    return this.participants.get(agentId)?.name;
  }

  // ── Messaging ───────────────────────────────────────────

  async send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<void> {
    const msg: AgentMessage = {
      ...partial,
      id: genId(),
      timestamp: Date.now(),
    };
    this.history.push(msg);

    if (msg.to) {
      // Direct message — deliver to single recipient
      const target = this.participants.get(msg.to);
      if (target) await target.handler(msg);
      return;
    }

    // Broadcast — deliver to topic subscribers, or all participants if no topic subs
    const topicSubs = this.topicSubs.get(msg.topic);
    const recipients = topicSubs?.size
      ? Array.from(topicSubs)
      : Array.from(this.participants.keys());

    const promises = recipients
      .filter((id) => id !== msg.from) // don't echo back to sender
      .map((id) => {
        const p = this.participants.get(id);
        return p ? Promise.resolve(p.handler(msg)).catch(() => {}) : null;
      })
      .filter(Boolean);

    await Promise.all(promises);
  }

  async broadcast(from: string, topic: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.send({ from, to: null, topic, content, metadata });
  }

  // ── Topic subscriptions ─────────────────────────────────

  subscribe(agentId: string, topic: string): void {
    let subs = this.topicSubs.get(topic);
    if (!subs) {
      subs = new Set();
      this.topicSubs.set(topic, subs);
    }
    subs.add(agentId);
  }

  unsubscribe(agentId: string, topic: string): void {
    this.topicSubs.get(topic)?.delete(agentId);
  }

  getTopicSubscribers(topic: string): string[] {
    return Array.from(this.topicSubs.get(topic) ?? []);
  }

  // ── History ─────────────────────────────────────────────

  getHistory(topic?: string, limit?: number): AgentMessage[] {
    let msgs = topic
      ? this.history.filter((m) => m.topic === topic)
      : this.history;
    if (limit && limit > 0) {
      msgs = msgs.slice(-limit);
    }
    return msgs;
  }

  /** Get recent messages relevant to an agent (sent to them or broadcast on their topics) */
  getContextWindow(agentId: string, maxMessages = 50): AgentMessage[] {
    const subscribedTopics = new Set<string>();
    for (const [topic, subs] of this.topicSubs) {
      if (subs.has(agentId)) subscribedTopics.add(topic);
    }

    return this.history
      .filter((m) =>
        m.to === agentId ||
        m.from === agentId ||
        (m.to === null && (subscribedTopics.size === 0 || subscribedTopics.has(m.topic)))
      )
      .slice(-maxMessages);
  }

  // ── Cleanup ─────────────────────────────────────────────

  clear(): void {
    this.history = [];
  }

  reset(): void {
    this.participants.clear();
    this.history = [];
    this.topicSubs.clear();
  }
}
