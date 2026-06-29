import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cdk from "aws-cdk-lib/core";
import type { Construct } from "constructs";
import { CodeServerCluster } from "./constructs/code-server-cluster";
import { SelfSignedCert } from "./constructs/self-signed-cert";
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

		const selfSignedCert = new SelfSignedCert(this, "SelfSignedCert");

		const proxyService = new ecs_patterns.ApplicationLoadBalancedFargateService(
			this,
			"ProxyService",
			{
				certificate: selfSignedCert.certificate,
				protocol: elbv2.ApplicationProtocol.HTTPS,
				redirectHTTP: true,
				desiredCount: 1,
				taskImageOptions: {
					image: ecs.ContainerImage.fromAsset("../", {
						file: "proxy/Dockerfile",
						platform: ecr_assets.Platform.LINUX_ARM64,
					}),
					environment: {
						TABLE_NAME: taskManager.taskTable.tableName,
						TARGET_USER: "dummy",
						TARGET_PORT: "8080",
						CACHE_TTL_MS: "5000",
					},
					containerPort: 3000,
				},
				circuitBreaker: {
					enable: true,
				},
				minHealthyPercent: 50,
				vpc: vpc,
				assignPublicIp: true,
				runtimePlatform: {
					cpuArchitecture: ecs.CpuArchitecture.ARM64,
					operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
				},
			},
		);

		proxyService.targetGroup.configureHealthCheck({
			path: "/health",
		});

		proxyService.loadBalancer.setAttribute(
			"idle_timeout.timeout_seconds",
			"3600",
		);

		taskManager.taskTable.grantReadData(proxyService.taskDefinition.taskRole);

		taskManager.taskSecurityGroup.connections.allowFrom(
			proxyService.service.connections,
			ec2.Port.tcp(8080),
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

		new cdk.CfnOutput(this, "CertificateArn", {
			value: selfSignedCert.certificate.certificateArn,
			description: "The ARN of the self-signed certificate in ACM.",
		});
	}
}
