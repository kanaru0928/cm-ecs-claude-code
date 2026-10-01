import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DescribeTasksCommand, ECSClient } from "@aws-sdk/client-ecs";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

const dynamo = new DynamoDBClient({});
const ecs = new ECSClient({});

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub as string;
  if (!sub) return { statusCode: 401, body: "Unauthorized" };

  const getResponse = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { user: { S: sub } },
    }),
  );

  if (!getResponse.Item) {
    return { statusCode: 200, body: JSON.stringify({ status: "stopped" }) };
  }

  const taskArn = getResponse.Item.taskArn?.S;
  const ip = getResponse.Item.ip?.S;

  const describeResponse = await ecs.send(
    new DescribeTasksCommand({
      cluster: process.env.CLUSTER_ARN,
      tasks: [taskArn!],
    }),
  );

  // PROVISIONING / PENDING などの起動中も稼働扱いにする。
  // 起動直後に停止扱いでレコードを削除すると、状態を復元できなくなるため。
  const stoppedStatuses = ["DEACTIVATING", "STOPPING", "DEPROVISIONING", "STOPPED"];
  const task = describeResponse.tasks?.[0];
  const isStopped =
    !task ||
    task.desiredStatus === "STOPPED" ||
    stoppedStatuses.includes(task.lastStatus ?? "");

  if (!isStopped) {
    return {
      statusCode: 200,
      body: JSON.stringify({ status: "running", taskArn, ip }),
    };
  }

  // タスクが停止している場合は DynamoDB のレコードを削除して同期する
  await dynamo.send(
    new DeleteItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { user: { S: sub } },
    }),
  );

  return { statusCode: 200, body: JSON.stringify({ status: "stopped" }) };
};
