import { StickerPack } from './types';

export const PRESET_STICKER_PACKS: StickerPack[] = [
  {
    id: 'glassmorphism_emblems',
    name: 'Glassmorphism Emblems',
    author: 'Relay Design Team',
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
    stickers: [
      {
        id: 'glass_heart',
        packId: 'glassmorphism_emblems',
        name: 'Liquid Heart',
        url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=300',
        keywords: ['heart', 'love', 'liquid', 'glass']
      },
      {
        id: 'glass_star',
        packId: 'glassmorphism_emblems',
        name: 'Glowing Star',
        url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=300',
        keywords: ['star', 'glow', 'sparkle']
      },
      {
        id: 'glass_fire',
        packId: 'glassmorphism_emblems',
        name: 'Neon Flame',
        url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300',
        keywords: ['fire', 'flame', 'lit', 'hot']
      },
      {
        id: 'glass_shield',
        packId: 'glassmorphism_emblems',
        name: 'Quantum Shield',
        url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=300',
        keywords: ['shield', 'secure', 'protection']
      }
    ]
  },
  {
    id: 'expressive_cats',
    name: 'Expressive Cats',
    author: 'Neko Art Studio',
    coverUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=150',
    stickers: [
      {
        id: 'cat_wink',
        packId: 'expressive_cats',
        name: 'Winking Cat',
        url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=300',
        keywords: ['cat', 'wink', 'happy', 'cute']
      },
      {
        id: 'cat_surprised',
        packId: 'expressive_cats',
        name: 'Shocked Kitty',
        url: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=300',
        keywords: ['cat', 'shock', 'omg', 'funny']
      },
      {
        id: 'cat_sunglasses',
        packId: 'expressive_cats',
        name: 'Cool Cat',
        url: 'https://images.unsplash.com/photo-1519052537078-e6302a4968d4?w=300',
        keywords: ['cat', 'cool', 'sunglasses', 'swag']
      }
    ]
  },
  {
    id: 'tech_dev_memes',
    name: 'Tech Dev Memes',
    author: 'DevRel Squad',
    coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=150',
    stickers: [
      {
        id: 'code_ship',
        packId: 'tech_dev_memes',
        name: 'Ship It!',
        url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300',
        keywords: ['ship', 'code', 'deploy', 'rocket']
      },
      {
        id: 'code_bug',
        packId: 'tech_dev_memes',
        name: 'It is a Feature',
        url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300',
        keywords: ['bug', 'feature', 'programmer', 'humor']
      }
    ]
  }
];
