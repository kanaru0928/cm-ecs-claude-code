import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib/core";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class SelfSignedCert extends Construct {
  readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const handler = new lambda_nodejs.NodejsFunction(this, "Handler", {
      entry: "lib/functions/selfSignedCert.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(1),
      bundling: { externalModules: ["@aws-sdk/*"], platform: "linux/arm64" },
      architecture: lambda.Architecture.ARM_64,
    });

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["acm:ImportCertificate", "acm:DeleteCertificate"],
        resources: ["*"],
      }),
    );

    const provider = new cr.Provider(this, "Provider", {
      onEventHandler: handler,
    });

    const resource = new cdk.CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
      properties: {
        Version: "2",
      },
    });

    this.certificate = acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      resource.getAttString("CertificateArn"),
    );
  }
}
