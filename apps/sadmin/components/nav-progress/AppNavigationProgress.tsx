'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NavigationProgress, notifyNavStart } from '@jobportal/ui';

// Thin Next-aware wrapper around the shared NavigationProgress — the sadmin
// variant. Mirrors the recruiter wrapper (apps cannot import each other's
// components): pane-only opaque veil offset past the 256px navy rail, mounted
// from the (authed) layout. /login is a single page with no internal navs, so
// nothing outside the shell needs covering.
//
// basePath note: this app serves under /sadmin via next.config basePath, but
// nothing here needs to know that — usePathname is basePath-stripped (the
// route key only has to CHANGE), and the click predicate compares anchor URLs
// against window.location, where BOTH sides carry the /sadmin prefix.
//
// The router patch mirrors apps/web: push/replace signal the loader for
// programmatic navigations; refresh() is deliberately not patched (it never
// changes the route key, so the veil would hang until the failsafe).

const PATCHED = Symbol.for('cq.nav-progress.patched');

export function AppNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const r = router as typeof router & { [PATCHED]?: boolean };
    if (r[PATCHED]) return;
    r[PATCHED] = true;
    const origPush = r.push.bind(r);
    const origReplace = r.replace.bind(r);
    r.push = (...args: Parameters<typeof origPush>) => {
      notifyNavStart();
      return origPush(...args);
    };
    r.replace = (...args: Parameters<typeof origReplace>) => {
      notifyNavStart();
      return origReplace(...args);
    };
  }, [router]);

  return (
    <NavigationProgress
      routeKey={`${pathname}?${searchParams.toString()}`}
      variant="pane"
      className="md:left-[256px]"
    />
  );
}
