import * as ecs from "aws-cdk-lib/aws-ecs";
import type * as ec2 from "aws-cdk-lib/aws-ec2";

import { Construct } from "constructs";

type CodeServerClusterProps = {
  vpc: ec2.IVpc;
};

export class CodeServerCluster extends Construct {
  readonly cluster: ecs.Cluster;
  readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: Construct, id: string, props: CodeServerClusterProps) {
    super(scope, id);
    const cluster = new ecs.Cluster(this, "MyCluster", {
      vpc: props.vpc,
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

    this.cluster = cluster;
    this.taskDefinition = taskDefinition;
  }
}
