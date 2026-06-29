# 実装計画: 認証・Web UI 追加

## 概要

Cognito User Pool による認証を追加し、start/stop task を API Gateway 経由で呼び出せるようにする。
Proxy の ALB にも Cognito 認証を設定し、タスク管理用の Web UI を S3 + CloudFront でデプロイする。

---

## 現状の構成

```
[ユーザー] → [ALB (HTTPS, 自己署名)] → [Proxy (Fargate)] → [code-server (Fargate)]
                                                  ↓
                                          [DynamoDB (user="dummy", ip, taskArn)]

[Lambda: runTask]  ← 直接呼び出し
[Lambda: stopTask] ← 直接呼び出し
```

---

## 変更後の構成

```
[Web UI (CloudFront + S3)]
    │ Cognito JWT
    ↓
[API Gateway (HTTP API, Cognito JWT Authorizer)]
    ├─ POST /tasks/start → runTask Lambda
    ├─ POST /tasks/stop  → stopTask Lambda
    └─ GET  /tasks/status → statusTask Lambda

[ユーザー] → [ALB (HTTPS, Cognito 認証)] → [Proxy (Fargate)] → [code-server (Fargate)]
                                                    ↓
                                    [DynamoDB (user=<Cognito sub>, ip, taskArn)]
```

---

## 変更点一覧

| 対象 | 変更内容 |
|------|----------|
| CDK: 新規 construct | `CognitoAuth` — User Pool / App Client / Domain |
| CDK: 新規 construct | `TaskApi` — HTTP API + Cognito Authorizer |
| CDK: 新規 construct | `WebHosting` — S3 + CloudFront |
| CDK: `TaskManager` | DynamoDB partition key の意味変更、statusTask Lambda 追加 |
| CDK: Stack | ALB リスナーに AuthenticateCognito アクション追加、Proxy 環境変数変更 |
| Lambda: `runTask` | sub をイベントコンテキストから取得 |
| Lambda: `stopTask` | sub をイベントコンテキストから取得 |
| Lambda: `statusTask` | 新規作成 — DynamoDB を sub で GetItem して返す |
| Proxy: `target.ts` | `TARGET_USER` 固定値をやめ、リクエストヘッダー `x-amzn-oidc-identity` から sub を読む |
| Web: `web/` | Cloudscape Design + Amplify v6 で認証 UI・ダッシュボードを実装 |

---

## 詳細設計

### 1. Cognito User Pool (`CognitoAuth` construct)

```
cdk/lib/constructs/cognito-auth.ts
```

- **UserPool**: メール/パスワード認証、セルフサービスサインアップ
- **UserPoolClient**: IMPLICIT や CODE フローではなく **Authorization Code + PKCE** を使用
  - `generateSecret: false`（SPA は secret 不要）
  - `oAuth.flows: { authorizationCodeGrant: true }`
  - callback URL / logout URL: CloudFront URL（CDK 内で参照渡し）+ `http://localhost:5173`（開発用）
  - ALB 用コールバック URL: `https://<alb-dns>/oauth2/idpresponse`
- **UserPoolDomain**: Cognito 提供のプレフィックスドメインを使用
  - `cognitoDomain: { domainPrefix: "cm-ecs-claude-code" }`（ユニークな値に要変更）

公開値（CDK Outputs）:
- `UserPoolId`
- `UserPoolClientId`
- `UserPoolDomain`

---

### 2. API Gateway (`TaskApi` construct)

```
cdk/lib/constructs/task-api.ts
```

- **HttpApi** (`@aws-cdk/aws-apigatewayv2-alpha` ではなく `aws-cdk-lib/aws-apigatewayv2`)
- **JWT Authorizer**: Cognito User Pool をトークン発行者として設定
  - `issuer: https://cognito-idp.<region>.amazonaws.com/<userPoolId>`
  - `audience: [userPoolClientId]`
- **ルート**:
  - `POST /tasks/start` → runTask Lambda integration
  - `POST /tasks/stop` → stopTask Lambda integration
  - `GET /tasks/status` → statusTask Lambda integration
- **CORS**: CloudFront URL + `http://localhost:5173` を許可

