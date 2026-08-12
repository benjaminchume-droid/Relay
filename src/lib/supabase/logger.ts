/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AuditLogEntry {
  id: string;
  target: string;
  payload?: any;
  timestamp: string;
  startTime: number;
  durationMs?: number;
  status: 'pending' | 'success' | 'empty' | 'error' | 'timeout' | 'client_error';
  dataCount?: number;
  error?: any;
}

const auditLogs: AuditLogEntry[] = [];
const MAX_LOG_HISTORY = 100;

export const getAuditLogs = (): AuditLogEntry[] => [...auditLogs];

/**
 * Wraps a Supabase REST or RPC query with explicit timing, payload, status code, 
 * and response category auditing (Client Error vs Backend Timeout vs Empty Result vs Success).
 */
export async function auditSupabaseCall<T = any>(
  target: string,
  payload: any,
  queryFn: () => Promise<{ data: T | null; error: any; count?: number | null; status?: number; statusText?: string }> | any
): Promise<{ data: T | null; error: any }> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  const logEntry: AuditLogEntry = {
    id: logId,
    target,
    payload,
    timestamp,
    startTime,
    status: 'pending'
  };

  auditLogs.unshift(logEntry);
  if (auditLogs.length > MAX_LOG_HISTORY) auditLogs.pop();

  console.log(`[Supabase Audit Request] 🚀 ${target} @ ${timestamp}`, {
    target,
    payload
  });

  try {
    const response = await queryFn();
    const durationMs = Math.round(performance.now() - startTime);
    logEntry.durationMs = durationMs;

    if (response.error) {
      logEntry.status = response.error.message?.includes('timeout') ? 'timeout' : 'error';
      logEntry.error = response.error;

      console.error(`[Supabase Audit Response Error] ❌ ${target} (${durationMs}ms)`, {
        target,
        status: response.status || 500,
        statusText: response.statusText || 'Error',
        durationMs,
        error: response.error,
        payload
      });
      return { data: response.data, error: response.error };
    }

    const data = response.data;
    const isArray = Array.isArray(data);
    const dataCount = isArray ? (data as any[]).length : data ? 1 : 0;
    logEntry.dataCount = dataCount;

    if (isArray && (data as any[]).length === 0) {
      logEntry.status = 'empty';
      console.log(`[Supabase Audit Response Empty Array] ⚠️ ${target} returned 0 records (${durationMs}ms)`, {
        target,
        status: response.status || 200,
        durationMs,
        dataCount: 0,
        payload
      });
    } else {
      logEntry.status = 'success';
      console.log(`[Supabase Audit Response Success] ✅ ${target} (${durationMs}ms)`, {
        target,
        status: response.status || 200,
        durationMs,
        dataCount,
        payload
      });
    }

    return { data: response.data, error: null };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logEntry.durationMs = durationMs;

    const isClientError = err.name === 'AbortError' || err.message?.includes('fetch') || err.message?.includes('Network');
    logEntry.status = isClientError ? 'client_error' : 'error';
    logEntry.error = err;

    console.error(`[Supabase Audit Client/Network Exception] 💥 ${target} failed to reach backend (${durationMs}ms)`, {
      target,
      durationMs,
      errorName: err.name,
      errorMessage: err.message,
      payload
    });

    throw err;
  }
}
