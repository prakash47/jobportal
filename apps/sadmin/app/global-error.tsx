'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Phase 1 item 18 — global error boundary, mirrors apps/web + apps/recruiter.
// Minimal no-design-system recovery UI on purpose: a broken @jobportal/ui
// import must not be able to crash the fallback that reports it.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Inter, -apple-system, "Segoe UI", sans-serif',
          padding: '40px 24px',
          maxWidth: 560,
          margin: '0 auto',
          color: '#111827',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.55 }}>
          The Super Admin portal hit an unexpected error. Try refreshing the page; if it persists,
          check the API and database are running.
        </p>
      </body>
    </html>
  );
}
