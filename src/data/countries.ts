/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CountryItem {
  name: string;
  code: string; // ISO 2-letter
  flag: string;
  dialCode: string;
}

export const COUNTRIES: CountryItem[] = [
  { name: 'Argentina', code: 'AR', flag: '🇦🇷', dialCode: '+54' },
  { name: 'Australia', code: 'AU', flag: '🇦🇺', dialCode: '+61' },
  { name: 'Austria', code: 'AT', flag: '🇦🇹', dialCode: '+43' },
  { name: 'Belgium', code: 'BE', flag: '🇧🇪', dialCode: '+32' },
  { name: 'Brazil', code: 'BR', flag: '🇧🇷', dialCode: '+55' },
  { name: 'Canada', code: 'CA', flag: '🇨🇦', dialCode: '+1' },
  { name: 'Chile', code: 'CL', flag: '🇨🇱', dialCode: '+56' },
  { name: 'Colombia', code: 'CO', flag: '🇨🇴', dialCode: '+57' },
  { name: 'Denmark', code: 'DK', flag: '🇩🇰', dialCode: '+45' },
  { name: 'Finland', code: 'FI', flag: '🇫🇮', dialCode: '+358' },
  { name: 'France', code: 'FR', flag: '🇫🇷', dialCode: '+33' },
  { name: 'Germany', code: 'DE', flag: '🇩🇪', dialCode: '+49' },
  { name: 'Greece', code: 'GR', flag: '🇬🇷', dialCode: '+30' },
  { name: 'India', code: 'IN', flag: '🇮🇳', dialCode: '+91' },
  { name: 'Indonesia', code: 'ID', flag: '🇮🇩', dialCode: '+62' },
  { name: 'Ireland', code: 'IE', flag: '🇮🇪', dialCode: '+353' },
  { name: 'Israel', code: 'IL', flag: '🇮🇱', dialCode: '+972' },
  { name: 'Italy', code: 'IT', flag: '🇮🇹', dialCode: '+39' },
  { name: 'Japan', code: 'JP', flag: '🇯🇵', dialCode: '+81' },
  { name: 'Malaysia', code: 'MY', flag: '🇲🇾', dialCode: '+60' },
  { name: 'Mexico', code: 'MX', flag: '🇲🇽', dialCode: '+52' },
  { name: 'Netherlands', code: 'NL', flag: '🇳🇱', dialCode: '+31' },
  { name: 'New Zealand', code: 'NZ', flag: '🇳🇿', dialCode: '+64' },
  { name: 'Nigeria', code: 'NG', flag: '🇳🇬', dialCode: '+234' },
  { name: 'Norway', code: 'NO', flag: '🇳🇴', dialCode: '+47' },
  { name: 'Philippines', code: 'PH', flag: '🇵🇭', dialCode: '+63' },
  { name: 'Poland', code: 'PL', flag: '🇵🇱', dialCode: '+48' },
  { name: 'Portugal', code: 'PT', flag: '🇵🇹', dialCode: '+351' },
  { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦', dialCode: '+966' },
  { name: 'Singapore', code: 'SG', flag: '🇸🇬', dialCode: '+65' },
  { name: 'South Africa', code: 'ZA', flag: '🇿🇦', dialCode: '+27' },
  { name: 'South Korea', code: 'KR', flag: '🇰🇷', dialCode: '+82' },
  { name: 'Spain', code: 'ES', flag: '🇪🇸', dialCode: '+34' },
  { name: 'Sweden', code: 'SE', flag: '🇸🇪', dialCode: '+46' },
  { name: 'Switzerland', code: 'CH', flag: '🇨🇭', dialCode: '+41' },
  { name: 'Thailand', code: 'TH', flag: '🇹🇭', dialCode: '+66' },
  { name: 'Turkey', code: 'TR', flag: '🇹🇷', dialCode: '+90' },
  { name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪', dialCode: '+971' },
  { name: 'United Kingdom', code: 'GB', flag: '🇬🇧', dialCode: '+44' },
  { name: 'United States', code: 'US', flag: '🇺🇸', dialCode: '+1' },
  { name: 'Vietnam', code: 'VN', flag: '🇻🇳', dialCode: '+84' },
].sort((a, b) => a.name.localeCompare(b.name));
