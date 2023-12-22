import Spline from 'typescript-cubic-spline';

import {INSTANCE_TYPE_COMPUTE_PROCESSOR_MAPPING} from '@cloud-carbon-footprint/aws/dist/lib/AWSInstanceTypes';

import * as AWS_INSTANCES from './aws-instances.json';
import * as GCP_INSTANCES from './gcp-instances.json';
import * as AZURE_INSTANCES from './azure-instances.json';
import * as GCP_USE from './gcp-use.json';
import * as AWS_USE from './aws-use.json';
import * as AZURE_USE from './azure-use.json';
import * as GCP_EMBODIED from './gcp-embodied.json';
import * as AWS_EMBODIED from './aws-embodied.json';
import * as AZURE_EMBODIED from './azure-embodied.json';

import {ERRORS} from '../../util/errors';

import {IComputeInstance} from '../../types/ccf';
import {Interpolation, KeyValuePair, ModelParams} from '../../types/common';
import {ModelPluginInterface} from '../../interfaces';
import {buildErrorMessage} from '../../util/helpers';

const {InputValidationError, UnsupportedValueError} = ERRORS;

export class CloudCarbonFootprint implements ModelPluginInterface {
  private computeInstances: {
    [key: string]: {
      [key: string]: IComputeInstance;
    };
  } = {}; // compute instances grouped by the vendor with usage data

  private computeInstanceUsageByArchitecture: KeyValuePair = {
    gcp: {},
    aws: {},
    azure: {},
  }; // list of all the by Architecture
  private vendor = '';
  private instanceType = '';
  private expectedLifespan = 4;
  errorBuilder = buildErrorMessage(CloudCarbonFootprint);

  private interpolation = Interpolation.LINEAR;

  constructor() {
    this.standardizeInstanceMetrics();
  }

  /**
   * Configures the CCF Plugin for IEF
   * @param {Object} staticParams static parameters for the resource
   * @param {('aws'|'gcp'|'azure')} staticParams.vendor aws, gcp, azure
   * @param {string} staticParams.'instance-type' instance type from the list of supported instances
   * @param {number} staticParams.'expected-lifespan' expected lifespan of the instance in years
   * @param {Interpolation} staticParams.interpolation linear(All Clouds), spline (only for AWS)
   */
  async configure(
    staticParams: object | undefined = undefined
  ): Promise<ModelPluginInterface> {
    if (staticParams === undefined) {
      throw new InputValidationError(
        this.errorBuilder({message: 'Input data is missing'})
      );
    }

    if ('vendor' in staticParams) {
      const vendor = staticParams?.vendor as string;

      if (['aws', 'gcp', 'azure'].includes(vendor)) {
        this.vendor = vendor;
      } else {
        throw new UnsupportedValueError(
          this.errorBuilder({
            message: `Vendor ${vendor} not supported`,
            scope: 'configure',
          })
        );
      }
    } else {
      throw new UnsupportedValueError(
        this.errorBuilder({
          message: 'Vendor is not provided',
          scope: 'configure',
        })
      );
    }

    if ('instance-type' in staticParams) {
      const instanceType = staticParams['instance-type'] as string;

      if (instanceType in this.computeInstances[this.vendor]) {
        this.instanceType = instanceType;
      } else {
        throw new UnsupportedValueError(
          this.errorBuilder({
            message: `Instance type ${instanceType} is not supported`,
          })
        );
      }
    } else {
      throw new InputValidationError(
        this.errorBuilder({
          message: 'Instance type is not provided',
        })
      );
    }

    if ('expected-lifespan' in staticParams) {
      this.expectedLifespan = staticParams['expected-lifespan'] as number;
    }

    if ('interpolation' in staticParams) {
      if (this.vendor !== 'aws') {
        throw new UnsupportedValueError(
          this.errorBuilder({
            message: `Interpolation ${staticParams.interpolation} method is not supported`,
          })
        );
      }

      const interpolation = staticParams?.interpolation as Interpolation;

      if (Object.values(Interpolation).includes(interpolation)) {
        this.interpolation = interpolation;
      } else {
        throw new UnsupportedValueError(
          this.errorBuilder({
            message: `Interpolation ${this.interpolation} method not supported`,
          })
        );
      }
    }

    return this;
  }

  /**
   * Calculate the total emissions for a list of inputs
   *
   * Each input require:
   * @param {Object[]} inputs  ISO 8601 timestamp string
   * @param {string} inputs[].timestamp ISO 8601 timestamp string
   * @param {number} inputs[].duration input duration in seconds
   * @param {number} inputs[].cpu-util percentage cpu usage
   */
  async execute(inputs: ModelParams[]): Promise<ModelParams[]> {
    if (this.instanceType === '' || this.vendor === '') {
      throw new InputValidationError(
        this.errorBuilder({
          message:
            "Incomplete configuration: 'instanceType' or 'vendor' is missing",
        })
      );
    }

    return inputs.map(input => {
      input['energy'] = this.calculateEnergy(input);
      input['embodied-carbon'] = this.embodiedEmissions(input);

      return input;
    });
  }

