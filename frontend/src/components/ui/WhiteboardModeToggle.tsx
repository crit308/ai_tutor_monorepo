import React from 'react';
import { Switch } from '@/components/ui/switch'; // Assuming Shadcn Switch is available
import { Label } from '@/components/ui/label'; // Assuming Shadcn Label is available
import { useSessionStore } from '@/store/sessionStore';

export const WhiteboardModeToggle: React.FC = () => {
  const whiteboardMode = useSessionStore((state) => state.whiteboardMode);
  const setWhiteboardMode = useSessionStore((state) => state.setWhiteboardMode);

  const handleToggle = (checked: boolean) => {
    setWhiteboardMode(checked ? 'chat_and_whiteboard' : 'chat_only');
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="whiteboard-mode-toggle"
        checked={whiteboardMode === 'chat_and_whiteboard'}
        onCheckedChange={handleToggle}
        aria-label="Toggle whiteboard mode"
      />
      <Label htmlFor="whiteboard-mode-toggle" className="cursor-pointer">
        {whiteboardMode === 'chat_and_whiteboard' ? 'Whiteboard On' : 'Whiteboard Off'}
      </Label>
    </div>
  );
}; 