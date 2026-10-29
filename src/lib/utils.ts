/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Format ISO timestamp into clean relative human-readable format:
 * - Same day: "12:39 PM"
 * - Yesterday: "Yesterday"
 * - Same year: "Jul 31"
 * - Older: "DD/MM/YY"
 */
export function formatChatTimestamp(isoString?: string | null): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    // If it's already a formatted string like "12:34 PM" or "Yesterday", return as-is
    return isoString;
  }

  const now = new Date();
  
  // Reset hours to compare calendar days
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const targetDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetDayStart.getTime() === todayStart.getTime()) {
    // Same day: 12:39 PM
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (targetDayStart.getTime() === yesterdayStart.getTime()) {
    return 'Yesterday';
  }

  if (date.getFullYear() === now.getFullYear()) {
    // Same year: e.g. "Jul 31"
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Older year: DD/MM/YY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Convert raw ISO string into relative time string:
 * "Just now", "2 mins ago", "1 hour ago", "Yesterday", "Jul 31"
 */
export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 45) return 'Just now';
  if (diffSeconds < 3600) {
    const mins = Math.floor(diffSeconds / 60);
    return `${mins} ${mins === 1 ? 'min' : 'mins'} ago`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`;
  }

  return formatChatTimestamp(isoString);
}

/**
 * Sanitize handles so they never output duplicate '@' symbols (e.g. @@username).
 */
export function formatHandle(handle?: string | null): string {
  if (!handle) return '';
  const cleaned = handle.replace(/^@+/, '');
  return `@${cleaned}`;
}

