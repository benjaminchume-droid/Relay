/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Community, CommunityPost } from '../types';
import * as phase1 from '../services/phase1Service';

interface CommunityState {
  communities: Community[];
  activeCommunityId: string | null;
  posts: Record<string, CommunityPost[]>;
  isLoading: boolean;
  error: string | null;

  fetchCommunities: () => Promise<void>;
  setActiveCommunity: (id: string | null) => Promise<void>;
  fetchPosts: (communityId: string) => Promise<void>;
  createCommunity: (payload: {
    name: string;
    handle: string;
    description?: string;
    category?: string;
    bannerUrl?: string;
    avatarUrl?: string;
    isPrivate?: boolean;
  }) => Promise<void>;
  updateCommunityInfo: (id: string, payload: { description?: string; isPrivate?: boolean; permissions?: any; category?: string }) => Promise<void>;
  joinCommunity: (id: string) => Promise<void>;
  leaveCommunity: (id: string) => Promise<void>;
  deleteCommunity: (id: string) => Promise<void>;
  createPost: (communityId: string, payload: { channelId?: string; title?: string; content: string; imageUrl?: string }) => Promise<void>;
  likePost: (communityId: string, postId: string) => Promise<void>;
  addComment: (communityId: string, postId: string, content: string) => Promise<void>;
  clearError: () => void;
}

export const useCommunityStore = create<CommunityState>((set, get) => ({
  communities: [],
  activeCommunityId: null,
  posts: {},
  isLoading: false,
  error: null,

  fetchCommunities: async () => {
    set({ isLoading: true });
    try {
      const communities = await phase1.listCommunities();
      set({ communities, isLoading: false, error: null });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load communities', isLoading: false });
    }
  },

  setActiveCommunity: async (id) => {
    set({ activeCommunityId: id });
    if (id) await get().fetchPosts(id);
  },

  fetchPosts: async (communityId) => {
    try {
      const posts = await phase1.listCommunityThreads(communityId);
      set((state) => ({
        posts: { ...state.posts, [communityId]: posts },
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  createCommunity: async (payload) => {
    set({ isLoading: true });
    try {
      const community = await phase1.createCommunity(payload);
      set((state) => ({
        communities: [community, ...state.communities],
        isLoading: false,
        error: null,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to create community', isLoading: false });
      throw err;
    }
  },

  updateCommunityInfo: async (id, payload) => {
    set((state) => ({
      communities: state.communities.map((c) =>
        c.id === id
          ? {
              ...c,
              description: payload.description ?? c.description,
              isPrivate: payload.isPrivate ?? c.isPrivate,
              category: payload.category ?? c.category,
            }
          : c
      ),
    }));
  },

  joinCommunity: async (id) => {
    try {
      await phase1.joinCommunity(id);
      set((state) => ({
        communities: state.communities.map((c) =>
          c.id === id
            ? { ...c, isJoined: true, memberCount: (c.memberCount || 0) + 1 }
            : c
        ),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to join' });
      throw err;
    }
  },

  leaveCommunity: async (id) => {
    try {
      await phase1.leaveCommunity(id);
      set((state) => ({
        communities: state.communities.map((c) =>
          c.id === id
            ? { ...c, isJoined: false, memberCount: Math.max(0, (c.memberCount || 1) - 1) }
            : c
        ),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to leave' });
      throw err;
    }
  },

  deleteCommunity: async (id) => {
    set((state) => ({
      communities: state.communities.filter((c) => c.id !== id),
      activeCommunityId: state.activeCommunityId === id ? null : state.activeCommunityId,
    }));
  },

  createPost: async (communityId, payload) => {
    try {
      const post = await phase1.createCommunityThread(communityId, payload);
      set((state) => ({
        posts: {
          ...state.posts,
          [communityId]: [post, ...(state.posts[communityId] || [])],
        },
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to post thread' });
      throw err;
    }
  },

  likePost: async (communityId, postId) => {
    set((state) => ({
      posts: {
        ...state.posts,
        [communityId]: (state.posts[communityId] || []).map((p) =>
          p.id === postId
            ? { ...p, isLiked: !p.isLiked, likes: (p.likes || 0) + (p.isLiked ? -1 : 1) }
            : p
        ),
      },
    }));
  },

  addComment: async (communityId, postId, content) => {
    set((state) => ({
      posts: {
        ...state.posts,
        [communityId]: (state.posts[communityId] || []).map((p) =>
          p.id === postId
            ? {
                ...p,
                commentCount: (p.commentCount || 0) + 1,
                comments: [
                  ...(p.comments || []),
                  {
                    id: `local_${Date.now()}`,
                    authorId: 'me',
                    authorName: 'You',
                    content,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : p
        ),
      },
    }));
  },

  clearError: () => set({ error: null }),
}));
