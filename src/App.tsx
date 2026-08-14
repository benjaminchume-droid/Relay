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
import { EmailVerificationPendingScreen } from './components/EmailVerificationPendingScreen';
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

  const { status, initializeSession, isLoadingProfile, profile, currentUser } = useAuthStore();
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

  // Handle browser / system back button navigation stack
  useEffect(() => {
    const handlePopState = () => {
      if (showNewChatModal) {
        setShowNewChatModal(false);
        return;
      }
      if (showCreateCommunityModal) {
        setShowCreateCommunityModal(false);
        return;
      }
      if (activeSubRoute) {
        setActiveSubRoute(null);
        return;
      }
      if (activeChatId) {
        setActiveChat(null);
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showNewChatModal, showCreateCommunityModal, activeSubRoute, activeChatId]);

  const handleSelectChat = (chatId: string | null) => {
    if (chatId) {
      window.history.pushState({ type: 'chat', chatId }, '');
    }
    setActiveChat(chatId);
  };

  // 1. BOOTSTRAPPING Guard (Splash Screen Gate)
  // Keep splash screen locked ONLY during initial cold boot when no local cached profile is available
  if ((status === 'BOOTSTRAPPING' || status === 'AUTH_LOADING') && !profile && !currentUser) {
    return (
      <div className="min-h-screen w-full relative flex flex-col items-center justify-center bg-slate-50">
        <AmbientLiquidBackground />
        <div className="flex flex-col items-center gap-4 z-10">
          <RelayLogoEmblem size={56} className="animate-pulse" />
          <span className="text-xs font-bold tracking-[0.2em] text-slate-700 uppercase">
            Initializing Relay...
          </span>
        </div>
      </div>
    );
  }

  // Active user profile & persistent setup check
  const activeProfile = profile || currentUser;
  const isSetupDone = 
    (typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true') ||
    activeProfile?.onboarding_completed === true || 
    activeProfile?.onboardingCompleted === true;

  // 2. UNAUTHENTICATED Guard -> Route strictly to Create Relay Account / Sign In
  if (status === 'UNAUTHENTICATED' || !activeProfile) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center">
        <AmbientLiquidBackground />
        <AuthFlow onSuccess={() => setActiveTab('chats')} />
      </div>
    );
  }

  // 3. EMAIL_UNVERIFIED Guard -> Route strictly to OTP Verification Screen
  if (status === 'EMAIL_UNVERIFIED') {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center">
        <AmbientLiquidBackground />
        <EmailVerificationPendingScreen />
      </div>
    );
  }

  // 4. NEEDS_SETUP Guard -> Route to Relay Setup Wizard (ONLY for verified authenticated users needing setup)
  if (status === 'NEEDS_SETUP' || status === 'ONBOARDING_REQUIRED' || (!isSetupDone && status !== 'READY')) {
    return (
      <div className="min-h-screen w-full relative flex items-center justify-center">
        <AmbientLiquidBackground />
        <AuthFlow onSuccess={() => setActiveTab('chats')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden text-slate-800 flex flex-col">
      <AmbientLiquidBackground />

      {/* Non-blocking Relay Connection Banner for background socket reconnects */}
      {connectionState !== 'Connected' && (
        <div className="w-full bg-amber-500/10 border-b border-amber-400/20 py-1.5 px-4 text-center text-xs font-semibold text-amber-700 flex items-center justify-center gap-2 select-none shrink-0 relative z-50 backdrop-blur-xs">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>
            {connectionState === 'Connecting' || connectionState === 'Reconnecting' 
              ? 'Reconnecting to Relay...' 
              : 'Relay Offline — Showing local cached messages'}
          </span>
        </div>
      )}

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
              handleSelectChat(chatId);
            }} 
          />
        ) : activeSubRoute === 'explore-search' ? (
          <UserSearchScreen 
            onBack={() => setActiveSubRoute(null)} 
            onSelectChat={(chatId) => {
              setActiveSubRoute(null);
              setActiveTab('chats');
              handleSelectChat(chatId);
            }} 
          />
        ) : activeTab === 'chats' && activeChatId ? (
          <ChatScreen 
            chatId={activeChatId} 
            onBack={() => setActiveChat(null)} 
          />
        ) : activeTab === 'chats' ? (
          <ChatList 
            onSelectChat={(id) => handleSelectChat(id)} 
            onOpenNewChatModal={() => {
              window.history.pushState({ modal: 'new-chat' }, '');
              setShowNewChatModal(true);
            }} 
          />
        ) : activeTab === 'communities' ? (
          <CommunitiesView 
            onOpenCreateCommunityModal={() => {
              window.history.pushState({ route: 'create-community' }, '');
              setActiveSubRoute('create-community');
            }} 
            onCommunityChatStateChange={(isOpen) => setIsCommunityChatOpen(isOpen)}
          />
        ) : activeTab === 'explore' ? (
          <ExploreView 
            onSelectChat={(id) => {
              setActiveTab('chats');
              handleSelectChat(id);
            }} 
            onOpenUserSearch={() => {
              window.history.pushState({ route: 'explore-search' }, '');
              setActiveSubRoute('explore-search');
            }}
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
        onOpenCreateGroup={() => {
          window.history.pushState({ route: 'create-group' }, '');
          setActiveSubRoute('create-group');
        }}
        onSelectChat={(id) => {
          setActiveSubRoute(null);
          setActiveTab('chats');
          handleSelectChat(id);
        }}
      />
    </div>
  );
};

export default App;
