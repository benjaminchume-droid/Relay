/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App shell — URL-driven. Every screen has a real address:
 *   /messaging          chat list
 *   /chat/:chatId       a conversation
 *   /communities        communities + channels
 *   /explore            For you / Stories / People
 *   /profile            settings & customization
 *   /notifications      notification center
 *   /create-community   create community screen
 *   /create-group       create group screen
 *   /search             user search
 * Deep links work after login (the URL survives the auth round-trip).
 */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useThemeStore, applyThemeVars } from './store/themeStore';
import { useChatStore } from './store/chatStore';
import { useUiStore } from './store/uiStore';
import { AmbientLiquidBackground, RelayLogoEmblem, LiquidRefractionDefs } from './components/GlassUI';
import { AuthFlow } from './components/AuthFlow';
import { EmailVerificationPendingScreen } from './components/EmailVerificationPendingScreen';
import { MainNavigation } from './components/Navigation';
import { ChatList } from './components/ChatList';
import { ChatScreen } from './components/ChatScreen';
import { CommunitiesView } from './components/CommunitiesView';
import { ExploreView } from './components/ExploreView';
import { ProfileView } from './components/ProfileView';
import { CreateCommunityScreen } from './components/CreateCommunityScreen';
import { CreateGroupScreen } from './components/CreateGroupScreen';
import { UserSearchScreen } from './components/UserSearchScreen';
import { ModalsOverlay } from './components/Modals';
import { NotificationCenterScreen } from './components/NotificationCenterScreen';
import { useNotificationStore } from './services/notificationService';
import { useRelayRealtime } from './services/realtime/useRelayRealtime';
import { GlobalCallHost } from './components/GlobalCallHost';
import { registerCurrentDevice, tryRegisterNativePush } from './services/deviceService';
import { ensureCacheScope } from './services/cacheScope';
import { presenceService } from './services/presenceService';

function isAuthedStatus(status: string) {
  return status === 'READY' || status === 'AUTHENTICATED';
}

type SubRoute = 'create-community' | 'create-group' | 'explore-search' | 'notifications' | null;

function parsePath(pathname: string): {
  tab: 'chats' | 'communities' | 'explore' | 'profile';
  chatId: string | null;
  sub: SubRoute;
} {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/chat/')) {
    const id = decodeURIComponent(p.slice('/chat/'.length));
    return { tab: 'chats', chatId: id || null, sub: null };
  }
  if (p === '/messaging' || p === '/chats' || p === '/') return { tab: 'chats', chatId: null, sub: null };
  if (p === '/communities') return { tab: 'communities', chatId: null, sub: null };
  if (p === '/explore') return { tab: 'explore', chatId: null, sub: null };
  if (p === '/profile') return { tab: 'profile', chatId: null, sub: null };
  if (p === '/notifications') return { tab: 'chats', chatId: null, sub: 'notifications' };
  if (p === '/create-community') return { tab: 'communities', chatId: null, sub: 'create-community' };
  if (p === '/create-group') return { tab: 'chats', chatId: null, sub: 'create-group' };
  if (p === '/search') return { tab: 'explore', chatId: null, sub: 'explore-search' };
  return { tab: 'chats', chatId: null, sub: null };
}

