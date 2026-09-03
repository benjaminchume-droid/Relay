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
import { GlobalCallHost } from './components/GlobalCallHost';
import { registerCurrentDevice, tryRegisterNativePush } from './services/deviceService';

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

  // Phase 5: register device + optional native push when authenticated
  useEffect(() => {
    const pid = (profile as any)?.id || (currentUser as any)?.id || (profile as any)?.profile_id;
    if (status !== 'AUTHENTICATED' || !pid) return;
    let cancelled = false;
    (async () => {
      const res = await registerCurrentDevice(pid);
      if (!cancelled && res.ok) {
        await tryRegisterNativePush(pid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, profile, currentUser]);

  useEffect(() => {
    applyThemeVars(customization);
  }, [customization]);

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

  const activeProfile = profile || currentUser;
  const isSetupDone =
    (typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true') ||
    activeProfile?.onboarding_completed === true ||
    activeProfile?.onboardingCompleted === true;

  if (status === 'UNAUTHENTICATED' || !activeProfile) {
    return <AuthFlow />;
  }

  if (status === 'EMAIL_UNVERIFIED') {
    return <EmailVerificationPendingScreen />;
  }

  if (!isSetupDone && status === 'AUTHENTICATED') {
    return <AuthFlow forceOnboarding />;
  }

  return (
    <div className="min-h-screen w-full relative bg-slate-50 text-slate-900">
      <AmbientLiquidBackground />
      <MainNavigation
        activeTab={activeTab}
        hideNav={!!activeChatId || isCommunityChatOpen || !!activeSubRoute}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'chats') setActiveChat(null);
          if (tab !== 'communities') setIsCommunityChatOpen(false);
        }}
      >
        {activeSubRoute === 'create-community' ? (
          <CreateCommunityScreen
            onBack={() => setActiveSubRoute(null)}
            onSuccess={() => setActiveSubRoute(null)}
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
          <ChatScreen chatId={activeChatId} onBack={() => setActiveChat(null)} />
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

      <GlobalCallHost />

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
