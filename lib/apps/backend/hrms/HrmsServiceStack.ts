import { Stack, type StackProps } from 'aws-cdk-lib'
import type { Vpc } from 'aws-cdk-lib/aws-ec2'
import type { Cluster } from 'aws-cdk-lib/aws-ecs'
import type { FileSystem } from 'aws-cdk-lib/aws-efs'
import type { ApplicationListener } from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import type { Construct } from 'constructs'
import { HrmsDb } from './HrmsDb'
import { HrmsEcr } from './HrmsEcr'
import { HrmsService } from './HrmsService'
import { HrmsSecrets } from './HrmsSecrets'

interface HrmsServiceStackProps extends StackProps {
  vpc: Vpc
  cluster: Cluster
  fileSystem: FileSystem
  albListener: ApplicationListener
  cloudfrontUrl: string
}

export class HrmsServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: HrmsServiceStackProps) {
    super(scope, id, props)

    const { vpc, cluster, fileSystem, albListener, cloudfrontUrl } = props

    const appName = 'dga-hrms'

    new HrmsDb(this, 'Db', { vpc, appName })

    const ecr = new HrmsEcr(this, 'Ecr')

    const secrets = new HrmsSecrets(this, 'Secrets', { appName })

    new HrmsService(this, 'Svc', {
      appName,
      vpc,
      cluster,
      albListener,
      fileSystem,
      repository: ecr.repository,
      ecsAppSecrets: secrets.ecsAppSecrets,
      cloudfrontUrl
    })
  }
}
