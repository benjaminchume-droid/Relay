/**
 * Phase 2: Voice/Video call lifecycle against supabase1 RPCs + realtime signaling.
 */
import { supabase } from "../lib/supabase/client";

export type CallType = "voice" | "video";
export type CallStatus =
  | "ringing"
  | "connecting"
  | "active"
  | "ended"
  | "missed"
  | "declined"
  | "cancelled";

export type RelayCall = {
  id: string;
  conversationId: string;
  callerId: string;
  callType: CallType;
  status: CallStatus;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  answeredBy?: string;
};

export type CallSignal = {
  id: string;
  callId: string;
  senderId: string;
  signalType: "offer" | "answer" | "ice";
  payload: any;
  createdAt: string;
};

function mapCall(row: any): RelayCall {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    callerId: row.caller_id || row.initiated_by,
    callType: row.call_type,
    status: row.status,
    startedAt: row.started_at,
    answeredAt: row.answered_at || undefined,
    endedAt: row.ended_at || undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    answeredBy: row.answered_by || undefined,
  };
}

export async function startCall(
  conversationId: string,
  callType: CallType = "voice"
): Promise<RelayCall> {
  const { data, error } = await supabase.rpc("start_call", {
    p_conversation_id: conversationId,
    p_call_type: callType,
  });
  if (error) throw error;
  return mapCall(data);
}

export async function answerCall(callId: string): Promise<RelayCall> {
  const { data, error } = await supabase.rpc("answer_call", { p_call_id: callId });
  if (error) throw error;
  return mapCall(data);
}

export async function rejectCall(callId: string): Promise<RelayCall> {
  const { data, error } = await supabase.rpc("reject_call", { p_call_id: callId });
  if (error) throw error;
  return mapCall(data);
}

export async function endCall(callId: string): Promise<RelayCall> {
  const { data, error } = await supabase.rpc("end_call", { p_call_id: callId });
  if (error) throw error;
  return mapCall(data);
}

export async function postSignal(
  callId: string,
  signalType: "offer" | "answer" | "ice",
  payload: any
): Promise<void> {
  const { error } = await supabase.rpc("post_call_signal", {
    p_call_id: callId,
    p_signal_type: signalType,
    p_payload: payload,
  });
  if (error) throw error;
}

export async function fetchCallHistory(limit = 50): Promise<RelayCall[]> {
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapCall);
}

/** Subscribe to incoming calls for a conversation (postgres_changes). */
export function subscribeConversationCalls(
  conversationId: string,
  onCall: (call: RelayCall) => void
) {
  const channel = supabase
    .channel(`calls:conv:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "calls",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        if (payload.new) onCall(mapCall(payload.new));
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        if (payload.new) onCall(mapCall(payload.new));
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Subscribe to SDP/ICE signals for a call. */
export function subscribeCallSignals(
  callId: string,
  myProfileId: string,
  onSignal: (signal: CallSignal) => void
) {
  const channel = supabase
    .channel(`call_signaling:${callId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "call_signaling",
        filter: `call_id=eq.${callId}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (!row || row.sender_id === myProfileId) return;
        onSignal({
          id: row.id,
          callId: row.call_id,
          senderId: row.sender_id,
          signalType: row.signal_type,
          payload: row.payload,
          createdAt: row.created_at,
        });
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
