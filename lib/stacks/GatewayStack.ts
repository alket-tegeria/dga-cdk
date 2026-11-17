import { CfnOutput, Duration, Stack, type StackProps, Tags } from 'aws-cdk-lib'
import {
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  type Vpc
} from 'aws-cdk-lib/aws-ec2'
import {
  type ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ListenerAction
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import type { Construct } from 'constructs'

interface GatewayStackProps extends StackProps {
  vpc: Vpc
}

// Internal ALB, reached only through the CloudFront VPC origin; apps attach rules to the exported listener
export class GatewayStack extends Stack {
  alb: ApplicationLoadBalancer
  albListener: ApplicationListener
  albSecurityGroup: SecurityGroup
  constructor(scope: Construct, id: string, props: GatewayStackProps) {
    super(scope, id, props)

    const { vpc } = props

    const albName = 'dga-internal-alb'

    const albSecurityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      securityGroupName: `${albName}-sg`,
      description: 'internal alb fronted by CloudFront',
      allowAllOutbound: true
    })
    Tags.of(albSecurityGroup).add('Name', `${albName}-sg`)
    albSecurityGroup.addIngressRule(
      Peer.ipv4(vpc.vpcCidrBlock),
      Port.tcp(80),
      'http from vpc'
    )

    const alb = new ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      loadBalancerName: albName,
      internetFacing: false,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      idleTimeout: Duration.seconds(300),
      dropInvalidHeaderFields: true,
      deletionProtection: false
    })

    // TLS terminates at CloudFront
    const albListener = alb.addListener('Listener', {
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      open: false,
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found'
      })
    })

    this.exportValue(albListener.listenerArn)

    new CfnOutput(this, 'AlbDns', { value: alb.loadBalancerDnsName })
    new CfnOutput(this, 'AlbListenerArn', { value: albListener.listenerArn })

    this.alb = alb
    this.albListener = albListener
    this.albSecurityGroup = albSecurityGroup
  }
}
