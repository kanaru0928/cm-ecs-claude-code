import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import '@cloudscape-design/global-styles/index.css';
import './index.css';
import App from './App.tsx';
import { loadConfig } from './lib/config.ts';

async function init() {
  const config = await loadConfig();

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: {
          email: true,
          oauth: {
            domain: `${config.userPoolDomain}.auth.${config.region}.amazoncognito.com`,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [window.location.origin],
            redirectSignOut: [window.location.origin],
            responseType: 'code',
          },
        },
      },
    },
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

init().catch(() => {
  document.body.textContent = 'アプリケーションの初期化に失敗しました。';
});
