/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ambient declaration for @capacitor/browser — the plugin is dynamically imported
 * on native builds only and kept external in the web bundle, but the typechecker
 * still needs to resolve the module.
 */

declare module '@capacitor/browser' {
  export interface BrowserOpenOptions {
    url: string;
    windowName?: string;
    presentationStyle?: 'fullscreen' | 'popover';
    toolbarColor?: string;
  }
  export interface BrowserPlugin {
    open(options: BrowserOpenOptions): Promise<any>;
    close(): Promise<any>;
  }
  export const Browser: BrowserPlugin;
}
