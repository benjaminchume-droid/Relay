import { supabase } from './supabase/client';

export type InviteKind = 'group' | 'community' | 'channel';

export type InvitePreview = {
  kind: InviteKind;
  token: string;
  targetId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  memberCount?: number;
  expiresAt?: string | null;
  valid: boolean;
  error?: string;
};

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function resolveInvite(kind: InviteKind, tokenOrId: string): Promise<InvitePreview> {
  const token = tokenOrId.trim();

  try {
    const { data: inv, error } = await supabase.from('invite_tokens').select('*').eq('token', token).maybeSingle();
    if (!error && inv) {
      const expired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
      if (expired || inv.revoked) {
        return {
          kind,
          token,
          targetId: inv.target_id,
          name: inv.target_name || 'Invite',
          valid: false,
          error: expired ? 'This invite has expired.' : 'This invite was revoked.',
        };
      }
      return {
        kind: (inv.kind as InviteKind) || kind,
        token,
        targetId: inv.target_id,
        name: inv.target_name || 'Invite',
        description: inv.description || undefined,
        avatarUrl: inv.avatar_url || undefined,
        memberCount: inv.member_count ?? undefined,
        expiresAt: inv.expires_at,
        valid: true,
      };
    }
  } catch {
    /* optional table */
  }

  if (kind === 'group' || kind === 'channel') {
    if (looksLikeUuid(token)) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id,name,avatar_url,conversation_type')
        .eq('id', token)
        .maybeSingle();
      if (conv) {
        return {
          kind,
          token,
          targetId: conv.id,
          name: conv.name || (kind === 'channel' ? 'Channel' : 'Group'),
          avatarUrl: conv.avatar_url || undefined,
          valid: true,
        };
      }
    }
    const { data: byCode } = await supabase
      .from('conversations')
      .select('id,name,avatar_url,invite_code')
      .eq('invite_code', token)
      .maybeSingle();
    if (byCode) {
      return {
        kind,
        token,
        targetId: byCode.id,
        name: byCode.name || 'Group',
        avatarUrl: byCode.avatar_url || undefined,
        valid: true,
      };
    }
  }

  if (kind === 'community') {
    const handle = token.replace(/^@/, '').toLowerCase();
    if (looksLikeUuid(token)) {
      const { data: c } = await supabase
        .from('communities')
        .select('id,name,description,avatar_url,member_count,slug')
        .eq('id', token)
        .maybeSingle();
      if (c) {
        return {
          kind: 'community',
          token,
          targetId: c.id,
          name: c.name || c.slug || 'Community',
          description: c.description || undefined,
          avatarUrl: c.avatar_url || undefined,
          memberCount: c.member_count ?? undefined,
          valid: true,
        };
      }
    } else {
      const { data: c } = await supabase
        .from('communities')
        .select('id,name,description,avatar_url,member_count,slug')
        .eq('slug', handle)
        .maybeSingle();
      if (c) {
        return {
          kind: 'community',
          token,
          targetId: c.id,
          name: c.name || c.slug || 'Community',
          description: c.description || undefined,
          avatarUrl: c.avatar_url || undefined,
          memberCount: c.member_count ?? undefined,
          valid: true,
        };
      }
    }
  }

  return {
    kind,
    token,
    targetId: token,
    name: 'Invite',
    valid: false,
    error: 'Invite not found or no longer available.',
  };
}

export async function joinInvite(preview: InvitePreview): Promise<{ ok: boolean; error?: string }> {
  if (!preview.valid) return { ok: false, error: preview.error || 'Invalid invite' };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, error: 'Sign in required' };

  try {
    if (preview.kind === 'community') {
      const { error } = await supabase.rpc('join_community', { p_community_id: preview.targetId });
      if (error) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', sessionData.session.user.id)
          .maybeSingle();
        if (!profile) return { ok: false, error: error.message };
        const { error: e2 } = await supabase.from('community_members').upsert({
          community_id: preview.targetId,
          profile_id: profile.id,
          role: 'member',
        });
        if (e2) return { ok: false, error: e2.message };
      }
      return { ok: true };
    }

    const { error } = await supabase.rpc('join_conversation_by_invite', {
      p_token: preview.token,
      p_conversation_id: preview.targetId,
    });
    if (!error) return { ok: true };
    return { ok: false, error: error.message };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Join failed' };
  }
}
