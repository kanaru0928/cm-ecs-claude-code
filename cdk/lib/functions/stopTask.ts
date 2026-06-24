import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";

const ecs = new ECSClient({});
const dynamo = new DynamoDBClient({});

const DUMMY_USER = "dummy";

export const handler = async () => {
  const getResponse = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { user: { S: DUMMY_USER } },
    }),
  );

  const taskArn = getResponse.Item?.taskArn?.S;
  if (!taskArn) {
    throw new Error("No running task found");
  }

  await ecs.send(
    new StopTaskCommand({
      cluster: process.env.CLUSTER_ARN,
      task: taskArn,
    }),
  );

  await dynamo.send(
    new DeleteItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { user: { S: DUMMY_USER } },
    }),
  );

  return { stopped: taskArn };
};
