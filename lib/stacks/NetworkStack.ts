import { CfnOutput, Stack, Tags, type StackProps } from 'aws-cdk-lib'
import {
  GatewayVpcEndpointAwsService,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IpAddresses,
  IpProtocol,
  NatProvider,
  NatTrafficDirection,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc
} from 'aws-cdk-lib/aws-ec2'
import type { Construct } from 'constructs'
import { context, env } from '../utils/config'

export class NetworkStack extends Stack {
  vpc: Vpc
  cloudShellSg: SecurityGroup
  bastionHostSg: SecurityGroup
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    const natInstanceProvider =
      env.STAGE === 'prod'
        ? undefined
        : NatProvider.instanceV2({
            instanceType: InstanceType.of(
              InstanceClass.BURSTABLE3,
              InstanceSize.MICRO
            ),
            defaultAllowedTraffic: NatTrafficDirection.OUTBOUND_ONLY
          })

    const vpc = new Vpc(this, 'Vpc', {
      vpcName: 'dga-vpc',
      ipAddresses: IpAddresses.cidr(context.network.vpcCidr),
      ipProtocol: IpProtocol.IPV4_ONLY,
      createInternetGateway: true,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGatewayProvider: natInstanceProvider ?? NatProvider.gateway(),
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 19
        },
        { name: 'public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: 'isolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ]
    })

    if (natInstanceProvider) {
      natInstanceProvider.connections.allowFrom(
        Peer.ipv4(vpc.vpcCidrBlock),
        Port.allTraffic(),
        'From inside the VPC'
      )
      Tags.of(natInstanceProvider.securityGroup).add('Name', 'dga-nat-sg')
    }

    vpc.privateSubnets.forEach((subnet) => {
      const az = subnet.availabilityZone.split('-')[2]
      if (az) {
        Tags.of(subnet).add('Name', `private-${az}`)
      }
    })

    vpc.isolatedSubnets.forEach((subnet) => {
      const az = subnet.availabilityZone.split('-')[2]
      if (az) {
        Tags.of(subnet).add('Name', `isolated-${az}`)
      }
    })

    vpc.publicSubnets.forEach((subnet) => {
      const az = subnet.availabilityZone.split('-')[2]
      if (az) {
        Tags.of(subnet).add('Name', `public-${az}`)
      }
    })

    vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3
    })

    const cloudShellSg = new SecurityGroup(this, 'CloudShellSecurityGroup', {
      vpc,
      securityGroupName: 'dga-cloudshell-sg',
      description: 'cloudshell vpc environment',
      allowAllOutbound: true
    })
    Tags.of(cloudShellSg).add('Name', 'dga-cloudshell-sg')

    const bastionHostSg = new SecurityGroup(this, 'BastionHostSecurityGroup', {
      vpc,
      securityGroupName: 'dga-bastion-host-sg',
      description: 'bastion host',
      allowAllOutbound: true
    })
    Tags.of(bastionHostSg).add('Name', 'dga-bastion-host-sg')

    new CfnOutput(this, 'VpcId', { value: vpc.vpcId })

    this.vpc = vpc
    this.cloudShellSg = cloudShellSg
    this.bastionHostSg = bastionHostSg
  }
}
