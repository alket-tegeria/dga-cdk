import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib'
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  type Vpc
} from 'aws-cdk-lib/aws-ec2'
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  EngineLifecycleSupport,
  ParameterGroup,
  PostgresEngineVersion,
  StorageType
} from 'aws-cdk-lib/aws-rds'
import { Construct } from 'constructs'
import { env } from '../../../utils/config'

interface HrmsDbProps {
  vpc: Vpc
  appName: string
}

// Postgres in the isolated subnets; RDS manages the master password in Secrets Manager.
export class HrmsDb extends Construct {
  instance: DatabaseInstance
  constructor(scope: Construct, id: string, props: HrmsDbProps) {
    super(scope, id)

    const { vpc, appName } = props

    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      securityGroupName: `${appName}-db-sg`,
      description: `${appName} database`,
      allowAllOutbound: false
    })
    Tags.of(securityGroup).add('Name', `${appName}-db-sg`)

    securityGroup.addIngressRule(
      Peer.ipv4(vpc.vpcCidrBlock),
      Port.POSTGRES,
      'Postgres from inside the VPC'
    )

    const engine = DatabaseInstanceEngine.postgres({
      version: PostgresEngineVersion.of('18.4', '18')
    })

    const parameterGroup = new ParameterGroup(this, 'ParameterGroup', {
      engine,
      name: `${appName}-db-parameter-group-18`,
      parameters: {
        'rds.logical_replication': '1'
      }
    })

    const instance = new DatabaseInstance(this, 'Instance', {
      instanceIdentifier: `${appName}-db`,
      engine,
      parameterGroup,
      engineLifecycleSupport:
        EngineLifecycleSupport.OPEN_SOURCE_RDS_EXTENDED_SUPPORT_DISABLED,
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      publiclyAccessible: false,
      multiAz: false,
      allocatedStorage: 25,
      maxAllocatedStorage: 50,
      storageType: StorageType.GP3,
      storageEncrypted: true,
      databaseName: 'app',
      port: 5432,
      credentials: Credentials.fromUsername('axelor'),
      manageMasterUserPassword: true,
      backupRetention: Duration.days(30),
      deletionProtection: env.STAGE === 'prod',
      // Final snapshot when the instance is deleted
      removalPolicy: RemovalPolicy.SNAPSHOT
    })

    this.instance = instance
  }
}
