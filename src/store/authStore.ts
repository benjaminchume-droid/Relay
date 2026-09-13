/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Temporary thin re-export shim while full store is restored.
 * Full implementation lives below in the same file after bootstrap helpers.
 */

export { getAuthRedirectUrl } from '../lib/authRedirect';

// Re-load note: full authStore body will be restored in next commit.
export type AuthStatus =
  | 'BOOTSTRAPPING'
  | 'AUTH_LOADING'
  | 'UNAUTHENTICATED'
  | 'EMAIL_UNVERIFIED'
  | 'NEEDS_SETUP'
  | 'ONBOARDING_REQUIRED'
  | 'READY'
  | 'AUTHENTICATED';

export type OnboardingStep =
  | 'CREATE_ACCOUNT'
  | 'VERIFY_EMAIL'
  | 'DISPLAY_NAME'
  | 'USERNAME'
  | 'APPEARANCE'
  | 'SIGN_IN'
  | 'FORGOT_PASSWORD'
  | 'NEW_PASSWORD';

throw new Error('authStore temporarily broken — restoring full implementation');