  /**
   * Calculates the energy consumption for a single input
   * requires
   *
   * duration: duration of the input in seconds
   * cpu-util: cpu usage in percentage
   * timestamp: ISO 8601 timestamp string
   *
   * Uses a spline method for AWS and linear interpolation for GCP and Azure
   */
  private calculateEnergy(input: KeyValuePair) {
    if (
      !('duration' in input) ||
      !('cpu-util' in input) ||
      !('timestamp' in input)
    ) {
      throw new InputValidationError(
        this.errorBuilder({
          message:
            "Required parameters 'duration', 'cpu', 'timestamp' are not provided",
        })
      );
    }

    const duration = input['duration'];
    const cpu = input['cpu-util'];

    let wattage; // get the wattage for the instance type

    if (this.vendor === 'aws' && this.interpolation === 'spline') {
      const x = [0, 10, 50, 100];
      const y = [
        this.computeInstances['aws'][this.instanceType].consumption.idle,
        this.computeInstances['aws'][this.instanceType].consumption.tenPercent,
        this.computeInstances['aws'][this.instanceType].consumption
          .fiftyPercent,
        this.computeInstances['aws'][this.instanceType].consumption
          .hundredPercent,
      ];

      const spline = new Spline(x, y);

      wattage = spline.at(cpu);
    } else {
      const idle =
        this.computeInstances[this.vendor][this.instanceType].consumption
          .minWatts;
      const max =
        this.computeInstances[this.vendor][this.instanceType].consumption
          .maxWatts;

      // linear interpolation
      wattage = idle + (max - idle) * (cpu / 100);
    }
    //  duration is in seconds
    //  wattage is in watts
    //  eg: 30W x 300s = 9000 J
    //  1 Wh = 3600 J
    //  9000 J / 3600 = 2.5 Wh
    //  J / 3600 = Wh
    //  2.5 Wh / 1000 = 0.0025 kWh
    //  Wh / 1000 = kWh
    // (wattage * duration) / (seconds in an hour) / 1000 = kWh
    return (wattage * duration) / 3600 / 1000;
  }

  /**
   * Standardize the instance metrics for all the vendors
   *
   * Maps the instance metrics to a standard format (min, max, idle, 10%, 50%, 100%) for all the vendors
   */
  standardizeInstanceMetrics() {
    this.computeInstances['aws'] = {};
    this.computeInstances['gcp'] = {};
    this.computeInstances['azure'] = {};
    this.calculateAverage('gcp', GCP_USE);
    this.calculateAverage('azure', AZURE_USE);
    this.calculateAverage('aws', AWS_USE);
    AWS_INSTANCES.forEach((instance: KeyValuePair) => {
      const cpus = parseInt(instance['Instance vCPU'], 10);
      const architectures = INSTANCE_TYPE_COMPUTE_PROCESSOR_MAPPING[
        instance['Instance type']
      ] ?? ['Average'];
      let minWatts = 0.0;
      let maxWatts = 0.0;
      let count = 0;
      architectures.forEach((architecture: string) => {
        architecture = this.resolveAwsArchitecture(architecture);
        minWatts +=
          this.computeInstanceUsageByArchitecture['aws'][architecture][
            'Min Watts'
          ];
        maxWatts +=
          this.computeInstanceUsageByArchitecture['aws'][architecture][
            'Max Watts'
          ];
        count += 1;
      });
      minWatts = minWatts / count;
      maxWatts = maxWatts / count;
      this.computeInstances['aws'][instance['Instance type']] = {
        consumption: {
          idle: parseFloat(instance['Instance @ Idle'].replace(',', '.')),
          tenPercent: parseFloat(instance['Instance @ 10%'].replace(',', '.')),
          fiftyPercent: parseFloat(
            instance['Instance @ 50%'].replace(',', '.')
          ),
          hundredPercent: parseFloat(
            instance['Instance @ 100%'].replace(',', '.')
          ),
          minWatts: minWatts * cpus,
          maxWatts: maxWatts * cpus,
        },
        vCPUs: cpus,
        maxvCPUs: parseInt(instance['Platform Total Number of vCPU'], 10),
        name: instance['Instance type'],
      } as IComputeInstance;
    });
    GCP_INSTANCES.forEach((instance: KeyValuePair) => {
      const cpus = parseInt(instance['Instance vCPUs'], 10);
      let architecture = instance['Microarchitecture'];

      if (!(architecture in this.computeInstanceUsageByArchitecture['gcp'])) {
        architecture = 'Average';
      }
      this.computeInstances['gcp'][instance['Machine type']] = {
        name: instance['Machine type'],
        vCPUs: cpus,
        consumption: {
          idle: 0,
          tenPercent: 0,
          fiftyPercent: 0,
          hundredPercent: 0,
          minWatts:
            this.computeInstanceUsageByArchitecture['gcp'][architecture][
              'Min Watts'
            ] * cpus,
          maxWatts:
            this.computeInstanceUsageByArchitecture['gcp'][architecture][
              'Max Watts'
            ] * cpus,
        },
        maxvCPUs: parseInt(
          instance['Platform vCPUs (highest vCPU possible)'],
          10
        ),
      } as IComputeInstance;
    });
    AZURE_INSTANCES.forEach((instance: KeyValuePair) => {
      const cpus = parseInt(instance['Instance vCPUs'], 10);
      let architecture = instance['Microarchitecture'];
      if (!(architecture in this.computeInstanceUsageByArchitecture['azure'])) {
        architecture = 'Average';
      }
      this.computeInstances['azure'][instance['Virtual Machine']] = {
        consumption: {
          idle: 0,
          tenPercent: 0,
          fiftyPercent: 0,
          hundredPercent: 0,
          minWatts:
            this.computeInstanceUsageByArchitecture['azure'][architecture][
              'Min Watts'
            ] * cpus,
          maxWatts:
            this.computeInstanceUsageByArchitecture['azure'][architecture][
              'Max Watts'
            ] * cpus,
        },
        name: instance['Virtual Machine'],
        vCPUs: instance['Instance vCPUs'],
        maxvCPUs: parseInt(
          instance['Platform vCPUs (highest vCPU possible)'],
          10
        ),
      } as IComputeInstance;
    });
    AWS_EMBODIED.forEach((instance: KeyValuePair) => {
      this.computeInstances['aws'][instance['type']].embodiedEmission =
        instance['total'];
    });
    GCP_EMBODIED.forEach((instance: KeyValuePair) => {
      this.computeInstances['gcp'][instance['type']].embodiedEmission =
        instance['total'];
    });
    AZURE_EMBODIED.forEach((instance: KeyValuePair) => {
      this.computeInstances['azure'][instance['type']].embodiedEmission =
        instance['total'];
    });
  }

