import { apiService } from '../../services/apiService';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { VoiceNoteData, VoiceUploadQueueItem } from './types';

class VoiceStorageService {
  private uploadQueue: Map<string, VoiceUploadQueueItem> = new Map();
  private listeners: Set<(queue: VoiceUploadQueueItem[]) => void> = new Set();

  public subscribe(listener: (queue: VoiceUploadQueueItem[]) => void) {
    this.listeners.add(listener);
    listener(Array.from(this.uploadQueue.values()));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const list = Array.from(this.uploadQueue.values());
    this.listeners.forEach((fn) => fn(list));
  }

  public async uploadVoiceNote(
    voiceNote: VoiceNoteData,
    onProgress?: (progress: number) => void
  ): Promise<{ url: string; size?: number }> {
    const queueId = voiceNote.id;
    const queueItem: VoiceUploadQueueItem = {
      id: queueId,
      voiceNote,
      progress: 0,
      status: 'uploading',
      retries: 0,
    };
    this.uploadQueue.set(queueId, queueItem);
    this.notify();

    try {
      let base64Data = '';
      if (voiceNote.blob) {
        base64Data = await this.blobToBase64(voiceNote.blob);
      } else if (voiceNote.audioUrl.startsWith('data:')) {
        base64Data = voiceNote.audioUrl;
      } else {
        queueItem.status = 'completed';
        queueItem.progress = 100;
        this.notify();
        return { url: voiceNote.audioUrl, size: voiceNote.fileSize };
      }

      onProgress?.(25);
      queueItem.progress = 25;
      this.notify();

      if (isSupabaseConfigured && voiceNote.blob) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const uid = user?.id || 'anon';
          const fileName = `${uid}/voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${this.getExtensionFromMime(voiceNote.mimeType)}`;
          const { data: sbData, error: sbErr } = await supabase.storage
            .from('chat-media')
            .upload(fileName, voiceNote.blob, {
              contentType: voiceNote.mimeType || 'audio/webm',
              upsert: true,
            });

          if (!sbErr && sbData?.path) {
            const { data: signed } = await supabase.storage
              .from('chat-media')
              .createSignedUrl(sbData.path, 60 * 60 * 24 * 365);
            if (signed?.signedUrl) {
              queueItem.status = 'completed';
              queueItem.progress = 100;
              this.notify();
              onProgress?.(100);
              return { url: signed.signedUrl, size: voiceNote.blob.size };
            }
          }
        } catch (err) {
          console.warn('Supabase direct client upload skipped, falling back to server api:', err);
        }
      }

      onProgress?.(50);
      queueItem.progress = 50;
      this.notify();

      const fileName = voiceNote.fileName || `voice_${Date.now()}.webm`;
      const uploadRes = await apiService.uploadFile(base64Data, fileName, voiceNote.mimeType || 'audio/webm');

      queueItem.status = 'completed';
      queueItem.progress = 100;
      this.notify();
      onProgress?.(100);

      return { url: uploadRes.url, size: voiceNote.fileSize || 0 };
    } catch (error: any) {
      queueItem.status = 'failed';
      queueItem.error = error?.message || 'Upload failed';
      this.notify();
      throw error;
    }
  }

  public async retryUpload(queueId: string): Promise<{ url: string; size?: number }> {
    const item = this.uploadQueue.get(queueId);
    if (!item) throw new Error('Queue item not found');
    item.retries += 1;
    item.status = 'uploading';
    item.error = undefined;
    this.notify();
    return this.uploadVoiceNote(item.voiceNote);
  }

  public cancelUpload(queueId: string) {
    this.uploadQueue.delete(queueId);
    this.notify();
  }

  private getExtensionFromMime(mime: string): string {
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('mp3')) return 'mp3';
    return 'webm';
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const voiceStorageService = new VoiceStorageService();
