import { Duration } from 'aws-cdk-lib'
import {
  Architecture,
  LoggingFormat,
  Runtime,
  SystemLogLevel
} from 'aws-cdk-lib/aws-lambda'
import type { NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { env } from './config'

export const lambdaProps: NodejsFunctionProps = {
  memorySize: 1024,
  runtime: Runtime.NODEJS_24_X,
  architecture: Architecture.ARM_64,
  timeout: Duration.seconds(30),
  bundling: {
    externalModules: [],
    mainFields: ['module', 'main'],
    minify: env.STAGE === 'prod'
  },
  loggingFormat: LoggingFormat.JSON,
  systemLogLevelV2: SystemLogLevel.INFO
}
