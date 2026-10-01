import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth';

export type AuthUser = {
  username: string;
  userId: string;
};

export async function login(): Promise<void> {
  await signInWithRedirect();
}

export async function logout(): Promise<void> {
  await signOut();
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const user = await getCurrentUser();
    return { username: user.username, userId: user.userId };
  } catch {
    return null;
  }
}

export async function getIdToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('No ID token available');
  return token;
}
