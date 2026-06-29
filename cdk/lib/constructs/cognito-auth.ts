import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";

type CognitoAuthProps = {
	webCallbackUrls: string[];
	webLogoutUrls: string[];
	albCallbackUrl: string;
};

export class CognitoAuth extends Construct {
	readonly userPool: cognito.UserPool;
	readonly webClient: cognito.UserPoolClient;
	readonly albClient: cognito.UserPoolClient;
	readonly userPoolDomain: cognito.UserPoolDomain;

	constructor(scope: Construct, id: string, props: CognitoAuthProps) {
		super(scope, id);

		const userPool = new cognito.UserPool(this, "UserPool", {
			selfSignUpEnabled: true,
			signInAliases: { email: true },
			autoVerify: { email: true },
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		const webClient = userPool.addClient("WebClient", {
			generateSecret: false,
			authFlows: { userSrp: true },
			oAuth: {
				flows: { authorizationCodeGrant: true },
				scopes: [
					cognito.OAuthScope.OPENID,
					cognito.OAuthScope.EMAIL,
					cognito.OAuthScope.PROFILE,
				],
				callbackUrls: props.webCallbackUrls,
				logoutUrls: props.webLogoutUrls,
			},
		});

		const albClient = userPool.addClient("AlbClient", {
			generateSecret: true,
			oAuth: {
				flows: { authorizationCodeGrant: true },
				scopes: [
					cognito.OAuthScope.OPENID,
					cognito.OAuthScope.EMAIL,
					cognito.OAuthScope.PROFILE,
				],
				callbackUrls: [props.albCallbackUrl],
				logoutUrls: props.webLogoutUrls,
			},
		});

		// cm-ecs-claude-code はグローバル一意である必要があるため、衝突時は変更が必要
		const userPoolDomain = userPool.addDomain("Domain", {
			cognitoDomain: { domainPrefix: "cm-ecs-claude-code" },
		});

		new cdk.CfnOutput(this, "UserPoolId", {
			value: userPool.userPoolId,
		});
		new cdk.CfnOutput(this, "UserPoolClientId", {
			value: webClient.userPoolClientId,
		});
		new cdk.CfnOutput(this, "UserPoolDomain", {
			value: userPoolDomain.domainName,
		});

		this.userPool = userPool;
		this.webClient = webClient;
		this.albClient = albClient;
		this.userPoolDomain = userPoolDomain;
	}
}
