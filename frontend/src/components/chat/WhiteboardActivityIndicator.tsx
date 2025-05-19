import React from 'react';
import { Brush } from 'lucide-react'; // Using Brush as an example icon

interface WhiteboardActivityIndicatorProps {
  className?: string;
}

export const WhiteboardActivityIndicator: React.FC<WhiteboardActivityIndicatorProps> = ({ className }) => {
  return (
    <div className={`flex items-center space-x-2 text-sm text-muted-foreground mb-1 ${className || ''}`}>
      <Brush className="h-4 w-4" />
      <span>Tutor updated the whiteboard.</span>
    </div>
  );
}; 