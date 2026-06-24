import * as ec2 from "aws-cdk-lib/aws-ec2";
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

    
	}
}