Lambda 側での sub 取得:
```typescript
const sub = event.requestContext.authorizer?.jwt?.claims?.sub as string;
```

CDK Output:
- `TaskApiUrl`

---

### 3. Lambda の変更

#### `runTask.ts`

- ハンドラーシグネチャを `APIGatewayProxyEventV2WithJWTAuthorizer` に変更
- `DUMMY_USER` を削除し、JWT claims から sub を取得
- DynamoDB PutItem の `user` キーに sub を使用

#### `stopTask.ts`

- 同様に sub を JWT claims から取得
- DynamoDB GetItem / DeleteItem のキーを sub に変更

#### `statusTask.ts`（新規）

```
cdk/lib/functions/statusTask.ts
```

- sub で DynamoDB GetItem
- アイテムが存在すれば `{ status: "running", taskArn, ip }` を返す
- 存在しなければ `{ status: "stopped" }` を返す
- Lambda は DynamoDB の `grantReadData` のみ付与

---

### 4. DynamoDB キーの変更

`TaskManager` construct 内の `table` の partition key は引き続き `user: STRING` のまま。
値が `"dummy"` から各ユーザーの Cognito sub（UUID 形式）に変わる。

**注意**: partition key の名前・型は変えないが、既存テーブルには "dummy" レコードが残る。
CDK `removalPolicy: DESTROY` のためデプロイ時にテーブルは再作成される（破壊的変更）。

---

### 5. ALB Cognito 認証

`CmEcsClaudeCodeStack` 内でプロキシサービスの ALB HTTPS リスナーに認証アクションを追加する。

```typescript
// HTTPS リスナーにデフォルトアクションとして AuthenticateCognito を設定
proxyService.listener.addAction("CognitoAuth", {
  priority: 1,
  conditions: [ListenerCondition.pathPatterns(["/*"])],
  action: new AuthenticateCognitoAction({
    userPool: cognitoAuth.userPool,
    userPoolClient: cognitoAuth.albClient, // ALB 専用クライアント
    userPoolDomain: cognitoAuth.userPoolDomain,
    next: ListenerAction.forward([proxyService.targetGroup]),
  }),
});
```

ALB Cognito 認証は ALB 専用の UserPoolClient が必要（`generateSecret: true`）。
Web 向けと ALB 向けで UserPoolClient を分ける。

ALB が Cognito 認証後にリクエストに付与するヘッダー:
- `x-amzn-oidc-identity`: sub（ユーザー識別子）
- `x-amzn-oidc-data`: JWT
- `x-amzn-oidc-access-token`: アクセストークン

---

### 6. Proxy の変更

#### `target.ts`

- `TARGET_USER` 環境変数での固定ユーザーをやめる
- `resolveTargetUrl(sub: string)` にシグネチャ変更
- キャッシュを `sub` 単位で保持（`Map<string, CacheEntry>`）

#### `index.ts`

- リクエストの `x-amzn-oidc-identity` ヘッダーから sub を取得
- sub を `resolveTargetUrl` に渡す
- sub が取得できない場合（ALB 認証を通過していない場合）は 401 を返す

Stack での環境変数 `TARGET_USER` は不要になるため削除する。

---

### 7. Web UI

```
web/src/
  main.tsx             — Amplify.configure、ルーティング
  pages/
    LoginPage.tsx      — 未認証時のログイン画面
    DashboardPage.tsx  — タスク状況・start/stop 操作
  components/
    TaskStatusCard.tsx — タスク状況表示
    ActionButtons.tsx  — start/stop ボタン
  lib/
    config.ts          — /config.json からランタイム設定を読む
    api.ts             — API Gateway 呼び出し（JWT 付与）
    auth.ts            — Amplify v6 Auth ラッパー
```

#### 使用ライブラリ

```
@cloudscape-design/components   — UI コンポーネント
@cloudscape-design/global-styles — グローバルスタイル（インストール済み）
aws-amplify                      — Cognito 認証（v6 モジュラー形式）
```

#### ランタイム設定

`/config.json` を実行時に fetch して設定を取得する（ビルド時に埋め込まない）。

