import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type { CognitoAuth } from "./cognito-auth";

type TaskApiProps = {
	cognitoAuth: CognitoAuth;
	runTaskFn: lambda_nodejs.NodejsFunction;
	stopTaskFn: lambda_nodejs.NodejsFunction;
	statusTaskFn?: lambda_nodejs.NodejsFunction;
	corsAllowOrigins: string[];
};

export class TaskApi extends Construct {
	readonly httpApi: apigwv2.HttpApi;

	constructor(scope: Construct, id: string, props: TaskApiProps) {
		super(scope, id);

		const { cognitoAuth, runTaskFn, stopTaskFn, statusTaskFn, corsAllowOrigins } =
			props;

		const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
			corsPreflight: {
				allowOrigins: corsAllowOrigins,
				allowMethods: [apigwv2.CorsHttpMethod.ANY],
				allowHeaders: ["Authorization", "Content-Type"],
			},
		});

		const region = cdk.Stack.of(this).region;
		const authorizer = new HttpJwtAuthorizer(
			"CognitoAuthorizer",
			`https://cognito-idp.${region}.amazonaws.com/${cognitoAuth.userPool.userPoolId}`,
			{
				jwtAudience: [cognitoAuth.webClient.userPoolClientId],
			},
		);

		httpApi.addRoutes({
			path: "/tasks/start",
			methods: [apigwv2.HttpMethod.POST],
			integration: new HttpLambdaIntegration("StartIntegration", runTaskFn),
			authorizer,
		});

		httpApi.addRoutes({
			path: "/tasks/stop",
			methods: [apigwv2.HttpMethod.POST],
			integration: new HttpLambdaIntegration("StopIntegration", stopTaskFn),
			authorizer,
		});

		if (statusTaskFn) {
			httpApi.addRoutes({
				path: "/tasks/status",
				methods: [apigwv2.HttpMethod.GET],
				integration: new HttpLambdaIntegration("StatusIntegration", statusTaskFn),
				authorizer,
			});
		}

		new cdk.CfnOutput(this, "TaskApiUrl", {
			value: httpApi.apiEndpoint,
		});

		this.httpApi = httpApi;
	}
}
