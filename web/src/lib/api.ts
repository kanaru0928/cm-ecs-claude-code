import { getIdToken } from './auth';
import { getConfig } from './config';

export type TaskStatus =
  | { status: 'stopped' }
  | { status: 'running'; taskArn: string; ip: string };

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getIdToken();
  const { apiUrl } = getConfig();
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

export async function getTaskStatus(): Promise<TaskStatus> {
  const res = await authFetch('/tasks/status');
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json() as Promise<TaskStatus>;
}

export async function startTask(): Promise<void> {
  const res = await authFetch('/tasks/start', { method: 'POST' });
  if (!res.ok) throw new Error(`Start task failed: ${res.status}`);
}

export async function stopTask(): Promise<void> {
  const res = await authFetch('/tasks/stop', { method: 'POST' });
  if (!res.ok) throw new Error(`Stop task failed: ${res.status}`);
}
