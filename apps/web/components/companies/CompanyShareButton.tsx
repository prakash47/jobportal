'use client';

import { useCallback, useState } from 'react';
import { Button } from '@jobportal/ui';
import { Check, Share2 } from '@jobportal/ui/icons';

export interface CompanyShareButtonProps {
  companyName: string;
  /** Absolute canonical URL of this company profile. */
  url: string;
  size?: 'sm' | 'md';
}

// Real, backend-free share: the Web Share API on supporting devices (mobile),
// falling back to copy-to-clipboard with a transient "Copied" confirmation.
// No follow/save model exists, so this is the only share affordance we ship —
// nothing here pretends to persist server state.
export function CompanyShareButton({ companyName, url, size = 'md' }: CompanyShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const onShare = useCallback(async () => {
    const shareData = {
      title: `${companyName} — JobPortal`,
      text: `Check out ${companyName} on JobPortal`,
      url,
    };
    // navigator.share only resolves from a user gesture on secure origins.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User dismissed the sheet, or share is unavailable — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (rare) — nothing else we can safely do without UI chrome.
    }
  }, [companyName, url]);

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={onShare}
      leadingIcon={
        copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Share2 className="size-4" aria-hidden="true" />
        )
      }
      aria-live="polite"
    >
      {copied ? 'Copied' : 'Share'}
    </Button>
  );
}
