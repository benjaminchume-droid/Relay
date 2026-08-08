export type CameraMode = 'photo' | 'video' | 'qr' | 'doc' | 'burst';
export type FlashMode = 'off' | 'on' | 'auto' | 'torch';
export type AspectRatioMode = '4:3' | '1:1' | '16:9' | 'full';
export type CameraFacing = 'environment' | 'user';

export interface CameraSettings {
  facing: CameraFacing;
  flash: FlashMode;
  aspectRatio: AspectRatioMode;
  timerSeconds: 0 | 3 | 10;
  gridEnabled: boolean;
  hdrEnabled: boolean;
  nightModeEnabled: boolean;
  macroEnabled: boolean;
  zoomLevel: number;
  exposureValue: number; // -2 to +2
}

export interface CapturedMediaResult {
  id: string;
  type: 'image' | 'video';
  dataUrl: string; // base64 or blob URL
  blob?: Blob;
  width?: number;
  height?: number;
  duration?: number; // for video
  capturedAt: string;
  qrResult?: string;
  filterApplied?: string;
  caption?: string;
  voiceCaptionUrl?: string;
}