export const App: React.FC = () => {
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { tab, chatId: activeChatId, sub: activeSubRoute } = parsePath(location.pathname);

  const { status, initializeSession, profile, currentUser, isPasswordResetFlow } = useAuthStore();
  const { customization } = useThemeStore();
  const { setActiveChat } = useChatStore();
  useRelayRealtime();

  // Route changes kill every overlay that lives inside a screen — reset the
  // immersive counter so the bottom nav can never stay hidden after leaving a
  // story/composer via navigation (the "nav bar vanished" bug).
  const resetImmersive = useUiStore((s) => s.resetImmersive);
  useEffect(() => {
    resetImmersive();
  }, [location.pathname, resetImmersive]);

  useEffect(() => {
    initializeSession();
    try {
      const SETTINGS_VERSION = 2;
      const raw = localStorage.getItem('relay_theme_customization');
      const seenVersion = Number(localStorage.getItem('relay_theme_settings_v') || '1');
      if (raw) {
        const parsed = JSON.parse(raw);
        // v2 migration: chat screen defaults to WhatsApp-style Classic bubbles.
        // Retro remains available in Profile → Chat Style — this only resets the
        // one-time state where the early Retro experiment stuck for everyone.
        if (seenVersion < 2) parsed.chatStyle = 'classic';
        useThemeStore.getState().updateCustomization(parsed);
      } else {
        applyThemeVars(customization);
      }
      localStorage.setItem('relay_theme_settings_v', String(SETTINGS_VERSION));
    } catch {
      applyThemeVars(customization);
    }
  }, []);

  // Android Chrome: when the soft keyboard closes, the visual viewport grows
  // back but the page can stay scrolled (residual scrollY) — that pushed the
  // top bar under the URL bar and left the composer floating above the
  // bottom. The shell is exactly 100dvh now so the body can't scroll, and
  // this resets any residual scroll the keyboard round-trip left behind.
  useEffect(() => {
    const resetScroll = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    const vv = (window as any).visualViewport;
    vv?.addEventListener('resize', resetScroll);
    window.addEventListener('focusout', resetScroll);
    return () => {
      vv?.removeEventListener('resize', resetScroll);
      window.removeEventListener('focusout', resetScroll);
    };
  }, []);

  useEffect(() => {
    applyThemeVars(customization);
    try {
      localStorage.setItem('relay_theme_customization', JSON.stringify(customization));
    } catch {}
  }, [customization]);

  useEffect(() => {
    const pid = (profile as any)?.id || (currentUser as any)?.id || (profile as any)?.profile_id;
    if (!isAuthedStatus(status) || !pid) return;
    // Account-scoped caches: if another account used this browser, wipe its
    // locally cached messages/watermarks before anything reads them.
    const scope = ensureCacheScope(pid);
    if (scope.cleared) {
      useChatStore.setState({ messages: {}, chats: [], activeChatId: null });
    }
    let cancelled = false;
    (async () => {
      const res = await registerCurrentDevice(pid);
      if (!cancelled && res.ok) {
        await tryRegisterNativePush(pid);
      }
    })();
    // Signal-level identity (local keys + server prekey bundle) + realtime streams
    void (async () => {
      try {
        const { ensureIdentity } = await import('./services/crypto/cryptoService');
        await ensureIdentity(pid);
      } catch (e) {
        console.warn('[e2ee] identity init failed', e);
      }
    })();
    useChatStore.getState().startGlobalMessageStream();
    useNotificationStore.getState().startStream(pid);
    presenceService.start(pid);
    return () => {
      cancelled = true;
    };
  }, [status, profile, currentUser]);

  useEffect(() => {
    if (isAuthedStatus(status)) return;
    useNotificationStore.getState().reset();
    presenceService.stop();
  }, [status]);

  // keep the chat store's activeChatId mirroring the URL (back/forward safe)
  useEffect(() => {
    setActiveChat(activeChatId);
  }, [activeChatId]);

  // browser back closes modals (routes handle their own back)
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
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showNewChatModal, showCreateCommunityModal]);

  // ---- URL navigation helpers ----
  const openChat = (chatId: string | null) => {
    setActiveChat(chatId);
    if (chatId) navigate(`/chat/${encodeURIComponent(chatId)}`);
    else navigate('/messaging');
  };

  // Notification engine → system-notification click lands back in the conversation
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent).detail?.chatId;
      if (id) openChat(id);
    };
    window.addEventListener('relay:open-chat', open);
    return () => window.removeEventListener('relay:open-chat', open);
  }, []);
  const selectTab = (t: 'chats' | 'communities' | 'explore' | 'profile') => {
    navigate(t === 'chats' ? '/messaging' : `/${t}`);
  };
  const openSub = (sub: Exclude<SubRoute, null>) => navigate(`/${sub}`);
  const closeSub = () => navigate(-1);

  if ((status === 'BOOTSTRAPPING' || status === 'AUTH_LOADING') && !profile && !currentUser) {
    return (
      <div className="min-h-[100dvh] w-full relative flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <AmbientLiquidBackground />
        <div className="flex flex-col items-center gap-4 z-10">
          <RelayLogoEmblem size={56} className="animate-pulse" />
          <span className="text-xs font-bold tracking-[0.2em] text-slate-700 dark:text-slate-200 uppercase">
            Initializing Relay...
          </span>
        </div>
      </div>
    );
  }

  const activeProfile = profile || currentUser;
  const setupFlag =
    typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';
  // Trust the explicit onboarding flag (or the local completion marker) only —
  // username/display_name are auto-seeded by the signup trigger, so presence
  // does NOT mean the user finished setup (this used to flash/skip onboarding).
  const isSetupDone =
    setupFlag ||
    activeProfile?.onboarding_completed === true ||
    activeProfile?.onboardingCompleted === true;

  if (status === 'UNAUTHENTICATED') {
    return (
      <div className="app-h w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" style={{ overscrollBehavior: 'contain' }}>
        <AuthFlow />
      </div>
    );
  }

  if (status === 'EMAIL_UNVERIFIED') {
    return (
      <div className="app-h w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" style={{ overscrollBehavior: 'contain' }}>
        <EmailVerificationPendingScreen />
      </div>
    );
  }

  // Password-recovery handoff: user arrived via the emailed reset link — show
  // the "set new password" screen before anything else.
  if (isPasswordResetFlow && isAuthedStatus(status)) {
    return (
      <div className="app-h w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" style={{ overscrollBehavior: 'contain' }}>
        <AuthFlow />
      </div>
    );
  }

  if (
    (status === 'NEEDS_SETUP' || status === 'ONBOARDING_REQUIRED' || isAuthedStatus(status)) &&
    !isSetupDone &&
    isAuthedStatus(status)
  ) {
    if (setupFlag && !activeProfile) {
      return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <AmbientLiquidBackground />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 z-10">Restoring session…</span>
        </div>
      );
    }
    if (!isSetupDone) {
      return (
        <div className="app-h w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" style={{ overscrollBehavior: 'contain' }}>
          <AuthFlow forceOnboarding />
        </div>
      );
    }
  }

  if (!activeProfile && !setupFlag) {
    return (
      <div className="app-h w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" style={{ overscrollBehavior: 'contain' }}>
        <AuthFlow />
      </div>
    );
  }

  return (
    <div className="app-h w-full relative overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <AmbientLiquidBackground />
      <MainNavigation
        activeTab={tab}
        hideNav={!!activeChatId || !!activeSubRoute}
        pageScroll={!activeChatId}
        onSelectTab={selectTab}
      >
        {activeSubRoute === 'notifications' ? (
          <NotificationCenterScreen
            onBack={closeSub}
            onOpenConversation={(conversationId) => {
              openChat(conversationId);
            }}
          />
        ) : activeSubRoute === 'create-community' ? (
          <CreateCommunityScreen
            onBack={closeSub}
            onSuccess={() => navigate('/communities')}
          />
        ) : activeSubRoute === 'create-group' ? (
          <CreateGroupScreen
            onBack={closeSub}
            onSuccess={(chatId) => {
              openChat(chatId);
            }}
          />
        ) : activeSubRoute === 'explore-search' ? (
          <UserSearchScreen
            onBack={closeSub}
            onSelectChat={(chatId) => {
              openChat(chatId);
            }}
          />
        ) : activeChatId ? (
          /* channel/DM chats take over the whole shell regardless of tab (WhatsApp behavior) */
          <ChatScreen chatId={activeChatId} onBack={() => openChat(null)} />
        ) : tab === 'chats' ? (
          <ChatList
            onSelectChat={(id) => openChat(id)}
            onOpenNewChatModal={() => setShowNewChatModal(true)}
            onOpenNotifications={() => openSub('notifications')}
          />
        ) : tab === 'communities' ? (
          <CommunitiesView
            onOpenCreateCommunityModal={() => openSub('create-community')}
            onCommunityChatStateChange={() => {}}
            onOpenChannelChat={(conversationId) => openChat(conversationId)}
          />
        ) : tab === 'explore' ? (
          <ExploreView
            onSelectChat={(id) => openChat(id)}
            onOpenUserSearch={() => openSub('explore-search')}
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
        onOpenCreateGroup={() => openSub('create-group')}
        onSelectChat={(id) => {
          setShowNewChatModal(false);
          openChat(id);
        }}
      />
    </div>
  );
};

export default App;
