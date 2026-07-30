'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NavigationProgress, isSameDocumentNav, notifyNavStart } from '@jobportal/ui';

// Thin Next-aware wrapper around the shared NavigationProgress (packages/ui
// has no `next` dependency, so the router hooks live here).
//
// Two jobs:
//   1. Feed the committed route key (pathname + search) down — when it
//      changes, the pending navigation is done.
//   2. Patch router.push/replace so PROGRAMMATIC navigations (SRP filters,
//      sort selects, the header search, pagination) signal the loader too —
//      the document click listener only sees anchors. The patch is on the
//      shared AppRouterInstance (one object app-wide), symbol-guarded so
//      double-mounting in dev StrictMode cannot stack wrappers, and NOT
//      applied to router.refresh(): a refresh never changes the route key,
//      so the veil would hang until the failsafe.
//
// Mounted from the root layout inside <Suspense fallback={null}> —
// useSearchParams() would otherwise force CSR bailout on static routes.

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
    // Same-URL guard: a push to the URL already on screen (search re-submitted
    // unchanged, a notification linking to the open page) never changes the
    // route key, so signalling it would strand the veil until the failsafe.
    // isSameDocumentNav reads window.location AT CALL TIME — the patch
    // installs once, so closing over hook values would go stale.
    r.push = (...args: Parameters<typeof origPush>) => {
      if (!isSameDocumentNav(String(args[0]))) notifyNavStart();
      return origPush(...args);
    };
    r.replace = (...args: Parameters<typeof origReplace>) => {
      if (!isSameDocumentNav(String(args[0]))) notifyNavStart();
      return origReplace(...args);
    };
    // No unpatch on cleanup: the root layout never unmounts, and the machine
    // behind the bus tolerates signals with no listener.
  }, [router]);

  return <NavigationProgress routeKey={`${pathname}?${searchParams.toString()}`} />;
}
