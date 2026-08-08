/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Community, CommunityPost } from '../types';
import { apiService } from '../services/apiService';

interface CommunityState {
  communities: Community[];
  activeCommunityId: string | null;
  posts: Record<string, CommunityPost[]>; // communityId -> posts
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
      const { communities } = await apiService.getCommunities();
      set({ communities, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setActiveCommunity: async (id) => {
    set({ activeCommunityId: id });
    if (id) {
      await get().fetchPosts(id);
    }
  },

  fetchPosts: async (communityId) => {
    try {
      const { posts } = await apiService.getCommunityPosts(communityId);
      set((state) => ({
        posts: {
          ...state.posts,
          [communityId]: posts
        }
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  createCommunity: async (payload) => {
    set({ isLoading: true });
    try {
      const { community } = await apiService.createCommunity(payload);
      set((state) => ({
        communities: [community, ...state.communities],
        activeCommunityId: community.id,
        isLoading: false
      }));
      await get().fetchPosts(community.id);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  joinCommunity: async (id) => {
    try {
      const { community } = await apiService.joinCommunity(id);
      set((state) => ({
        communities: state.communities.map((c) => (c.id === id ? community : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  leaveCommunity: async (id) => {
    try {
      const { community } = await apiService.leaveCommunity(id);
      set((state) => ({
        communities: state.communities.map((c) => (c.id === id ? community : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteCommunity: async (id) => {
    try {
      await apiService.deleteCommunity(id);
      set((state) => ({
        communities: state.communities.filter((c) => c.id !== id),
        activeCommunityId: state.activeCommunityId === id ? null : state.activeCommunityId
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  createPost: async (communityId, payload) => {
    try {
      const { post } = await apiService.createCommunityPost(communityId, payload);
      set((state) => {
        const existing = state.posts[communityId] || [];
        return {
          posts: {
            ...state.posts,
            [communityId]: [post, ...existing]
          }
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  likePost: async (communityId, postId) => {
    try {
      const { likesCount, isLiked } = await apiService.likeCommunityPost(postId);
      set((state) => {
        const commPosts = state.posts[communityId] || [];
        return {
          posts: {
            ...state.posts,
            [communityId]: commPosts.map((p) => (p.id === postId ? { ...p, likesCount, isLiked } : p))
          }
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  addComment: async (communityId, postId, content) => {
    try {
      const { comment, commentsCount } = await apiService.addPostComment(postId, content);
      set((state) => {
        const commPosts = state.posts[communityId] || [];
        return {
          posts: {
            ...state.posts,
            [communityId]: commPosts.map((p) => {
              if (p.id === postId) {
                const existingComments = p.comments || [];
                return {
                  ...p,
                  commentsCount,
                  comments: [...existingComments, comment]
                };
              }
              return p;
            })
          }
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateCommunityInfo: async (id, payload) => {
    try {
      const { community } = await apiService.updateCommunityInfo(id, payload);
      set((state) => ({
        communities: state.communities.map((c) => (c.id === id ? { ...c, ...community } : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  clearError: () => set({ error: null })
}));
