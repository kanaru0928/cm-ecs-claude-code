import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CmEcsClaudeCodeStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const vpc = new ec2.Vpc(this, "MyVpc", {
			maxAzs: 2,
		});

		new ecs.Cluster(this, "MyCluster", {
			vpc: vpc,
		});

		const taskDefinition = new ecs.FargateTaskDefinition(
			this,
			"MyTaskDefinition",
			{
				memoryLimitMiB: 1024,
				cpu: 512,
			},
		);

		const codeServer = taskDefinition.addContainer("MyContainer", {
			image: ecs.ContainerImage.fromAsset("lib/containers/code-server"),
			logging: ecs.LogDrivers.awsLogs({ streamPrefix: "MyApp" }),
		});
		codeServer.addPortMappings({
			containerPort: 8080,
		});

		new dynamodb.Table(this, "MyTaskTable", {
			partitionKey: { name: "user", type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
		});
	}
}
