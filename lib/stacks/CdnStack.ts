import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import {
  Certificate,
  type ICertificate
} from 'aws-cdk-lib/aws-certificatemanager'
import {
  AllowedMethods,
  CachedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  OriginSslPolicy,
  PriceClass,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront'
import { VpcOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import type { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import type { Construct } from 'constructs'
import { context } from '../utils/config'

interface CdnStackProps extends StackProps {
  alb: ApplicationLoadBalancer
}

export class CdnStack extends Stack {
  distribution: Distribution
  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props)

    const name = 'dga-cdn'

    let certificate: ICertificate | undefined = undefined
    let domainNames: string[] | undefined = undefined

    if (context.cdn && context.cdn.domainNames.length > 0) {
      certificate = Certificate.fromCertificateArn(
        this,
        'Certificate',
        context.cdn.certificateArn
      )
      domainNames = context.cdn.domainNames
    }
    // CloudFront reaches the internal ALB through ENIs inside the VPC
    const origin = VpcOrigin.withApplicationLoadBalancer(props.alb, {
      vpcOriginName: `${name}-alb-origin`,
      httpPort: 80,
      httpsPort: 443,
      protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
      originSslProtocols: [OriginSslPolicy.TLS_V1_2],
      readTimeout: Duration.seconds(60),
      keepaliveTimeout: Duration.seconds(60)
    })

    const distribution = new Distribution(this, 'Distribution', {
      comment: name,
      enabled: true,
      priceClass: PriceClass.PRICE_CLASS_100,
      certificate: certificate,
      domainNames: domainNames,
      minimumProtocolVersion: certificate
        ? SecurityPolicyProtocol.TLS_V1_3_2025
        : undefined,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        compress: true,
        // No caching, forward everything (AllViewer keeps the Host header for ALB host routing)
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER
      }
    })

    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName
    })

    this.distribution = distribution
  }
}
