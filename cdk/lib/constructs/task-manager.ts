import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";

type TaskManagerProps = {
	clusterArn: string;
	taskDefinition: ecs.FargateTaskDefinition;
	vpc: ec2.IVpc;
};

export class TaskManager extends Construct {
	readonly runTaskFn: lambda_nodejs.NodejsFunction;
	readonly stopTaskFn: lambda_nodejs.NodejsFunction;
	readonly taskTable: dynamodb.Table;
	readonly taskSecurityGroup: ec2.SecurityGroup;

	constructor(scope: Construct, id: string, props: TaskManagerProps) {
		super(scope, id);

		if (!props.taskDefinition.executionRole) {
			throw new Error("Execution role is not defined for the task definition.");
		}

		const table = new dynamodb.Table(this, "MyTaskTable", {
			partitionKey: { name: "user", type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		const taskSecurityGroup = new ec2.SecurityGroup(this, "TaskSecurityGroup", {
			vpc: props.vpc,
		});

		const runTaskFn = new lambda_nodejs.NodejsFunction(
			this,
			"RunTaskFunction",
			{
				entry: "lib/functions/runTask.ts",
				runtime: lambda.Runtime.NODEJS_22_X,
				timeout: cdk.Duration.minutes(2),
				bundling: { externalModules: ["@aws-sdk/*"], platform: "linux/arm64" },
				environment: {
					CLUSTER_ARN: props.clusterArn,
					TASK_DEFINITION_ARN: props.taskDefinition.taskDefinitionArn,
					SUBNET_IDS: props.vpc.publicSubnets.map((s) => s.subnetId).join(","),
					SECURITY_GROUP_IDS: taskSecurityGroup.securityGroupId,
					TABLE_NAME: table.tableName,
				},
				architecture: lambda.Architecture.ARM_64,
			},
		);

		table.grantWriteData(runTaskFn);
		runTaskFn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["ecs:RunTask"],
				resources: [props.taskDefinition.taskDefinitionArn],
			}),
		);
		runTaskFn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["ecs:DescribeTasks"],
				resources: ["*"],
			}),
		);
		runTaskFn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["iam:PassRole"],
				resources: [
					props.taskDefinition.executionRole.roleArn,
					props.taskDefinition.taskRole.roleArn,
				],
			}),
		);

		const stopTaskFn = new lambda_nodejs.NodejsFunction(
			this,
			"StopTaskFunction",
			{
				entry: "lib/functions/stopTask.ts",
				runtime: lambda.Runtime.NODEJS_22_X,
				timeout: cdk.Duration.minutes(2),
				bundling: { externalModules: ["@aws-sdk/*"], platform: "linux/arm64" },
				environment: {
					CLUSTER_ARN: props.clusterArn,
					TABLE_NAME: table.tableName,
				},
				architecture: lambda.Architecture.ARM_64,
			},
		);

		table.grantReadWriteData(stopTaskFn);
		stopTaskFn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["ecs:StopTask"],
				resources: ["*"],
			}),
		);

		this.runTaskFn = runTaskFn;
		this.stopTaskFn = stopTaskFn;
		this.taskTable = table;
		this.taskSecurityGroup = taskSecurityGroup;
	}
}
