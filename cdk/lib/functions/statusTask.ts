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

  const task = describeResponse.tasks?.[0];
  if (task?.lastStatus === "RUNNING") {
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
