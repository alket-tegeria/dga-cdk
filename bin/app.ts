#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { HrmsServiceStack } from '../lib/apps/backend/hrms/HrmsServiceStack'
import { CdnStack } from '../lib/stacks/CdnStack'
import { EcsStack } from '../lib/stacks/EcsStack'
import { EfsStack } from '../lib/stacks/EfsStack'
import { GatewayStack } from '../lib/stacks/GatewayStack'
import { NetworkStack } from '../lib/stacks/NetworkStack'
import { PipelineStack } from '../lib/stacks/PipelineStack'
import { env } from '../lib/utils/config'

const app = new cdk.App()

cdk.Tags.of(app).add('Project', 'DGA')
cdk.Tags.of(app).add('Environment', env.STAGE)

const networkStack = new NetworkStack(app, 'NetworkStack', {
  env,
  stackName: 'NetworkStack'
})

const ecsStack = new EcsStack(app, 'EcsStack', {
  env,
  stackName: 'EcsStack',
  vpc: networkStack.vpc
})

const pipelineStack = new PipelineStack(app, 'PipelineStack', {
  env,
  stackName: 'PipelineStack'
})

const efsStack = new EfsStack(app, 'EfsStack', {
  env,
  stackName: 'EfsStack',
  vpc: networkStack.vpc
})

const gatewayStack = new GatewayStack(app, 'GatewayStack', {
  env,
  stackName: 'GatewayStack',
  vpc: networkStack.vpc
})

const cdnStack = new CdnStack(app, 'CdnStack', {
  env,
  stackName: 'CdnStack',
  alb: gatewayStack.alb
})

const hrmsServiceStack = new HrmsServiceStack(app, 'HrmsServiceStack', {
  env,
  stackName: 'HrmsServiceStack',
  vpc: networkStack.vpc,
  cluster: ecsStack.cluster,
  fileSystem: efsStack.fileSystem,
  albListener: gatewayStack.albListener,
  cloudfrontUrl: `https://${cdnStack.distribution.distributionDomainName}`
})

hrmsServiceStack.addStackDependency(pipelineStack)
