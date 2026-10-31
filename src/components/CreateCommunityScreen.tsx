/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, Upload, Check, Shield, Lock, Globe, QrCode, Sparkles, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from './GlassUI';
import { useCommunityStore } from '../store/communityStore';
import { supabase } from '../lib/supabase/client';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

/** Downscale an image file in-browser and return a JPEG data URL (keeps RPC payloads small). */
async function compressImage(file: File, maxDim: number, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Upload a compressed image to the public avatars bucket and return a durable URL. */
async function uploadToStorage(base64: string, uid: string, kind: string): Promise<string> {
  const binary = atob(base64.includes(',') ? base64.split(',')[1] : base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `${uid}/${kind}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return pub?.publicUrl || '';
}

export const CreateCommunityScreen: React.FC<{
  onBack: () => void;
  onSuccess: (communityId: string) => void;
}> = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Step 1
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Technology');

  // Step 2
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [bannerUrl, setBannerUrl] = useState<string>('');

  const generateInitialAvatar = (compName: string) => {
    const colors = ['#2563EB', '#7C3AED', '#059669', '#E11D48', '#D97706', '#0891B2'];
    const char = (compName.trim()[0] || 'C').toUpperCase();
    const color = colors[compName.length % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="90" font-weight="bold" fill="#ffffff">${char}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      e.target.value = '';
      compressImage(file, 512, 0.85).then((d) => setAvatarUrl(d)).catch(() => {});
    }
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      e.target.value = '';
      compressImage(file, 1280, 0.8).then((d) => setBannerUrl(d)).catch(() => {});
    }
  };

  // Step 3
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'invite'>('public');

  const { createCommunity, isLoading, error: communityError } = useCommunityStore();
  const [createError, setCreateError] = useState<string | null>(null);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep((step + 1) as any);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || isLoading) return;
    setCreateError(null);
    const cleanHandle = handle.trim() ? handle.replace(/^@+/, '') : name.toLowerCase().replace(/\s+/g, '-');
    try {
      // Durable, small URLs instead of megabyte data-URIs (which break the RPC).
      let finalAvatar = getLetterAvatar(name);
      if (avatarUrl) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) finalAvatar = await uploadToStorage(avatarUrl, user.id, 'community_avatar');
        else finalAvatar = avatarUrl;
      }
      let finalBanner: string | undefined;
      if (bannerUrl) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) finalBanner = await uploadToStorage(bannerUrl, user.id, 'community_banner');
        else finalBanner = bannerUrl;
      }
      await createCommunity({
        name: name.trim(),
        handle: cleanHandle,
        description,
        category,
        avatarUrl: finalAvatar,
        bannerUrl: finalBanner,
        isPrivate: privacy !== 'public',
      });
      onSuccess(cleanHandle);
    } catch (err: any) {
      setCreateError(err?.message || 'Could not create the community. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-6 space-y-6 text-left pb-28">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <button 
          onClick={step > 1 ? () => setStep((step - 1) as any) : onBack}
          className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all dark:bg-slate-900"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create Community</h1>
          <p className="text-xs text-slate-500 font-medium">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress Indicator Bar */}
      <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
        <div 
          className="bg-[var(--primary-accent)] h-full transition-all duration-300 rounded-full"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <form onSubmit={handleNextStep} className="space-y-4">
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 dark:text-slate-100">
              <Sparkles size={16} className="text-[var(--primary-accent)]" />
              <span>Community Information</span>
            </h2>

            <GlassInput 
              label="Community Name"
              placeholder="e.g. Design Enthusiasts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <GlassInput 
              label="Community Handle / Slug"
              placeholder="design-hub"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            {handle && (
              <span className="text-[11px] text-slate-500 font-mono pl-1 block">
                Handle: {formatHandle(handle)}
              </span>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Description</label>
              <textarea 
                placeholder="What is this community about? Share guidelines or goals..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-2xl glass-input text-xs text-slate-800 font-medium focus:outline-none dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full py-2.5 px-3 rounded-2xl glass-input text-xs text-slate-800 font-semibold focus:outline-none bg-white/80 dark:bg-slate-900/80"
              >
                <option value="Technology">Technology & Software</option>
                <option value="Design">Design & Art</option>
                <option value="Gaming">Gaming & Esports</option>
                <option value="Education">Education & Learning</option>
                <option value="General">General Discussion</option>
              </select>
            </div>
          </GlassCard>

          <div className="flex justify-end gap-2">
            <GlassButton onClick={onBack} variant="secondary" className="py-2.5 px-5 text-xs">
              Cancel
            </GlassButton>
            <GlassButton type="submit" variant="primary" disabled={!name.trim()} className="py-2.5 px-6 text-xs">
              Continue to Visuals
            </GlassButton>
          </div>
        </form>
      )}

      {/* Step 2: Visual Branding */}
      {step === 2 && (
        <div className="space-y-4">
          <GlassCard className="p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 dark:text-slate-100">
              <ImageIcon size={16} className="text-purple-500" />
              <span>Avatar & Banner Customization</span>
            </h2>

            {/* Banner Preview & Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase px-1 block">Cover Banner (Optional)</label>
              <div className="h-28 w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative bg-slate-100 flex items-center justify-center dark:bg-slate-800">
                {bannerUrl ? (
                  <img src={bannerUrl} alt="banner preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400 font-medium">No banner uploaded (Default layout)</span>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[var(--primary-accent)] hover:bg-[var(--relay-accent-hover)] text-white font-bold text-xs cursor-pointer shadow-xs transition-all">
                  <Upload size={14} /> Upload Banner from Gallery
                  <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
                </label>
                {bannerUrl && (
                  <button type="button" onClick={() => setBannerUrl('')} className="text-xs text-red-600 font-semibold hover:underline">
                    Clear Banner
                  </button>
                )}
              </div>
            </div>

            {/* Avatar Preview & Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase px-1 block">Community Avatar</label>
              <div className="flex items-center gap-4 p-3 bg-slate-50/80 rounded-2xl border border-slate-200 dark:bg-black">
                <img 
                  src={avatarUrl || generateInitialAvatar(name)} 
                  alt="avatar preview" 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-md shrink-0 dark:border-white/10" 
                />
                <div className="space-y-1 text-left">
                  <p className="text-xs font-semibold text-slate-700">Select profile picture from gallery or leave blank for a random color avatar.</p>
                  <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-all">
                    <ImageIcon size={14} /> Choose Avatar from Gallery
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                  {avatarUrl && (
                    <button type="button" onClick={() => setAvatarUrl('')} className="block text-xs text-red-600 font-semibold hover:underline">
                      Use Random Color Avatar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          <div className="flex justify-between">
            <GlassButton onClick={() => setStep(1)} variant="secondary" className="py-2.5 px-5 text-xs">
              Back
            </GlassButton>
            <GlassButton onClick={() => setStep(3)} variant="primary" className="py-2.5 px-6 text-xs">
              Continue to Privacy
            </GlassButton>
          </div>
        </div>
      )}

      {/* Step 3: Access & Privacy Controls */}
      {step === 3 && (
        <div className="space-y-4">
          <GlassCard className="p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 dark:text-slate-100">
              <Shield size={16} className="text-emerald-500" />
              <span>Access & Privacy Controls</span>
            </h2>

            <div className="space-y-3">
              {[
                { 
                  id: 'public', 
                  title: 'Public Community', 
                  desc: 'Anyone can search for this community and join the discussions.', 
                  icon: Globe 
                },
                { 
                  id: 'private', 
                  title: 'Private (Approval Required)', 
                  desc: 'Members must apply or receive an invite link to join.', 
                  icon: Lock 
                },
                { 
                  id: 'invite', 
                  title: 'Invite / QR Code Only', 
                  desc: 'Exclusive community accessible via generated QR code or direct link.', 
                  icon: QrCode 
                }
              ].map((opt) => {
                const IconComp = opt.icon;
                const isSelected = privacy === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setPrivacy(opt.id as any)}
                    className={`p-4 rounded-2xl border flex items-start gap-3.5 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-[color-mix(in_srgb,var(--primary-accent)_9%,transparent)]/80 border-[var(--primary-accent)]/80 shadow-sm' 
                        : 'bg-white/70 border-slate-200/80 hover:bg-white'
                    }`}
                  >
                    <div className={`p-2 rounded-xl mt-0.5 ${isSelected ? 'bg-[var(--primary-accent)] text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <IconComp size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">{opt.title}</h4>
                        {isSelected && <Check size={16} className="text-[var(--primary-accent)] font-bold" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed">{opt.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Generated Invite Preview */}
            <div className="p-3 bg-slate-100/80 rounded-2xl border border-slate-200/60 text-xs flex items-center justify-between dark:bg-slate-800">
              <span className="text-[11px] text-slate-500 font-mono">relay.app/c/{handle || 'community'}</span>
              <span className="text-[10px] bg-white px-2 py-0.5 rounded-lg border border-slate-200 font-bold text-slate-700 dark:bg-slate-900">Auto-Generated</span>
            </div>
          </GlassCard>

          <div className="flex justify-between">
            <GlassButton onClick={() => setStep(2)} variant="secondary" className="py-2.5 px-5 text-xs">
              Back
            </GlassButton>
            <GlassButton onClick={handleCreate} variant="primary" disabled={isLoading} className="py-2.5 px-6 text-xs font-bold">
              {isLoading ? 'Creating…' : 'Publish & Launch Community'}
            </GlassButton>
          </div>

          {(createError || communityError) && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-400/30 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{createError || communityError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
