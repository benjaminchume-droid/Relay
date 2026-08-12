/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MailCheck, RefreshCw, LogOut, ShieldAlert, ArrowRight } from 'lucide-react';
import { GlassCard, GlassButton, RelayLogoEmblem } from './GlassUI';
import { useAuthStore } from '../store/authStore';

export const EmailVerificationPendingScreen: React.FC = () => {
  const { 
    unverifiedEmail, signupDraft, resendVerificationEmail, 
    logout, initializeSession, resendCooldown, isLoading, error, clearError 
  } = useAuthStore();

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const displayEmail = unverifiedEmail || signupDraft.email || 'your email address';

  const handleResend = async () => {
    clearError();
    setSuccessMsg(null);
    const ok = await resendVerificationEmail(displayEmail);
    if (ok) {
      setSuccessMsg(`A new 6-digit verification code has been sent to ${displayEmail}.`);
    }
  };

  const handleCheckStatus = async () => {
    clearError();
    setSuccessMsg(null);
    setIsCheckingStatus(true);
    await initializeSession();
    setIsCheckingStatus(false);
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center min-h-[85vh] py-6 z-10 text-left">
      <GlassCard heavy className="w-full p-6 sm:p-8 text-center space-y-6 shadow-2xl border-white/60 relative overflow-hidden">
        
        {/* Header Emblem */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <RelayLogoEmblem size={52} />
          <div className="flex items-center gap-1.5 bg-amber-500/10 backdrop-blur-md px-3 py-1 rounded-full border border-amber-400/20">
            <ShieldAlert size={13} className="text-amber-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Email Verification Required</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-400/20 shadow-inner">
            <MailCheck size={32} />
          </div>

          <h2 className="text-xl font-bold text-slate-800">Email Verification Pending</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
            We've sent a verification email to <strong className="text-slate-800 font-semibold">{displayEmail}</strong>.
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Please verify your email address to unlock Relay onboarding, community feeds, and direct messaging.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-400/30 text-red-600 text-xs rounded-2xl text-left font-medium leading-relaxed">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-400/30 text-emerald-700 text-xs rounded-2xl text-left font-medium leading-relaxed">
            {successMsg}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <GlassButton 
            onClick={handleCheckStatus}
            disabled={isCheckingStatus || isLoading}
            variant="primary"
            className="w-full py-3 text-xs font-bold flex items-center justify-center gap-2"
          >
            {isCheckingStatus ? (
              <RefreshCw className="animate-spin mx-auto" size={16} />
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>I've Verified My Email</span>
                <ArrowRight size={16} />
              </div>
            )}
          </GlassButton>

          <GlassButton 
            onClick={handleResend}
            disabled={isLoading || resendCooldown > 0}
            variant="secondary"
            className="w-full py-2.5 text-xs font-semibold cursor-pointer"
          >
            {resendCooldown > 0 ? (
              <span>Resend Email in {resendCooldown}s</span>
            ) : isLoading ? (
              <RefreshCw className="animate-spin mx-auto" size={16} />
            ) : (
              <span>Resend Verification Email</span>
            )}
          </GlassButton>

          <button 
            type="button"
            onClick={logout}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-1.5 mx-auto pt-2 cursor-pointer transition-colors"
          >
            <LogOut size={14} />
            <span>Sign Out / Use Different Account</span>
          </button>
        </div>

      </GlassCard>
    </div>
  );
};
