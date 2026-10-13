import { Loading } from '@/mobile/ui';
import { Redirect, RedirectAfterLogin } from '@/mobile/nav';
import { useAuth } from '../auth/AuthContext';

/**
 * Web version of the conditional stacks in apps/user/src/navigation/RootNavigator.jsx:
 *   restoring → spinner; signed out → only guest/public screens; signed in without a completed
 *   profile → ProfileSetup (+ public pages); otherwise everything except the guest screens.
 */
export function Guard({ name, access = 'auth', children }) {
  const { status, account } = useAuth();
  if (status === 'restoring') return <Loading />;
  if (access === 'public') return children;
  if (status === 'signedOut') return access === 'guest' ? children : <Redirect to="Phone" rememberNext />;
  if (access === 'guest') return <RedirectAfterLogin fallback="Main" />;
  const needsProfile = !account?.profileCompleted;
  if (needsProfile && name !== 'ProfileSetup') return <Redirect to="ProfileSetup" />;
  if (!needsProfile && name === 'ProfileSetup') return <Redirect to="Main" />;
  return children;
}
