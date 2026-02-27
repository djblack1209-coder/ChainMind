import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.clearAllMocks();
    vi.resetModules();
    storageGetMock.mockResolvedValue(undefined);
    storageSetMock.mockResolvedValue(undefined);
  });

  it('persists after addMessage', async () => {
    const { useChatStore } = await import('../stores/chat-store');

    useChatStore.setState({
      conversations: [makeConversation()],
      activeConversationId: 'conv-1',
      loaded: true,
    });

    useChatStore.getState().addMessage('conv-1', makeMessage());
    await Promise.resolve();

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
    await Promise.resolve();

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
});
