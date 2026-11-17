import {
  CfnOutput,
  RemovalPolicy,
  Stack,
  type StackProps,
  Tags
} from 'aws-cdk-lib'
import { SecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2'
import { FileSystem, ThroughputMode } from 'aws-cdk-lib/aws-efs'
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'
import { env } from '../utils/config'

interface EfsStackProps extends StackProps {
  vpc: Vpc
}

// Shared file system; each service mounts it through its own access point
export class EfsStack extends Stack {
  fileSystem: FileSystem
  constructor(scope: Construct, id: string, props: EfsStackProps) {
    super(scope, id, props)

    const isProd = env.STAGE === 'prod'
    const { vpc } = props

    const efsSg = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      securityGroupName: 'dga-efs-sg',
      description: 'efs mount targets',
      allowAllOutbound: true
    })
    Tags.of(efsSg).add('Name', 'dga-efs-sg')

    const fileSystem = new FileSystem(this, 'FileSystem', {
      vpc,
      securityGroup: efsSg,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      fileSystemName: 'dga-efs',
      encrypted: true,
      throughputMode: ThroughputMode.ELASTIC,
      enableAutomaticBackups: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    })
    // No resources: the policy is inline on the file system, referencing its ARN is circular
    fileSystem.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyInsecureTransport',
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ['*'],
        conditions: { Bool: { 'aws:SecureTransport': 'false' } }
      })
    )

    new CfnOutput(this, 'FileSystemId', { value: fileSystem.fileSystemId })

    this.fileSystem = fileSystem
  }
}
