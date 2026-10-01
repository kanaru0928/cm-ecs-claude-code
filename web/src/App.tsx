import { Hub } from 'aws-amplify/utils';
import { useEffect, useState } from 'react';
import { getAuthUser, type AuthUser } from './lib/auth.ts';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const checkAuth = () => {
      getAuthUser().then((u) => {
        setUser(u);
        setAuthState(u ? 'authenticated' : 'unauthenticated');
      });
    };

    checkAuth();

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
          checkAuth();
          break;
        case 'signInWithRedirect_failure':
          setAuthState('unauthenticated');
          break;
        case 'signedOut':
          setUser(null);
          setAuthState('unauthenticated');
          break;
      }
    });

    return unsubscribe;
  }, []);

  if (authState === 'loading') {
    return null;
  }

  if (authState === 'unauthenticated') {
    return <LoginPage />;
  }

  return <DashboardPage user={user!} onLogout={() => setAuthState('unauthenticated')} />;
}
