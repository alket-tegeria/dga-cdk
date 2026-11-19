import { Stack, type StackProps } from 'aws-cdk-lib'
import type { Vpc } from 'aws-cdk-lib/aws-ec2'
import type { Cluster } from 'aws-cdk-lib/aws-ecs'
import type { FileSystem } from 'aws-cdk-lib/aws-efs'
import type { ApplicationListener } from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import type { Construct } from 'constructs'
import { HrmsDb } from './HrmsDb'
import { HrmsEcr } from './HrmsEcr'
import { HrmsService } from './HrmsService'

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

    const db = new HrmsDb(this, 'Db', { vpc, appName })

    const dbSecret = db.instance.secret
    if (!dbSecret) {
      throw new Error('Database secret was not created!')
    }

    const ecr = new HrmsEcr(this, 'Ecr')

    new HrmsService(this, 'Svc', {
      appName,
      vpc,
      cluster,
      albListener,
      fileSystem,
      repository: ecr.repository,
      dbSecret: dbSecret,
      dbHost: db.instance.dbInstanceEndpointAddress,
      dbPort: db.instance.dbInstanceEndpointPort,
      dbName: 'app',
      cloudfrontUrl: cloudfrontUrl
    })
  }
}
