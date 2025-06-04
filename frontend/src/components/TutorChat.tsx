import React from 'react';
import AgentTutorChat from './AgentTutorChat';

interface TutorChatProps {
  sessionId: string;
  jwt: string;
}

export default function TutorChat({ sessionId, jwt }: TutorChatProps) {
  // Use the new agent-powered chat component
  return (
    <AgentTutorChat 
      sessionId={sessionId}
      className="h-full"
    />
  );
} 