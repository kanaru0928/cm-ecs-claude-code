import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as cdk from "aws-cdk-lib/core";
import type { Construct } from "constructs";
import { CodeServerCluster } from "./constructs/code-server-cluster";
import { TaskManager } from "./constructs/task-manager";

export class CmEcsClaudeCodeStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const vpc = new ec2.Vpc(this, "MyVpc", {
			maxAzs: 2,
		});

		const codeServer = new CodeServerCluster(this, "CodeServerCluster", {
			vpc: vpc,
		});

		if (!codeServer.taskDefinition.executionRole) {
			throw new Error("Execution role is not defined for the task definition.");
		}

		const taskManager = new TaskManager(this, "TaskManager", {
			clusterArn: codeServer.cluster.clusterArn,
			taskDefinition: codeServer.taskDefinition,
			vpc: vpc,
		});

		const proxyService = new ecs_patterns.ApplicationLoadBalancedFargateService(
			this,
			"ProxyService",
			{
				desiredCount: 1,
				taskImageOptions: {
					image: ecs.ContainerImage.fromAsset("../", {
            file: "proxy/Dockerfile",
          }),
				},
				circuitBreaker: {
					enable: true,
				},
        minHealthyPercent: 50,
			},
		);

		new cdk.CfnOutput(this, "RunTaskFunctionName", {
			value: taskManager.runTaskFn.functionName,
			description: "The name of the Lambda function to run tasks.",
		});
		new cdk.CfnOutput(this, "StopTaskFunctionName", {
			value: taskManager.stopTaskFn.functionName,
			description: "The name of the Lambda function to stop tasks.",
		});

		new cdk.CfnOutput(this, "ProxyServiceURL", {
			value: proxyService.loadBalancer.loadBalancerDnsName,
			description: "The URL of the proxy service.",
		});
	}
}
