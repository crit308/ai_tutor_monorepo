import React from 'react';
import { useRouter } from 'next/router';
import TutorChat from '@/components/TutorChat';

export default function TutorPage() {
  const router = useRouter();
  const { sessionId, jwt } = router.query;

  if (!sessionId || !jwt) {
    return (
      <div style={{ padding: '1rem' }}>
        <h2>Missing parameters</h2>
        <p>Please provide <code>sessionId</code> and <code>jwt</code> in the URL query:</p>
        <pre>/?sessionId=YOUR_SESSION_ID&jwt=YOUR_JWT_TOKEN</pre>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Tutor Chat</h1>
      <TutorChat sessionId={String(sessionId)} jwt={String(jwt)} />
    </div>
  );
} 