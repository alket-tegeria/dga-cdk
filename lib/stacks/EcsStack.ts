import { CfnOutput, Stack, type StackProps, Tags } from 'aws-cdk-lib'
import { SecurityGroup, type Vpc } from 'aws-cdk-lib/aws-ec2'
import {
  Cluster,
  ContainerInsights,
  ExecuteCommandLogging
} from 'aws-cdk-lib/aws-ecs'
import type { Construct } from 'constructs'
import { OnDemandManagedInstances } from '../constructs/ecs/OnDemandManagedInstances'
import { SpotManagedInstances } from '../constructs/ecs/SpotManagedInstances'

interface EcsStackProps extends StackProps {
  vpc: Vpc
}

export class EcsStack extends Stack {
  cluster: Cluster
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props)

    const vpc = props.vpc

    const clusterName = 'dga-cluster'

    const cluster = new Cluster(this, 'Cluster', {
      vpc,
      clusterName,
      containerInsightsV2: ContainerInsights.ENABLED,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        logging: ExecuteCommandLogging.NONE
      }
    })

    // Shared by the spot and on-demand managed instances
    const managedInstancesSg = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      securityGroupName: `${clusterName}-mi-sg`,
      description: 'ECS managed instances',
      allowAllOutbound: true
    })
    Tags.of(managedInstancesSg).add('Name', `${clusterName}-mi-sg`)

    const spot = new SpotManagedInstances(this, 'SpotManagedInstances', {
      vpc,
      securityGroups: [managedInstancesSg],
      capacityProviderName: `${clusterName}-mi-spot`
    })

    const onDemand = new OnDemandManagedInstances(
      this,
      'OnDemandManagedInstances',
      {
        vpc,
        securityGroups: [managedInstancesSg],
        capacityProviderName: `${clusterName}-mi-on-demand`
      }
    )

    cluster.addManagedInstancesCapacityProvider(spot.capacityProvider)
    cluster.addManagedInstancesCapacityProvider(onDemand.capacityProvider)

    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName })

    this.cluster = cluster
  }
}
