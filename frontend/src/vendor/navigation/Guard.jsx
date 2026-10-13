import { Loading } from '@/mobile/ui';
import { Redirect, RedirectAfterLogin } from '@/mobile/nav';
import { useAuth } from '../auth/AuthContext';

const isOnboarding = (account) => ['onboarding', 'rejected'].includes(account?.status);

/**
 * Web version of the conditional stack in apps/vendor/src/navigation/RootNavigator.jsx:
 * hosts still onboarding (or rejected) get Onboarding instead of the tabs; onboarding steps and
 * help screens are always reachable once signed in.
 */
export function Guard({ access = 'approved', children }) {
  const { status, account } = useAuth();
  if (status === 'restoring') return <Loading />;
  if (access === 'public') return children;
  if (status === 'signedOut') return access === 'guest' ? children : <Redirect to="Phone" rememberNext />;
  if (access === 'guest') return <RedirectAfterLogin fallback={isOnboarding(account) ? 'Onboarding' : 'Main'} />;
  if (access === 'onboarding') return children;
  if (access === 'onboardingOnly') return isOnboarding(account) ? children : <Redirect to="Main" />;
  return isOnboarding(account) ? <Redirect to="Onboarding" /> : children;
}
