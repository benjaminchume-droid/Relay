/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MessageSquare, Users, Search, User, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { RelayLogoEmblem } from './GlassUI';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { getLetterAvatar } from '../lib/avatar';

export type MainTab = 'chats' | 'communities' | 'explore' | 'profile';

export const MainNavigation: React.FC<{
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  hideBottomNav?: boolean;
  children: React.ReactNode;
}> = ({ activeTab, onSelectTab, hideBottomNav = false, children }) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { currentUser, logout } = useAuthStore();
  const { chats, activeChatId } = useChatStore();

  const totalUnread = chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Automatically hide bottom navigation bar on active chat screen or full-screen routes
  const shouldHideBottomNav = !!activeChatId || hideBottomNav;

  const tabs: Array<{ id: MainTab; label: string; icon: React.FC<{ size?: number; className?: string }>; badge?: number }> = [
    { id: 'chats', label: 'Chats', icon: MessageSquare, badge: totalUnread },
    { id: 'communities', label: 'Communities', icon: Users },
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'profile', label: 'Profile', icon: User }
  ];


  return (
    <div className="w-full h-screen flex flex-row overflow-hidden relative bg-slate-50">
      
      {/* Desktop & Tablet Collapsible Sidebar */}
      {currentUser && (
        <aside 
          className={`hidden md:flex flex-col justify-between glass-sidebar shrink-0 h-screen transition-all duration-300 z-40 relative select-none ${
            sidebarExpanded ? 'w-64 p-5' : 'w-20 p-4'
          }`}
        >
          {/* Top Logo & Toggle */}
          <div className="space-y-6">
            <div className={`flex items-center ${sidebarExpanded ? 'justify-between' : 'justify-center'} px-1`}>
              {sidebarExpanded ? (
                <div className="flex items-center gap-2.5">
                  <RelayLogoEmblem size={28} />
                  <span className="text-sm font-bold tracking-[0.15em] text-slate-800">RELAY</span>
                </div>
              ) : (
                <RelayLogoEmblem size={28} />
              )}

              <button 
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className={`p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer ${
                  !sidebarExpanded ? 'absolute -right-3 top-6 bg-white rounded-full z-50 p-1 shadow-md' : ''
                }`}
              >
                {sidebarExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>

            {/* Sidebar Tabs */}
            <nav className="space-y-2 pt-2">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    style={isActive ? { backgroundColor: 'var(--primary-accent, #2563EB)', color: '#FFFFFF', boxShadow: '0 8px 20px rgba(37, 99, 235, 0.3)' } : {}}
                    className={`w-full py-3 px-4 rounded-2xl flex items-center gap-4 transition-all text-xs cursor-pointer ${
                      isActive 
                        ? 'font-bold' 
                        : 'text-slate-600 hover:bg-white/80 border border-transparent hover:border-slate-200 font-medium'
                    } ${!sidebarExpanded ? 'justify-center' : 'justify-start'}`}
                  >
                    <IconComponent size={18} className={isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'} />
                    {sidebarExpanded && (
                      <span className="truncate flex-1 text-left font-semibold">{tab.label}</span>
                    )}
                    {sidebarExpanded && tab.badge && tab.badge > 0 ? (
                      <span className="bg-white/20 text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-full shadow-xs">
                        {tab.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Profile Details */}
          <div className="space-y-4 border-t border-slate-200/60 pt-4">
            <div className={`flex items-center ${sidebarExpanded ? 'gap-3' : 'justify-center'} px-1`}>
              <img 
                src={currentUser.avatarUrl || getLetterAvatar(currentUser.name || currentUser.username)} 
                alt="avatar" 
                className="w-9 h-9 rounded-full border border-white/80 shadow-sm object-cover"
              />
              {sidebarExpanded && (
                <div className="min-w-0 flex-1 text-left">
                  <h4 className="text-xs font-bold text-slate-800 truncate leading-none mb-1">{currentUser.name}</h4>
                  <span className="text-[10px] text-slate-500 font-mono">@{currentUser.username}</span>
                </div>
              )}
            </div>

            {sidebarExpanded && (
              <button 
                onClick={logout}
                className="w-full py-2 px-3 rounded-xl border border-red-200/80 hover:bg-red-50 text-red-600 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 h-screen overflow-hidden flex flex-col justify-between relative">
        <main className="w-full flex-1 overflow-y-auto relative">
          {children}
        </main>

        {/* Mobile Viewport Flush Edge-to-Edge Navigation Bar */}
        {currentUser && !shouldHideBottomNav && (
          <nav 
            className="md:hidden fixed bottom-0 left-0 right-0 w-full h-16 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-around px-2 z-50 select-none shrink-0 shadow-lg transition-all"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)'
            }}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex flex-col items-center justify-center py-1.5 px-4 rounded-xl cursor-pointer relative transition-all duration-200 ${
                    isActive 
                      ? 'font-bold' 
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium'
                  }`}
                  style={isActive ? { backgroundColor: 'var(--primary-accent, #2563EB)', color: '#FFFFFF' } : {}}
                >
                  <div className="relative flex items-center justify-center">
                    <IconComponent size={20} className={isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'} />
                    {tab.badge && tab.badge > 0 ? (
                      <span 
                        style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                        className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[14px] h-3.5 text-white text-[8px] font-mono font-bold rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-xs"
                      >
                        {tab.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] tracking-tight mt-1">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

    </div>
  );
};
