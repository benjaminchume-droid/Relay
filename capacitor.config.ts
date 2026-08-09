import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.glassline.relay',
  appName: 'Relay',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
