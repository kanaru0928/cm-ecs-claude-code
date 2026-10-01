import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { login } from '../lib/auth';

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
      <div style={{ width: '400px' }}>
        <Container header={<Header variant="h2">ログイン</Header>}>
          <SpaceBetween size="m">
            <Button variant="primary" onClick={() => login()}>
              ログイン
            </Button>
          </SpaceBetween>
        </Container>
      </div>
    </div>
  );
}