  private calculateAverage(vendor: string, instanceList: KeyValuePair[]) {
    let min = 0.0;
    let max = 0.0;
    let count = 0.0;
    instanceList.forEach((instance: KeyValuePair) => {
      this.computeInstanceUsageByArchitecture[vendor][
        instance['Architecture']
      ] = instance;
      min += parseFloat(instance['Min Watts']);
      max += parseFloat(instance['Max Watts']);
      count += 1.0;
    });
    const avgMin = min / count;
    const avgMax = max / count;
    this.computeInstanceUsageByArchitecture[vendor]['Average'] = {
      'Min Watts': avgMin,
      'Max Watts': avgMax,
      Architecture: 'Average',
    };
  }

  // Architecture strings are different between Instances-Use.JSON and the bundled Typescript from CCF.
  // This function resolves the differences.
  resolveAwsArchitecture(architecture: string) {
    if (architecture.includes('AMD ')) {
      architecture = architecture.substring(4);
    }

    if (architecture.includes('Skylake')) {
      architecture = 'Sky Lake';
    }

    if (architecture.includes('Graviton')) {
      if (architecture.includes('2')) {
        architecture = 'Graviton2';
      } else {
        architecture = 'Graviton';
      }
    }

    if (architecture.includes('Unknown')) {
      architecture = 'Average';
    }

    if (!(architecture in this.computeInstanceUsageByArchitecture['aws'])) {
      throw new UnsupportedValueError(
        this.errorBuilder({
          message: `Architecture '${architecture}' is not supported`,
        })
      );
    }

    return architecture;
  }

  /**
   * Calculates the embodied emissions for a given input
   */
  private embodiedEmissions(input: KeyValuePair): number {
    // duration
    const durationInHours = input['duration'] / 3600;
    // M = TE * (TR/EL) * (RR/TR)
    // Where:
    // TE = Total Embodied Emissions, the sum of Life Cycle Assessment(LCA) emissions for all hardware components
    // TR = Time Reserved, the length of time the hardware is reserved for use by the software
    // EL = Expected Lifespan, the anticipated time that the equipment will be installed
    // RR = Resources Reserved, the number of resources reserved for use by the software.
    // TR = Total Resources, the total number of resources available.
    const totalEmissions =
      this.computeInstances[this.vendor][this.instanceType].embodiedEmission;
    const timeReserved = durationInHours;
    const expectedLifespan = 8760 * this.expectedLifespan;
    const reservedResources =
      this.computeInstances[this.vendor][this.instanceType].vCPUs;
    const totalResources =
      this.computeInstances[this.vendor][this.instanceType].maxvCPUs;
    // Multiply totalEmissions by 1000 to convert from kgCO2e to gCO2e
    return (
      totalEmissions *
      1000 *
      (timeReserved / expectedLifespan) *
      (reservedResources / totalResources)
    );
  }
}
