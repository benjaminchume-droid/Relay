/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, Upload, Check, Shield, Lock, Globe, QrCode, Sparkles, Image as ImageIcon } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from './GlassUI';
import { useCommunityStore } from '../store/communityStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

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
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) setAvatarUrl(evt.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) setBannerUrl(evt.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 3
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'invite'>('public');

  const { createCommunity, isLoading } = useCommunityStore();

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep((step + 1) as any);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    const cleanHandle = handle.trim() ? handle.replace(/^@+/, '') : name.toLowerCase().replace(/\s+/g, '-');
    const finalAvatar = avatarUrl || getLetterAvatar(name);
    
    await createCommunity({
      name,
      handle: cleanHandle,
      description,
      category,
      avatarUrl: finalAvatar,
      bannerUrl: bannerUrl || undefined
    });
    
    onSuccess(cleanHandle);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-6 space-y-6 text-left pb-28">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <button 
          onClick={step > 1 ? () => setStep((step - 1) as any) : onBack}
          className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Create Community</h1>
          <p className="text-xs text-slate-500 font-medium">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress Indicator Bar */}
      <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
        <div 
          className="bg-blue-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <form onSubmit={handleNextStep} className="space-y-4">
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500" />
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
                className="w-full p-3 rounded-2xl glass-input text-xs text-slate-800 font-medium focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full py-2.5 px-3 rounded-2xl glass-input text-xs text-slate-800 font-semibold focus:outline-none bg-white/80"
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
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ImageIcon size={16} className="text-purple-500" />
              <span>Avatar & Banner Customization</span>
            </h2>

            {/* Banner Preview & Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase px-1 block">Cover Banner (Optional)</label>
              <div className="h-28 w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative bg-slate-100 flex items-center justify-center">
                {bannerUrl ? (
                  <img src={bannerUrl} alt="banner preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400 font-medium">No banner uploaded (Default layout)</span>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-all">
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
              <div className="flex items-center gap-4 p-3 bg-slate-50/80 rounded-2xl border border-slate-200">
                <img 
                  src={avatarUrl || generateInitialAvatar(name)} 
                  alt="avatar preview" 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-md shrink-0" 
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
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
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
                        ? 'bg-blue-50/80 border-blue-500/80 shadow-sm' 
                        : 'bg-white/70 border-slate-200/80 hover:bg-white'
                    }`}
                  >
                    <div className={`p-2 rounded-xl mt-0.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <IconComp size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800">{opt.title}</h4>
                        {isSelected && <Check size={16} className="text-blue-600 font-bold" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed">{opt.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Generated Invite Preview */}
            <div className="p-3 bg-slate-100/80 rounded-2xl border border-slate-200/60 text-xs flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">relay.app/c/{handle || 'community'}</span>
              <span className="text-[10px] bg-white px-2 py-0.5 rounded-lg border border-slate-200 font-bold text-slate-700">Auto-Generated</span>
            </div>
          </GlassCard>

          <div className="flex justify-between">
            <GlassButton onClick={() => setStep(2)} variant="secondary" className="py-2.5 px-5 text-xs">
              Back
            </GlassButton>
            <GlassButton onClick={handleCreate} variant="primary" disabled={isLoading} className="py-2.5 px-6 text-xs font-bold">
              {isLoading ? 'Creating...' : 'Publish & Launch Community'}
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
};
