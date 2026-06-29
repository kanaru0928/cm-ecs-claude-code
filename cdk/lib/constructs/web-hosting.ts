import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";

export class WebHosting extends Construct {
	readonly distribution: cloudfront.Distribution;
	readonly bucket: s3.Bucket;

	constructor(scope: Construct, id: string) {
		super(scope, id);

		const bucket = new s3.Bucket(this, "WebBucket", {
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		const distribution = new cloudfront.Distribution(this, "Distribution", {
			defaultBehavior: {
				origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
			},
			defaultRootObject: "index.html",
			errorResponses: [
				{
					httpStatus: 404,
					responseHttpStatus: 200,
					responsePagePath: "/index.html",
				},
			],
		});

		new cdk.CfnOutput(this, "WebUrl", {
			value: `https://${distribution.distributionDomainName}`,
		});

		this.distribution = distribution;
		this.bucket = bucket;
	}

	// Stack 全体の construct 生成後に呼び出す。
	// web/dist は事前に npm run build で生成しておく必要がある。
	deployAssets(config: Record<string, string>): void {
		new s3deploy.BucketDeployment(this, "DeployWeb", {
			sources: [
				s3deploy.Source.asset("../web/dist"),
				s3deploy.Source.jsonData("config.json", config),
			],
			destinationBucket: this.bucket,
			distribution: this.distribution,
			distributionPaths: ["/*"],
		});
	}
}
