import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const TARGET_PORT = process.env.TARGET_PORT ?? "8080";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? "5000");

if (!TABLE_NAME) {
  throw new Error("TABLE_NAME is not set");
}

type CacheEntry = {
  url: string | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

/**
 * DynamoDB から転送先タスクの IP を取得し `http://<ip>:<port>` を返す。
 * 該当レコードや IP が無い場合は null を返す。
 * code-server は多数のリクエストを送るため、短い TTL でキャッシュする。
 */
export const resolveTargetUrl = async (sub: string): Promise<string | null> => {
  const now = Date.now();
  const cached = cache.get(sub);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const response = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { user: { S: sub } },
    }),
  );

  const ip = response.Item?.ip?.S;
  const url = ip ? `http://${ip}:${TARGET_PORT}` : null;

  cache.set(sub, { url, expiresAt: now + CACHE_TTL_MS });
  return url;
};
