import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib'
import { Repository, TagStatus } from 'aws-cdk-lib/aws-ecr'
import { Construct } from 'constructs'
import { env } from '../../../utils/config'

// HRMS image repository
export class HrmsEcr extends Construct {
  repository: Repository
  constructor(scope: Construct, id: string) {
    super(scope, id)

    const removalPolicy =
      env.STAGE === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY

    const repository = new Repository(this, 'Repository', {
      repositoryName: 'dga/hrms',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Expire untagged images after 1 day',
          maxImageAge: Duration.days(1),
          tagStatus: TagStatus.UNTAGGED
        },
        {
          rulePriority: 2,
          description: 'Keep only the latest 10 images',
          tagStatus: TagStatus.ANY,
          maxImageCount: 10
        }
      ],
      removalPolicy,
      emptyOnDelete: removalPolicy === RemovalPolicy.DESTROY
    })

    new CfnOutput(this, 'RepositoryUri', {
      value: repository.repositoryUri
    })

    this.repository = repository
  }
}
