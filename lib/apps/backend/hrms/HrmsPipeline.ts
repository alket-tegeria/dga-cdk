import { Duration, Stack, Tags } from 'aws-cdk-lib'
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  ComputeType,
  HostKernel,
  LinuxArmBuildImage,
  PipelineProject,
  ProjectVisibility
} from 'aws-cdk-lib/aws-codebuild'
import {
  Artifact,
  ExecutionMode,
  Pipeline,
  PipelineType
} from 'aws-cdk-lib/aws-codepipeline'
import {
  CodeBuildAction,
  CodeStarConnectionsSourceAction,
  EcsDeployAction
} from 'aws-cdk-lib/aws-codepipeline-actions'
import { SecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2'
import type { IRepository } from 'aws-cdk-lib/aws-ecr'
import type { FargateService } from 'aws-cdk-lib/aws-ecs'
import { CompositePrincipal, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import { context, env } from '../../../utils/config'

interface HrmsPipelineProps {
  svcName: string
  vpc: Vpc
  service: FargateService
  repository: IRepository
}

// GitHub -> CodeBuild (image push + imagedefinitions.json) -> ECS rolling deploy
export class HrmsPipeline extends Construct {
  pipeline: Pipeline
  constructor(scope: Construct, id: string, props: HrmsPipelineProps) {
    super(scope, id)

    const { svcName } = props
    const { pipeline: pipelineConfig } = context

    const artifactBucket = Bucket.fromBucketName(
      this,
      'ArtifactBucket',
      `dga-codepipeline-artifacts-${Stack.of(this).account}-${Stack.of(this).region}`
    )

    const pipeline = new Pipeline(this, 'Pipeline', {
      pipelineName: `${svcName}-pipeline`,
      executionMode: ExecutionMode.SUPERSEDED,
      pipelineType: PipelineType.V2,
      artifactBucket
    })

    const sourceOutput = new Artifact()
    const buildOutput = new Artifact()

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: pipelineConfig.owner,
          // GitHub repo keeps its original name
          repo: 'dga-hrms-app',
          branch: pipelineConfig.deployBranch,
          connectionArn: pipelineConfig.githubConnectionArn,
          output: sourceOutput
        })
      ]
    })

    const codeBuildRole = new Role(this, 'CodeBuildRole', {
      roleName: `${svcName}-codebuild-role`,
      assumedBy: new CompositePrincipal(
        new ServicePrincipal('codebuild.amazonaws.com'),
        new ServicePrincipal('codepipeline.amazonaws.com')
      )
    })

    props.repository.grantPullPush(codeBuildRole)

    const buildSg = new SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      securityGroupName: `${svcName}-codebuild-sg`,
      description: `${svcName} code build`,
      allowAllOutbound: true
    })
    Tags.of(buildSg).add('Name', `${svcName}-codebuild-sg`)

    const buildProject = new PipelineProject(this, 'CodeBuildProject', {
      vpc: props.vpc,
      subnetSelection: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [buildSg],
      environment: {
        privileged: true,
        hostKernel: HostKernel.LINUX_KERNEL_6,
        buildImage: LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_4_0,
        computeType: ComputeType.LARGE
      },
      description: `${svcName} code build project`,
      projectName: `${svcName}-codebuild`,
      visibility: ProjectVisibility.PRIVATE,
      timeout: Duration.minutes(15),
      role: codeBuildRole,
      buildSpec: BuildSpec.fromAsset(
        `${__dirname}/buildspec/${env.STAGE}.buildspec.yaml`
      ),
      environmentVariables: {
        CONTAINER_NAME: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: props.service.taskDefinition.defaultContainer?.containerName
        },
        REPOSITORY_URI: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: props.repository.repositoryUri
        },
        REGISTRY_URI: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: props.repository.registryUri
        },
        DOCKER_BUILDKIT: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: '1'
        }
      }
    })

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new CodeBuildAction({
          actionName: 'Hrms_Build',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput]
        })
      ]
    })

    pipeline.addStage({
      stageName: 'Hrms_Service_Deploy',
      actions: [
        new EcsDeployAction({
          actionName: 'ECS_Rollout',
          service: props.service,
          input: buildOutput,
          runOrder: 10
        })
      ]
    })

    this.pipeline = pipeline
  }
}
