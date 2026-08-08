/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useThemeStore, applyThemeVars } from './store/themeStore';
import { useChatStore } from './store/chatStore';
import { AmbientLiquidBackground, RelayLogoEmblem } from './components/GlassUI';
import { AuthFlow } from './components/AuthFlow';
import { MainNavigation, MainTab } from './components/Navigation';
import { ChatList } from './components/ChatList';
import { ChatScreen } from './components/ChatScreen';
import { CommunitiesView } from './components/CommunitiesView';
import { ExploreView } from './components/ExploreView';
import { ProfileView } from './components/ProfileView';
import { StatusScreen } from './components/StatusScreen';
import { CreateCommunityScreen } from './components/CreateCommunityScreen';
import { CreateGroupScreen } from './components/CreateGroupScreen';
import { UserSearchScreen } from './components/UserSearchScreen';
import { ModalsOverlay } from './components/Modals';
import { useRelayRealtime } from './services/realtime/useRelayRealtime';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>('chats');
  const [activeSubRoute, setActiveSubRoute] = useState<'create-community' | 'create-group' | 'explore-search' | null>(null);
  const [isCommunityChatOpen, setIsCommunityChatOpen] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);

  const { isAuthenticated, isLoading, initializeSession } = useAuthStore();
  const { customization } = useThemeStore();
  const { activeChatId, setActiveChat } = useChatStore();
  const { connectionState } = useRelayRealtime();

  useEffect(() => {
    initializeSession();
    applyThemeVars(customization);
  }, []);

  useEffect(() => {
    applyThemeVars(customization);
  }, [customization]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full relative flex flex-col items-center justify-center bg-slate-50">
        <AmbientLiquidBackground />
        <div className="flex flex-col items-center gap-4 z-10">
          <RelayLogoEmblem size={56} className="animate-pulse" />
          <span className="text-xs font-bold tracking-[0.2em] text-slate-700 uppercase">
            Initializing Session...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center">
        <AmbientLiquidBackground />
        <AuthFlow onSuccess={() => setActiveTab('chats')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden text-slate-800">
      <AmbientLiquidBackground />

      <MainNavigation 
        activeTab={activeTab} 
        hideBottomNav={!!activeSubRoute || (activeTab === 'communities' && isCommunityChatOpen)}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setActiveSubRoute(null);
          if (tab !== 'chats') setActiveChat(null);
          if (tab !== 'communities') setIsCommunityChatOpen(false);
        }}
      >
        {activeSubRoute === 'create-community' ? (
          <CreateCommunityScreen 
            onBack={() => setActiveSubRoute(null)} 
            onSuccess={() => {
              setActiveSubRoute(null);
              setActiveTab('communities');
            }} 
          />
        ) : activeSubRoute === 'create-group' ? (
          <CreateGroupScreen 
            onBack={() => setActiveSubRoute(null)} 
            onSuccess={(chatId) => {
              setActiveSubRoute(null);
              setActiveTab('chats');
              setActiveChat(chatId);
            }} 
          />
        ) : activeSubRoute === 'explore-search' ? (
          <UserSearchScreen 
            onBack={() => setActiveSubRoute(null)} 
            onSelectChat={(chatId) => {
              setActiveSubRoute(null);
              setActiveTab('chats');
              setActiveChat(chatId);
            }} 
          />
        ) : activeTab === 'chats' && activeChatId ? (
          <ChatScreen 
            chatId={activeChatId} 
            onBack={() => setActiveChat(null)} 
          />
        ) : activeTab === 'chats' ? (
          <ChatList 
            onSelectChat={(id) => setActiveChat(id)} 
            onOpenNewChatModal={() => setShowNewChatModal(true)} 
          />
        ) : activeTab === 'communities' ? (
          <CommunitiesView 
            onOpenCreateCommunityModal={() => setActiveSubRoute('create-community')} 
            onCommunityChatStateChange={(isOpen) => setIsCommunityChatOpen(isOpen)}
          />
        ) : activeTab === 'explore' ? (
          <ExploreView 
            onSelectChat={(id) => {
              setActiveTab('chats');
              setActiveChat(id);
            }} 
            onOpenUserSearch={() => setActiveSubRoute('explore-search')}
          />
        ) : (
          <ProfileView />
        )}
      </MainNavigation>

      {/* Global Modals */}
      <ModalsOverlay 
        showNewChatModal={showNewChatModal}
        onCloseNewChatModal={() => setShowNewChatModal(false)}
        showCreateCommunityModal={showCreateCommunityModal}
        onCloseCreateCommunityModal={() => setShowCreateCommunityModal(false)}
        onOpenCreateGroup={() => setActiveSubRoute('create-group')}
        onSelectChat={(id) => {
          setActiveTab('chats');
          setActiveChat(id);
        }}
      />
    </div>
  );
};

export default App;
