export type VoiceRecorderStatus = 
  | 'idle' 
  | 'recording' 
  | 'paused' 
  | 'locked' 
  | 'previewing' 
  | 'uploading' 
  | 'error';

export interface VoiceNoteData {
  id: string;
  blob?: Blob;
  audioUrl: string;
  duration: number; // in seconds
  waveformData: number[]; // normalized amplitude values (0 - 100)
  fileSize?: number;
  mimeType: string;
  fileName: string;
  createdAt: string;
}

export interface VoiceUploadQueueItem {
  id: string;
  voiceNote: VoiceNoteData;
  progress: number; // 0 to 100
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
  retries: number;
}
