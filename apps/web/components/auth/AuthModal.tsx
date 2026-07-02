'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@jobportal/ui';
import { Logo } from '../brand/Logo';
import { GoogleButton } from './GoogleButton';
import { OrDivider } from './OrDivider';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export type AuthTab = 'login' | 'register';

export interface AuthModalProps {
  open: boolean;
  /** Which tab is shown — controlled by the trigger (Sign in vs Register). */
  tab: AuthTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: AuthTab) => void;
  /** Whether the API has Google OAuth configured (drives button visibility). */
  googleEnabled: boolean;
}

// Tabbed auth popup (Sign in / Create account). Built on the shared Radix
// Dialog + Tabs primitives, so focus-trap, ESC, scroll-lock, keyboard tab
// nav and ARIA roles come for free. Flat brand styling only — navy active
// tab, zero gradients (owner directive 2026-06-20). Fully responsive: a
// gutter-inset card on phones, max-w-md centred on desktop, internal scroll
// on short viewports.
export function AuthModal({ open, tab, onOpenChange, onTabChange, googleEnabled }: AuthModalProps) {
  const router = useRouter();

  function handleLoginSuccess() {
    onOpenChange(false);
    // Signed in → land on the seeker dashboard, same as the Google OAuth
    // fallback for existing accounts. No router.refresh() here: scheduling a
    // refresh in the same tick can cancel the in-flight push (App Router
    // race — verified live), and it isn't needed anyway. /profile is
    // force-dynamic so it renders fresh with the new session, and Next 16's
    // client router cache keeps dynamic segments at staleTime 0, so back-nav
    // to "/" re-fetches the header state too.
    router.push('/profile');
  }

  function handleRegisterSuccess() {
    // Registration auto-logs the seeker in; RegisterForm navigates to
    // /onboarding. Just close the popup.
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim w-[calc(100%-2rem)] max-w-md gap-0 rounded-xl p-0 shadow-[var(--shadow-float)] sm:w-full max-h-[90dvh] overflow-y-auto">
        {/* Header: brand mark + a heading that tracks the active tab. Centered
            so the mark doesn't float awkwardly against left-aligned copy. */}
        <div className="flex flex-col items-center px-6 pt-6 text-center">
          <Logo variant="mark" className="h-8 w-auto" />
          <DialogTitle className="mt-4 text-xl font-semibold tracking-tight text-[var(--color-fg)]">
            {tab === 'login' ? 'Welcome back' : 'Create your account'}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {tab === 'login'
              ? 'Sign in to continue your job search.'
              : 'Start your job search on Career Queue.'}
          </DialogDescription>
        </div>

        <Tabs value={tab} onValueChange={(v) => onTabChange(v as AuthTab)} className="mt-5">
          <div className="px-6">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg p-1">
              <TabsTrigger
                value="login"
                className="rounded-md data-[state=active]:bg-[var(--color-primary-600)] data-[state=active]:text-white data-[state=active]:shadow-[var(--shadow-card)]"
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-md data-[state=active]:bg-[var(--color-primary-600)] data-[state=active]:text-white data-[state=active]:shadow-[var(--shadow-card)]"
              >
                Create account
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="login" className="mt-5 px-6 pb-6">
            {googleEnabled && (
              <>
                <GoogleButton label="Sign in with Google" />
                <OrDivider />
              </>
            )}
            <LoginForm idPrefix="modal-login" onSuccess={handleLoginSuccess} />
            <p className="mt-4 text-center text-sm text-[var(--color-fg-muted)]">
              <Link
                href="/forgot-password"
                onClick={() => onOpenChange(false)}
                className="transition-colors hover:text-[var(--color-fg)]"
              >
                Forgot password?
              </Link>
            </p>
          </TabsContent>

          <TabsContent value="register" className="mt-5 px-6 pb-6">
            {googleEnabled && (
              <>
                <GoogleButton label="Sign up with Google" />
                <OrDivider />
              </>
            )}
            <RegisterForm idPrefix="modal-register" onSuccess={handleRegisterSuccess} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
