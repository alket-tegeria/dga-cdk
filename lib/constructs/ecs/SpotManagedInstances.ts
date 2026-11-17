import { Size } from 'aws-cdk-lib'
import {
  BurstablePerformance,
  CpuManufacturer,
  LocalStorage,
  type ISecurityGroup,
  type Vpc
} from 'aws-cdk-lib/aws-ec2'
import {
  CapacityOptionType,
  CfnCapacityProvider,
  InstanceMonitoring,
  ManagedInstancesCapacityProvider,
  PropagateManagedInstancesTags
} from 'aws-cdk-lib/aws-ecs'
import { CfnPropsMixin } from 'aws-cdk-lib/core/lib/helpers-internal'
import { Construct } from 'constructs'

interface SpotManagedInstancesProps {
  vpc: Vpc
  securityGroups: ISecurityGroup[]
  capacityProviderName: string
}

// Managed Instances on Spot: ECS picks Graviton instance types matching the requirements
export class SpotManagedInstances extends Construct {
  capacityProvider: ManagedInstancesCapacityProvider
  constructor(scope: Construct, id: string, props: SpotManagedInstancesProps) {
    super(scope, id)

    const capacityProvider = new ManagedInstancesCapacityProvider(
      this,
      'CapacityProvider',
      {
        capacityProviderName: props.capacityProviderName,
        subnets: props.vpc.privateSubnets,
        securityGroups: props.securityGroups,
        taskVolumeStorage: Size.gibibytes(25),
        monitoring: InstanceMonitoring.BASIC,
        propagateTags: PropagateManagedInstancesTags.CAPACITY_PROVIDER,
        capacityOptionType: CapacityOptionType.SPOT,
        instanceRequirements: {
          vCpuCountMin: 1,
          vCpuCountMax: 8,
          memoryMin: Size.gibibytes(4),
          memoryMax: Size.gibibytes(64),
          cpuManufacturers: [CpuManufacturer.AWS],
          burstablePerformance: BurstablePerformance.EXCLUDED,
          localStorage: LocalStorage.INCLUDED
        }
      }
    )

    capacityProvider.with(
      new CfnPropsMixin(CfnCapacityProvider, {
        managedInstancesProvider: {
          infrastructureOptimization: {
            scaleInAfter: 180
          },
          autoRepairConfiguration: {
            actionsStatus: 'ENABLED'
          }
        }
      })
    )

    this.capacityProvider = capacityProvider
  }
}
