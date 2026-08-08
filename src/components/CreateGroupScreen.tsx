/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Check, Search, Shield, Image as ImageIcon } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from './GlassUI';
import { useChatStore } from '../store/chatStore';
import { useContactsStore } from '../store/contactsStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

export const CreateGroupScreen: React.FC<{
  onBack: () => void;
  onSuccess: (chatId: string) => void;
}> = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [groupName, setGroupName] = useState('');
  const [groupHandle, setGroupHandle] = useState('');
  const [description, setDescription] = useState('');

  // Step 2
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const generateInitialAvatar = (name: string) => {
    const colors = ['#2563EB', '#7C3AED', '#059669', '#E11D48', '#D97706', '#0891B2'];
    const char = (name.trim()[0] || 'G').toUpperCase();
    const color = colors[name.length % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="90" font-weight="bold" fill="#ffffff">${char}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setAvatarUrl(evt.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 3
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const { createGroupChat } = useChatStore();
  const { searchResults, searchUsers } = useContactsStore();

  useEffect(() => {
    searchUsers(memberSearch);
  }, [memberSearch]);

  const toggleUser = (id: string) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter((u) => u !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    const finalAvatar = avatarUrl || generateInitialAvatar(groupName);
    const chatId = await createGroupChat(groupName, description, selectedUserIds, false, finalAvatar);
    if (chatId) {
      onSuccess(chatId);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-6 space-y-6 text-left pb-28">
      {/* Top Bar */}
      <div className="flex items-center gap-3">
        <button 
          onClick={step > 1 ? () => setStep((step - 1) as any) : onBack}
          className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Create New Group</h1>
          <p className="text-xs text-slate-500 font-medium">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
        <div 
          className="bg-blue-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* Step 1: Info */}
      {step === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); if (groupName.trim()) setStep(2); }} className="space-y-4">
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users size={16} className="text-blue-500" />
              <span>Group Identification</span>
            </h2>

            <GlassInput 
              label="Group Name"
              placeholder="e.g. Frontend Architecture Guild"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />

            <GlassInput 
              label="Group Handle (optional)"
              placeholder="frontend-guild"
              value={groupHandle}
              onChange={(e) => setGroupHandle(e.target.value)}
            />
            {groupHandle && (
              <span className="text-[11px] text-slate-500 font-mono pl-1 block">
                Handle: {formatHandle(groupHandle)}
              </span>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Description</label>
              <textarea 
                placeholder="Group purpose or discussion topics..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-2xl glass-input text-xs text-slate-800 font-medium focus:outline-none"
              />
            </div>
          </GlassCard>

          <div className="flex justify-end gap-2">
            <GlassButton onClick={onBack} variant="secondary" className="py-2.5 px-5 text-xs">
              Cancel
            </GlassButton>
            <GlassButton type="submit" variant="primary" disabled={!groupName.trim()} className="py-2.5 px-6 text-xs">
              Continue to Avatar
            </GlassButton>
          </div>
        </form>
      )}

      {/* Step 2: Avatar selection */}
      {step === 2 && (
        <div className="space-y-4">
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ImageIcon size={16} className="text-purple-500" />
              <span>Group Avatar</span>
            </h2>

            <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-slate-50/80 rounded-2xl border border-slate-200">
              <img 
                src={avatarUrl || generateInitialAvatar(groupName)} 
                alt="Group avatar" 
                className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-md shrink-0" 
              />
              <div className="space-y-2 text-center sm:text-left">
                <p className="text-xs font-semibold text-slate-700">Upload a custom image from gallery or leave blank for auto-generated initials color.</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-all">
                  <ImageIcon size={14} /> Choose from Gallery
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
                {avatarUrl && (
                  <button 
                    type="button" 
                    onClick={() => setAvatarUrl('')}
                    className="block text-[11px] text-red-600 font-semibold hover:underline mt-1"
                  >
                    Remove picture (use random color)
                  </button>
                )}
              </div>
            </div>
          </GlassCard>

          <div className="flex justify-between">
            <GlassButton onClick={() => setStep(1)} variant="secondary" className="py-2.5 px-5 text-xs">
              Back
            </GlassButton>
            <GlassButton onClick={() => setStep(3)} variant="primary" className="py-2.5 px-6 text-xs">
              Continue to Members
            </GlassButton>
          </div>
        </div>
      )}

      {/* Step 3: Select initial members */}
      {step === 3 && (
        <div className="space-y-4">
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users size={16} className="text-emerald-500" />
              <span>Add Initial Members ({selectedUserIds.length} selected)</span>
            </h2>

            <GlassInput 
              placeholder="Search contacts by handle or name..."
              icon={<Search size={16} />}
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />

            <div className="max-h-60 overflow-y-auto space-y-2 pt-2">
              {searchResults.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Search for user handles to invite to this group.</p>
              ) : (
                searchResults.map((user) => {
                  const isSel = selectedUserIds.includes(user.id);
                  return (
                    <div 
                      key={user.id}
                      onClick={() => toggleUser(user.id)}
                      className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSel ? 'bg-blue-50/80 border-blue-500/80 shadow-xs' : 'bg-white/70 border-slate-200/60 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img src={user.avatarUrl || getLetterAvatar(user.name || user.username)} alt={user.name} className="w-9 h-9 rounded-xl object-cover" />
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">{user.name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono">{formatHandle(user.username)}</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>
                        {isSel && <Check size={12} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>

          <div className="flex justify-between">
            <GlassButton onClick={() => setStep(2)} variant="secondary" className="py-2.5 px-5 text-xs">
              Back
            </GlassButton>
            <GlassButton onClick={handleCreateGroup} variant="primary" className="py-2.5 px-6 text-xs font-bold">
              Create Group
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
};
