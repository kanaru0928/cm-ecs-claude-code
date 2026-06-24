import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const TARGET_USER = process.env.TARGET_USER ?? "dummy";
const TARGET_PORT = process.env.TARGET_PORT ?? "8080";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? "5000");

if (!TABLE_NAME) {
  throw new Error("TABLE_NAME is not set");
}

type CacheEntry = {
  url: string | null;
  expiresAt: number;
};

let cache: CacheEntry | undefined;

/**
 * DynamoDB から転送先タスクの IP を取得し `http://<ip>:<port>` を返す。
 * 該当レコードや IP が無い場合は null を返す。
 * code-server は多数のリクエストを送るため、短い TTL でキャッシュする。
 */
export const resolveTargetUrl = async (): Promise<string | null> => {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.url;
  }

  const response = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { user: { S: TARGET_USER } },
    }),
  );

  const ip = response.Item?.ip?.S;
  const url = ip ? `http://${ip}:${TARGET_PORT}` : null;

  cache = { url, expiresAt: now + CACHE_TTL_MS };
  return url;
};
