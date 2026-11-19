import { CfnOutput, Duration, RemovalPolicy, Tags } from 'aws-cdk-lib'
import { Port, SecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2'
import type { IRepository } from 'aws-cdk-lib/aws-ecr'
import {
  AwsLogDriver,
  type Cluster,
  Compatibility,
  ContainerImage,
  CpuArchitecture,
  Secret as EcsSecret,
  FargateService,
  NetworkMode,
  OperatingSystemFamily,
  PropagatedTagSource,
  TaskDefinition,
  TaskDefinitionRevision
} from 'aws-cdk-lib/aws-ecs'
import { AccessPoint, type FileSystem } from 'aws-cdk-lib/aws-efs'
import {
  type ApplicationListener,
  ApplicationListenerRule,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
  TargetType
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import { HrmsPipeline } from './HrmsPipeline'
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager'

interface HrmsServiceProps {
  appName: string
  vpc: Vpc
  cluster: Cluster
  albListener: ApplicationListener
  fileSystem: FileSystem
  repository: IRepository
  dbSecret: ISecret
  dbHost: string
  dbPort: string
  dbName: string
  cloudfrontUrl: string
}

export class HrmsService extends Construct {
  constructor(scope: Construct, id: string, props: HrmsServiceProps) {
    super(scope, id)

    const {
      appName,
      vpc,
      cluster,
      albListener,
      fileSystem,
      repository,
      dbSecret,
      dbHost,
      dbPort,
      dbName,
      cloudfrontUrl
    } = props

    const svcName = `${appName}-svc`

    const containerPort = 8080

    const uploadsAccessPoint = new AccessPoint(this, 'UploadsAccessPoint', {
      fileSystem,
      path: `/efs/${appName}/uploads`,
      posixUser: { uid: '0', gid: '0' },
      createAcl: { ownerUid: '0', ownerGid: '0', permissions: '775' }
    })
    Tags.of(uploadsAccessPoint).add('Name', `${appName}-uploads-ap`)

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/ecs/${svcName}`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    // Bootstrap revision; the pipeline registers later revisions of this family
    const taskDefinition = new TaskDefinition(this, 'TaskDefinition', {
      family: svcName,
      compatibility: Compatibility.FARGATE_AND_MANAGED_INSTANCES,
      networkMode: NetworkMode.AWS_VPC,

      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX
      },
      cpu: '2048',
      memoryMiB: '7168',
      volumes: [
        {
          name: 'uploads-data',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: uploadsAccessPoint.accessPointId,
              iam: 'ENABLED'
            }
          }
        }
      ]
    })

    taskDefinition
      .addContainer('Container', {
        containerName: svcName,
        image: ContainerImage.fromEcrRepository(repository, 'latest'),
        essential: true,
        portMappings: [{ containerPort }],
        environment: {
          AXELOR_OPTS: '-Xmx2048m',
          AXELOR_CONFIG_SESSION_COOKIE_SECURE: 'false',
          AXELOR_CONFIG_DB_DEFAULT_DDL: 'update',
          AXELOR_CONFIG_DB_DEFAULT_DRIVER: 'org.postgresql.Driver',
          AXELOR_CONFIG_DB_DEFAULT_URL: `jdbc:postgresql://${dbHost}:${dbPort}/${dbName}`,
          AXELOR_CONFIG_APPLICATION_BASE_URL: cloudfrontUrl
        },
        secrets: {
          AXELOR_CONFIG_DB_DEFAULT_USER: EcsSecret.fromSecretsManager(
            dbSecret,
            'username'
          ),
          AXELOR_CONFIG_DB_DEFAULT_PASSWORD: EcsSecret.fromSecretsManager(
            dbSecret,
            'password'
          )
        },
        logging: new AwsLogDriver({ streamPrefix: 'container', logGroup })
      })
      .addMountPoints({
        sourceVolume: 'uploads-data',
        containerPath: '/usr/local/tomcat/temp',
        readOnly: false
      })

    // Mount and write only through the uploads access point
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        actions: [
          'elasticfilesystem:ClientMount',
          'elasticfilesystem:ClientWrite'
        ],
        resources: [fileSystem.fileSystemArn],
        conditions: {
          StringEquals: {
            'elasticfilesystem:AccessPointArn':
              uploadsAccessPoint.accessPointArn
          }
        }
      })
    )

    const serviceSg = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      securityGroupName: `${svcName}-sg`,
      description: `${svcName} ecs svc`,
      allowAllOutbound: true
    })
    Tags.of(serviceSg).add('Name', `${svcName}-sg`)

    // Managed Instances run through FargateService with a MANAGED_INSTANCES task definition
    const service = new FargateService(this, 'Service', {
      serviceName: svcName,
      cluster,
      taskDefinition,
      taskDefinitionRevision: TaskDefinitionRevision.LATEST,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [serviceSg],
      assignPublicIp: false,
      capacityProviderStrategies: [
        {
          // Registered on the cluster by EcsStack
          capacityProvider: `FARGATE_SPOT`,
          weight: 1
        }
      ],
      healthCheckGracePeriod: Duration.seconds(1800),
      circuitBreaker: { enable: true, rollback: true },
      propagateTags: PropagatedTagSource.SERVICE,
      enableExecuteCommand: true
    })

    // allowTo puts the ingress rule in this stack, avoiding a cycle with EfsStack
    service.connections.allowTo(fileSystem, Port.NFS, 'NFS from ECS tasks')

    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      targetGroupName: svcName,
      port: containerPort,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      deregistrationDelay: Duration.seconds(30),
      targets: [
        service.loadBalancerTarget({ containerName: svcName, containerPort })
      ],
      healthCheck: {
        path: '/login',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200-399'
      }
    })

    // Catch-all until CloudFront serves the custom domain; then switch to hostHeaders
    new ApplicationListenerRule(this, 'ListenerRule', {
      listener: albListener,
      priority: 100,
      conditions: [ListenerCondition.pathPatterns(['/*'])],
      action: ListenerAction.forward([targetGroup])
    })

    new CfnOutput(this, 'ServiceName', { value: service.serviceName })

    new HrmsPipeline(this, 'Pipeline', {
      svcName,
      vpc,
      service,
      repository
    })
  }
}