```json
{
  "userPoolId": "ap-northeast-1_XXXXXX",
  "userPoolClientId": "XXXXXX",
  "userPoolDomain": "cm-ecs-claude-code.auth.ap-northeast-1.amazoncognito.com",
  "apiUrl": "https://XXXXXX.execute-api.ap-northeast-1.amazonaws.com",
  "proxyUrl": "https://<alb-dns>"
}
```

CDK の `BucketDeployment` で `config.json` を S3 バケットに配置する。

#### 画面設計

**ログイン画面 (`LoginPage`)**
- Cloudscape `ContentLayout` + `Container`
- メール/パスワードフォーム
- Amplify `signIn` を呼び出す
- エラー時は Cloudscape `Flashbar` で表示

**ダッシュボード (`DashboardPage`)**
- Cloudscape `AppLayout` + `TopNavigation`
- `TaskStatusCard`: タスク状態（停止中 / 起動中）をポーリング表示（10 秒間隔）
  - 停止中: `StatusIndicator type="stopped"`
  - 起動中: `StatusIndicator type="success"` + code-server へのリンク
- `ActionButtons`:
  - 起動中は「タスクを停止」ボタン
  - 停止中は「タスクを起動」ボタン
  - 処理中は `Button loading` 状態
- ログアウトボタン（TopNavigation のユーティリティアイテム）

---

### 8. S3 + CloudFront (`WebHosting` construct)

```
cdk/lib/constructs/web-hosting.ts
```

- **S3 Bucket**: パブリックアクセスブロック有効、OAC でのみアクセス許可
- **CloudFront Distribution**:
  - Origin: S3 バケット（OAC 使用）
  - デフォルトルート: `index.html`
  - エラーページ: 404 → `index.html`（SPA のクライアントサイドルーティング対応）
  - キャッシュ: `index.html` と `config.json` はキャッシュ無効化、静的アセットはキャッシュ有効
- **BucketDeployment**: CDK デプロイ時に `web/dist` を S3 に配置し、CloudFront キャッシュを無効化
- `config.json` は CDK が生成して BucketDeployment で配置

CDK Output:
- `WebUrl`: CloudFront URL（`https://XXXXXX.cloudfront.net`）

---

## 実装順序

1. **`CognitoAuth` construct 作成** — User Pool / 2 種の App Client / Domain
2. **`WebHosting` construct 作成** — S3 / CloudFront（`config.json` 生成含む）
3. **`TaskApi` construct 作成** — HTTP API / JWT Authorizer / CORS
4. **Lambda 更新** — `runTask`, `stopTask` を sub 対応に変更、`statusTask` 新規作成
5. **`TaskManager` 更新** — `statusTask` Lambda の追加、`TaskApi` への DynamoDB read 権限付与
6. **Stack 更新** — ALB Cognito 認証追加、Proxy 環境変数から `TARGET_USER` 削除
7. **Proxy 更新** — `target.ts` / `index.ts` を per-request sub 対応に変更
8. **Web UI 実装** — ログイン・ダッシュボード画面
9. **結合確認** — CDK デプロイ → 動作確認

---

## 注意事項

- **DynamoDB テーブルの再作成**: partition key の値が変わるだけで定義は同じだが、CDK が `RemovalPolicy.DESTROY` のためデプロイ時にテーブルを再作成する可能性はない。ただし既存の `"dummy"` レコードは不要になるため手動削除が必要。
- **ALB 用 App Client と Web 用 App Client の分離**: ALB は `generateSecret: true` が必要。Web（SPA）は `generateSecret: false`。
- **Cognito Domain のグローバルユニーク性**: `cognitoDomain.domainPrefix` はアカウント・リージョンをまたいでグローバルにユニークである必要があるため、衝突時は変更が必要。
- **自己署名証明書と ALB Cognito 認証の互換性**: ALB Cognito 認証は ACM の証明書が必要。自己署名証明書は ACM にインポート済みのため技術的には動作するが、ブラウザが証明書警告を表示する。本番環境では ACM パブリック証明書への切り替えを検討する。
- **CloudFront URL と Cognito Callback URL の循環参照**: CloudFront URL を Cognito App Client の callback URL に登録するが、CDK では `distribution.distributionDomainName` を参照することで循環なく設定できる。
