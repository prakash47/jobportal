'use client';

import { useState } from 'react';
import { IconButton } from '@jobportal/ui';
import { Linkedin, LinkIcon, Twitter } from '@jobportal/ui/icons';

const SHARE_LINK_CLASSES =
  'inline-flex size-8 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]';

export interface ShareButtonsProps {
  url: string;     // absolute canonical URL
  title: string;   // job title
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const liHref = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be blocked — silently no-op
    }
  }

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Share this job">
      <a
        href={tweetHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X (Twitter)"
        className={SHARE_LINK_CLASSES}
      >
        <Twitter className="size-4" aria-hidden="true" />
      </a>
      <a
        href={liHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        className={SHARE_LINK_CLASSES}
      >
        <Linkedin className="size-4" aria-hidden="true" />
      </a>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={copied ? 'Link copied' : 'Copy link'}
        icon={<LinkIcon className="size-4" aria-hidden="true" />}
        onClick={copy}
      />
    </div>
  );
}
