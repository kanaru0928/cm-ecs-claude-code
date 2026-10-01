import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { TaskStatus } from '../lib/api';

type Props = {
  status: TaskStatus | null;
  actionLoading: boolean;
  onStart: () => void;
  onStop: () => void;
};

export default function ActionButtons({ status, actionLoading, onStart, onStop }: Props) {
  const isRunning = status?.status === 'running';
  const isStatusUnknown = status === null;

  return (
    <SpaceBetween size="s" direction="horizontal">
      <Button
        variant="primary"
        onClick={onStart}
        loading={actionLoading && !isRunning}
        disabled={isRunning || isStatusUnknown || actionLoading}
      >
        タスクを起動
      </Button>
      <Button
        variant="normal"
        onClick={onStop}
        loading={actionLoading && isRunning}
        disabled={!isRunning || actionLoading}
      >
        タスクを停止
      </Button>
    </SpaceBetween>
  );
}
