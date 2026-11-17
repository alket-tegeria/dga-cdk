import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

// Shared pipeline resources; each service stack owns its own pipeline
export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    // Artifacts bucket shared by all service pipelines (referenced by name)
    new Bucket(this, 'ArtifactBucket', {
      bucketName: `dga-codepipeline-artifacts-${Stack.of(this).account}-${Stack.of(this).region}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    })
  }
}
