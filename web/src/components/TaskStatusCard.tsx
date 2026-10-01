import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { getConfig } from '../lib/config';
import type { TaskStatus } from '../lib/api';

type Props = {
  status: TaskStatus | null;
  loading: boolean;
};

export default function TaskStatusCard({ status, loading }: Props) {
  const renderStatus = () => {
    if (loading && !status) {
      return <StatusIndicator type="loading">読み込み中...</StatusIndicator>;
    }
    if (!status || status.status === 'stopped') {
      return <StatusIndicator type="stopped">停止中</StatusIndicator>;
    }
    return (
      <SpaceBetween size="s" direction="vertical">
        <StatusIndicator type="success">起動中</StatusIndicator>
        <Link href={getConfig().proxyUrl} external>
          code-server を開く
        </Link>
      </SpaceBetween>
    );
  };

  return (
    <Container header={<Header variant="h2">タスク状態</Header>}>
      {renderStatus()}
    </Container>
  );
}
