import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib'
import { Secret as EcsSecret } from 'aws-cdk-lib/aws-ecs'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { env } from '../../../utils/config'

interface HrmsSecretsProps {
  appName: string
}

// Created empty: fill in the real value. Injected into the container as APP_PROPERTIES
export class HrmsSecrets extends Construct {
  appSecret: Secret
  ecsAppSecrets: Record<string, EcsSecret>
  constructor(scope: Construct, id: string, props: HrmsSecretsProps) {
    super(scope, id)


    const svcName = `${props.appName}-svc`

    const appSecret = new Secret(this, 'AppSecret', {
      secretName: `ecs/${svcName}-secret`,
      removalPolicy:
        env.STAGE === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    })

    new CfnOutput(this, 'AppSecretName', { value: appSecret.secretName })

    this.appSecret = appSecret
    this.ecsAppSecrets = {
      APP_PROPERTIES: EcsSecret.fromSecretsManager(appSecret)
    }
  }
}
