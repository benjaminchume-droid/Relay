/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { KeyRound, RefreshCw, LogOut, ShieldAlert, ArrowRight } from 'lucide-react';
import { GlassCard, GlassButton, RelayLogoEmblem } from './GlassUI';
import { useAuthStore } from '../store/authStore';

export const EmailVerificationPendingScreen: React.FC = () => {
  const { 
    unverifiedEmail, signupDraft, resendVerificationEmail, verifyOtp,
    logout, resendCooldown, isLoading, error, clearError 
  } = useAuthStore();

  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const displayEmail = unverifiedEmail || signupDraft.email || 'your email address';

  const handleOtpDigitChange = (index: number, value: string) => {
    const cleanValue = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanValue;
    setOtpDigits(newDigits);

    if (cleanValue && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = pasted.split('');
    const newDigits = [...otpDigits];
    digits.forEach((char, idx) => {
      if (idx < 6) newDigits[idx] = char;
    });
    setOtpDigits(newDigits);
    const nextIdx = Math.min(digits.length, 5);
    otpInputRefs.current[nextIdx]?.focus();
  };

  const handleVerify = async () => {
    clearError();
    setSuccessMsg(null);
    const code = otpDigits.join('');
    if (code.length !== 6) return;
    const ok = await verifyOtp(code);
    if (ok) {
      setSuccessMsg("Email verified successfully!");
    }
  };

  const handleResend = async () => {
    clearError();
    setSuccessMsg(null);
    const ok = await resendVerificationEmail(displayEmail);
    if (ok) {
      setSuccessMsg(`A new 6-digit verification code has been sent to ${displayEmail}.`);
    }
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
          <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-400/20 shadow-inner">
            <KeyRound size={32} />
          </div>

          <h2 className="text-xl font-bold text-slate-800">Enter Verification Code</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
            We've sent a 6-digit code to <strong className="text-slate-800 font-semibold">{displayEmail}</strong>.
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Enter the 6-digit OTP code below to confirm your email address and continue setup.
          </p>
        </div>

        {/* 6-Digit Box Inputs */}
        <div className="flex justify-center gap-1.5 sm:gap-2 py-2">
          {otpDigits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { otpInputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleOtpKeyDown(index, e)}
              onPaste={index === 0 ? handleOtpPaste : undefined}
              className="w-10 sm:w-11 h-12 sm:h-13 text-center text-lg sm:text-xl font-bold font-mono bg-white/80 border border-slate-300/80 rounded-2xl shadow-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              autoFocus={index === 0}
            />
          ))}
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
            onClick={handleVerify}
            disabled={isLoading || otpDigits.join('').length !== 6}
            variant="primary"
            className="w-full py-3 text-xs font-bold flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <RefreshCw className="animate-spin mx-auto" size={16} />
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>Verify OTP Code</span>
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
              <span>Resend Code in {resendCooldown}s</span>
            ) : isLoading ? (
              <RefreshCw className="animate-spin mx-auto" size={16} />
            ) : (
              <span>Resend Verification Code</span>
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
