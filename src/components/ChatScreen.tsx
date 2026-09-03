/** RESTORED - see ChatScreen.backup.tsx in artifacts; temporary minimal shell */
import React from 'react';
export const ChatScreen: React.FC<{ chatId: string; onBack: () => void }> = ({ chatId, onBack }) => {
  return (
    <div className="p-4">
      <button type="button" onClick={onBack}>Back</button>
      <p className="text-sm mt-2">Chat {chatId} — ChatScreen is being restored. Phase 2 call modules are on main.</p>
    </div>
  );
};
