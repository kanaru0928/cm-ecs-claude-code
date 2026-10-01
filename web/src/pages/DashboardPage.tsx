import { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Flashbar from '@cloudscape-design/components/flashbar';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { getTaskStatus, startTask, stopTask, type TaskStatus } from '../lib/api';
import { logout, type AuthUser } from '../lib/auth';
import ActionButtons from '../components/ActionButtons';
import TaskStatusCard from '../components/TaskStatusCard';

const POLL_INTERVAL_MS = 10_000;

type Props = {
  user: AuthUser;
  onLogout: () => void;
};

export default function DashboardPage({ user, onLogout }: Props) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getTaskStatus();
      setStatus(s);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ステータスの取得に失敗しました');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleStart = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await startTask();
      await fetchStatus();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'タスクの起動に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await stopTask();
      await fetchStatus();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'タスクの停止に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <>
      <div id="topnav">
        <TopNavigation
          identity={{ href: '#', title: 'cm-ecs-claude-code' }}
          utilities={[
            {
              type: 'menu-dropdown',
              text: user.username,
              items: [{ id: 'logout', text: 'ログアウト' }],
              onItemClick: ({ detail }) => {
                if (detail.id === 'logout') handleLogout();
              },
            },
          ]}
        />
      </div>
      <AppLayout
        headerSelector="#topnav"
        toolsHide
        navigationHide
        content={
          <ContentLayout header={<Header variant="h1">タスク管理</Header>}>
            <SpaceBetween size="m">
              {errorMessage && (
                <Flashbar
                  items={[
                    {
                      type: 'error',
                      content: errorMessage,
                      dismissible: true,
                      onDismiss: () => setErrorMessage(null),
                    },
                  ]}
                />
              )}
              <TaskStatusCard status={status} loading={statusLoading} />
              <ActionButtons
                status={status}
                actionLoading={actionLoading}
                onStart={handleStart}
                onStop={handleStop}
              />
            </SpaceBetween>
          </ContentLayout>
        }
      />
    </>
  );
}
