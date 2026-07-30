'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NavigationProgress, isSameDocumentNav, notifyNavStart } from '@jobportal/ui';

// Thin Next-aware wrapper around the shared NavigationProgress — the recruiter
// portal variant. Mirrors apps/web's wrapper (apps cannot import each other's
// components); the differences are the veil variant and where it mounts:
//
//   · variant="pane" + md:left-[256px]: a 100% OPAQUE white veil covering only
//     the content pane, so the fixed navy rail stays crisp — a translucent
//     veil ghosting the rail reads as a compositing bug, not a loading state
//     (design-review decision). Below md the rail is hidden and the veil
//     covers the full viewport.
//   · Mounted from the (authed) layout, not the root: the offset IS the authed
//     shell's geometry. /login ↔ /register navs are static, sub-250ms routes —
//     under the loader's show threshold — so leaving them uncovered loses
//     nothing.
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
    // Same-URL guard: a push to the URL already on screen (a notification
    // linking to the open page, a filter re-submitted unchanged) never changes
    // the route key, so signalling it would strand the veil until the
    // failsafe. isSameDocumentNav reads window.location AT CALL TIME.
    r.push = (...args: Parameters<typeof origPush>) => {
      if (!isSameDocumentNav(String(args[0]))) notifyNavStart();
      return origPush(...args);
    };
    r.replace = (...args: Parameters<typeof origReplace>) => {
      if (!isSameDocumentNav(String(args[0]))) notifyNavStart();
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
