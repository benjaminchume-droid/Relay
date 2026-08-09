import React, { useState, useRef } from 'react';
import { CornerUpLeft } from 'lucide-react';

export interface SwipeableMessageItemProps {
  children: React.ReactNode;
  onSwipeToReply: () => void;
  messageId: string;
  className?: string;
}

export const SwipeableMessageItem: React.FC<SwipeableMessageItemProps> = ({
  children,
  onSwipeToReply,
  messageId,
  className = '',
}) => {
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const SWIPE_THRESHOLD = 50; // px to trigger reply

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    triggeredRef.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartXRef.current;
    const diffY = Math.abs(currentY - touchStartYRef.current);

    // If user is scrolling vertically, don't hijack horizontal swipe
    if (diffY > Math.abs(diffX) && Math.abs(diffX) < 10) {
      return;
    }

    // Only allow swipe right (> 0)
    if (diffX > 0) {
      // Apply dampening elastic calculation
      const dampened = Math.min(90, Math.pow(diffX, 0.85));
      setDragX(dampened);

      if (dampened >= SWIPE_THRESHOLD && !triggeredRef.current) {
        triggeredRef.current = true;
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(15);
          } catch (_) {}
        }
        onSwipeToReply();
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    setIsSwiping(false);
    setDragX(0);
  };

  return (
    <div id={`msg-${messageId}`} className={`relative group w-full ${className}`}>
      {/* Curved Reply Arrow Indicator revealed on swipe */}
      <div 
        style={{ 
          opacity: Math.min(1, dragX / SWIPE_THRESHOLD),
          transform: `scale(${Math.min(1.2, Math.max(0.6, dragX / SWIPE_THRESHOLD))})`
        }}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white shadow-md z-10 transition-transform duration-75 flex items-center justify-center pointer-events-none"
      >
        <CornerUpLeft size={16} />
      </div>

      {/* Swipeable Message Container */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
        className="relative z-0 w-full flex flex-col items-inherit"
      >
        {children}
      </div>
    </div>
  );
};
