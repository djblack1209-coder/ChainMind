// Chain Discussion store: manages multi-agent chain discussions

import { create } from 'zustand';
import type { ChainAgent, ChainTurn, ChainDiscussion, ChainExecutionMode, ChainAdaptiveProfile } from '@/lib/types';
import { storageGet, storageSet } from '@/lib/storage';
import { debounce } from 'lodash-es';

const STORAGE_KEY = 'chain-discussions';
const META_KEY = 'chain-discussions-meta';

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyAdaptiveProfile(): ChainAdaptiveProfile {
  return {
    count: 0,
    intakeAvg: 0,
    reviewAvg: 0,
    deliveryAvg: 0,
    notes: [],
  };
}

// Debounced persistence — prevents hundreds of writes during streaming
const debouncedChainSave = debounce(async (discussions: ChainDiscussion[], profile: ChainAdaptiveProfile) => {
  await Promise.all([
    storageSet(STORAGE_KEY, discussions),
    storageSet(META_KEY, { globalAdaptiveProfile: profile }),
  ]);
}, 500, { maxWait: 2000 });

interface ChainState {
  discussions: ChainDiscussion[];
  activeDiscussionId: string | null;
  globalAdaptiveProfile: ChainAdaptiveProfile;
  loaded: boolean;

  loadDiscussions: () => Promise<void>;
  createDiscussion: (title: string, topic: string, agents: ChainAgent[], rounds: number, mode: ChainExecutionMode) => string;
  deleteDiscussion: (id: string) => Promise<void>;
  setActiveDiscussion: (id: string) => void;
  addTurn: (discId: string, turn: ChainTurn) => void;
  updateTurn: (discId: string, turnId: string, partial: Partial<ChainTurn>) => void;
  setDiscussionStatus: (discId: string, status: ChainDiscussion['status']) => void;
  setCurrentRound: (discId: string, round: number) => void;
  updateAgents: (discId: string, agents: ChainAgent[]) => void;
  updateDiscussion: (discId: string, partial: Partial<ChainDiscussion>) => void;
  setGlobalAdaptiveProfile: (profile: ChainAdaptiveProfile) => void;
  saveDiscussions: () => Promise<void>;
}

export const useChainStore = create<ChainState>()((set, get) => ({
  discussions: [],
  activeDiscussionId: null,
  globalAdaptiveProfile: createEmptyAdaptiveProfile(),
  loaded: false,

  loadDiscussions: async () => {
    try {
      const stored = await storageGet<ChainDiscussion[]>(STORAGE_KEY);
      const meta = await storageGet<{ globalAdaptiveProfile?: ChainAdaptiveProfile }>(META_KEY);
      const globalAdaptiveProfile = meta?.globalAdaptiveProfile || createEmptyAdaptiveProfile();
      if (stored && stored.length > 0) {
        set({
          discussions: stored.map((disc) => ({
            ...disc,
            workflow: disc.workflow || 'guided-collaboration',
            stage: disc.stage || 'intake',
            pendingAction: disc.pendingAction || null,
            planOptions: disc.planOptions || [],
            selectedPlanIndex: disc.selectedPlanIndex ?? null,
            selectedPlanSummary: disc.selectedPlanSummary || '',
            teamAssignments: disc.teamAssignments || [],
            ratingHistory: disc.ratingHistory || [],
            adaptiveProfile: disc.adaptiveProfile || globalAdaptiveProfile,
          })),
          activeDiscussionId: stored[0].id,
          globalAdaptiveProfile,
          loaded: true,
        });
      } else {
        set({ globalAdaptiveProfile, loaded: true });
      }
    } catch {
      set({ globalAdaptiveProfile: createEmptyAdaptiveProfile(), loaded: true });
    }
  },

  createDiscussion: (title, topic, agents, rounds, mode) => {
    const id = genId('chain');
    const disc: ChainDiscussion = {
      id,
      title,
      topic,
      agents,
      turns: [],
      rounds,
      totalRounds: rounds,
      currentRound: 0,
      mode,
      status: 'idle',
      workflow: 'guided-collaboration',
      stage: 'intake',
      pendingAction: null,
      planOptions: [],
      selectedPlanIndex: null,
      selectedPlanSummary: '',
      teamAssignments: [],
      ratingHistory: [],
      adaptiveProfile: get().globalAdaptiveProfile,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      discussions: [disc, ...s.discussions],
      activeDiscussionId: id,
    }));
    get().saveDiscussions();
    return id;
  },

  deleteDiscussion: async (id) => {
    const discs = get().discussions.filter((d) => d.id !== id);
    const activeId = get().activeDiscussionId === id
      ? (discs[0]?.id || null)
      : get().activeDiscussionId;
    set({ discussions: discs, activeDiscussionId: activeId });
    await storageSet(STORAGE_KEY, discs);
  },

  setActiveDiscussion: (id) => set({ activeDiscussionId: id }),

  addTurn: (discId, turn) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId
          ? { ...d, turns: [...d.turns, turn], updatedAt: Date.now() }
          : d
      ),
    }));
    get().saveDiscussions();
  },

  updateTurn: (discId, turnId, partial) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId
          ? {
              ...d,
              turns: d.turns.map((t) => t.id === turnId ? { ...t, ...partial } : t),
              updatedAt: Date.now(),
            }
          : d
      ),
    }));
    get().saveDiscussions();
  },

  setDiscussionStatus: (discId, status) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, status, updatedAt: Date.now() } : d
      ),
    }));
    get().saveDiscussions();
  },

  setCurrentRound: (discId, round) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, currentRound: round, updatedAt: Date.now() } : d
      ),
    }));
    get().saveDiscussions();
  },

  updateAgents: (discId, agents) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, agents, updatedAt: Date.now() } : d
      ),
    }));
    get().saveDiscussions();
  },

  updateDiscussion: (discId, partial) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, ...partial, updatedAt: Date.now() } : d
      ),
    }));
    get().saveDiscussions();
  },

  setGlobalAdaptiveProfile: (profile) => {
    set({ globalAdaptiveProfile: profile });
    storageSet(META_KEY, { globalAdaptiveProfile: profile }).catch(() => {});
  },

  saveDiscussions: async () => {
    debouncedChainSave(get().discussions, get().globalAdaptiveProfile);
  },
}));
