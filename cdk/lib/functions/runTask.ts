import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

const ecs = new ECSClient({});
const dynamo = new DynamoDBClient({});

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!sub) return { statusCode: 401, body: "Unauthorized" };

  const runResponse = await ecs.send(
    new RunTaskCommand({
      cluster: process.env.CLUSTER_ARN,
      taskDefinition: process.env.TASK_DEFINITION_ARN,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: process.env.SUBNET_IDS!.split(","),
          securityGroups: process.env.SECURITY_GROUP_IDS!.split(","),
          assignPublicIp: "DISABLED",
        },
      },
    }),
  );

  const task = runResponse.tasks?.[0];
  if (!task?.taskArn) {
    throw new Error("Task failed to start");
  }

  let ip: string | undefined;
  for (let i = 0; i < 30; i++) {
    const describeResponse = await ecs.send(
      new DescribeTasksCommand({
        cluster: process.env.CLUSTER_ARN,
        tasks: [task.taskArn],
      }),
    );

    const eniAttachment = describeResponse.tasks?.[0]?.attachments?.find(
      (a) => a.type === "ElasticNetworkInterface",
    );
    ip = eniAttachment?.details?.find(
      (d) => d.name === "privateIPv4Address",
    )?.value;

    if (ip) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!ip) {
    throw new Error("Could not retrieve task IP within timeout");
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        user: { S: sub },
        ip: { S: ip },
        taskArn: { S: task.taskArn },
      },
    }),
  );

  return { statusCode: 200, body: JSON.stringify({ taskArn: task.taskArn, ip }) };
};
