import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Conversation } from '../lib/types';

const storageGetMock = vi.fn();
const storageSetMock = vi.fn();

vi.mock('../lib/storage', () => ({
  storageGet: storageGetMock,
  storageSet: storageSetMock,
}));

function makeConversation(): Conversation {
  return {
    id: 'conv-1',
    title: '新对话',
    messages: [],
    provider: 'openai',
    model: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('chat-store persistence', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    storageGetMock.mockResolvedValue(undefined);
    storageSetMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function flushPersistenceDebounce() {
    await vi.advanceTimersByTimeAsync(500);
  }

  it('persists after addMessage', async () => {
    const { useChatStore } = await import('../stores/chat-store');

    useChatStore.setState({
      conversations: [makeConversation()],
      activeConversationId: 'conv-1',
      loaded: true,
    });

    useChatStore.getState().addMessage('conv-1', makeMessage());
    await flushPersistenceDebounce();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chat-conversations',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conv-1',
          messages: expect.arrayContaining([
            expect.objectContaining({ id: 'msg-1', content: 'hello' }),
          ]),
        }),
      ])
    );
  });

  it('persists after createConversation', async () => {
    const { useChatStore } = await import('../stores/chat-store');

    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      loaded: true,
    });

    const createdId = useChatStore.getState().createConversation('openai', 'gpt-4o-mini');
    await flushPersistenceDebounce();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chat-conversations',
      expect.arrayContaining([
        expect.objectContaining({
          id: createdId,
          provider: 'openai',
          model: 'gpt-4o-mini',
          title: '新对话',
        }),
      ])
    );
  });

  it('persists after updateMessage', async () => {
    const { useChatStore } = await import('../stores/chat-store');

    useChatStore.setState({
      conversations: [
        {
          ...makeConversation(),
          messages: [makeMessage()],
        },
      ],
      activeConversationId: 'conv-1',
      loaded: true,
    });

    useChatStore.getState().updateMessage('conv-1', 'msg-1', { content: 'updated' });
    await flushPersistenceDebounce();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chat-conversations',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conv-1',
          messages: expect.arrayContaining([
            expect.objectContaining({ id: 'msg-1', content: 'updated' }),
          ]),
        }),
      ])
    );
  });

  it('persists after clearMessages', async () => {
    const { useChatStore } = await import('../stores/chat-store');

    useChatStore.setState({
      conversations: [
        {
          ...makeConversation(),
          title: 'Existing Title',
          messages: [makeMessage()],
        },
      ],
      activeConversationId: 'conv-1',
      loaded: true,
    });

    useChatStore.getState().clearMessages('conv-1');
    await flushPersistenceDebounce();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chat-conversations',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conv-1',
          title: '新对话',
          messages: [],
        }),
      ])
    );
  });

  it('persists after setSystemPrompt', async () => {
    const { useChatStore } = await import('../stores/chat-store');

    useChatStore.setState({
      conversations: [makeConversation()],
      activeConversationId: 'conv-1',
      loaded: true,
    });

    useChatStore.getState().setSystemPrompt('conv-1', 'Be concise');
    await flushPersistenceDebounce();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chat-conversations',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conv-1',
          systemPrompt: 'Be concise',
        }),
      ])
    );
  });
});
