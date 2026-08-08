export interface Sticker {
  id: string;
  packId: string;
  name: string;
  url: string;
  keywords: string[];
  animated?: boolean;
}

export interface StickerPack {
  id: string;
  name: string;
  author: string;
  coverUrl: string;
  stickers: Sticker[];
}
