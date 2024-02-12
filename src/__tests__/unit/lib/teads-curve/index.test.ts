import {TeadsCurve} from '../../../../lib';

import {Interpolation} from '../../../../types/common';

import {ERRORS} from '../../../../util/errors';

const {InputValidationError} = ERRORS;

describe('lib/teads-curve: ', () => {
  describe('TeadsCurve: ', () => {
    describe('init TeadsCurve: ', () => {
      it('initalizes object with properties.', () => {
        const teadsCurve = TeadsCurve();

        expect.assertions(2);

        expect(teadsCurve).toHaveProperty('metadata');
        expect(teadsCurve).toHaveProperty('execute');
      });
    });

    describe('execute(): ', () => {
      it('returns a result with valid data.', async () => {
        const teadsCurve = TeadsCurve({
          'thermal-design-power': 200,
        });
        const inputs = [
          {
            duration: 3600,
            'cpu-util': 50.0,
            timestamp: '2021-01-01T00:00:00Z',
          },
        ];
        const result = await teadsCurve.execute(inputs);
        expect.assertions(1);
        expect(result).toStrictEqual([
          {
            'energy-cpu': 0.15,
            duration: 3600,
            'cpu-util': 50.0,
            timestamp: '2021-01-01T00:00:00Z',
          },
        ]);
      });
      it('returns a result with provided `vcpus` data.', async () => {
        const teadsCurve = TeadsCurve({
          'thermal-design-power': 200,
        });
        const inputs = [
          {
            duration: 3600,
            'cpu-util': 50.0,
            timestamp: '2021-01-01T00:00:00Z',
            'vcpus-allocated': 1,
            'vcpus-total': 64,
          },
        ];
        const result = await teadsCurve.execute(inputs);
        expect.assertions(1);
        expect(result).toStrictEqual([
          {
            'energy-cpu': 0.00234375,
            duration: 3600,
            'cpu-util': 50.0,
            timestamp: '2021-01-01T00:00:00Z',
            'vcpus-allocated': 1,
            'vcpus-total': 64,
          },
        ]);
      });
    });

    it('returns a result when the `interpolation` has `spline` value.', async () => {
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
      });
      const inputs = [
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 50.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 100.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
      ];
      const result = await teadsCurve.execute(inputs);

      expect.assertions(1);

      expect(result).toStrictEqual([
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.096,
        },
        {
          duration: 3600,
          'cpu-util': 50.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.225,
        },
        {
          duration: 3600,
          'cpu-util': 100.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.306,
        },
      ]);
    });

    it('returns a result when the `interpolation` has `linear` value.', async () => {
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
        interpolation: Interpolation.LINEAR,
      });
      const inputs = [
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 50.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 100.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 15.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 55.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
        {
          duration: 3600,
          'cpu-util': 75.0,
          timestamp: '2021-01-01T00:00:00Z',
        },
      ];
      const result = await teadsCurve.execute(inputs);

      expect.assertions(1);

      expect(result).toStrictEqual([
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.096,
        },
        {
          duration: 3600,
          'cpu-util': 50.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.225,
        },
        {
          duration: 3600,
          'cpu-util': 100.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.306,
        },

        {
          duration: 3600,
          'cpu-util': 15.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.11212500000000002,
        },
        {
          duration: 3600,
          'cpu-util': 55.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.2331,
        },
        {
          duration: 3600,
          'cpu-util': 75.0,
          timestamp: '2021-01-01T00:00:00Z',
          'energy-cpu': 0.2655,
        },
      ]);
    });

    it('returns a result when the `vcpus-allocated` is a number.', async () => {
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
        interpolation: Interpolation.LINEAR,
      });

      const inputs = [
        {
          duration: 3600,
          'cpu-util': 10.0,
          'vcpus-allocated': 1,
          'vcpus-total': 64,
          timestamp: '2021-01-01T00:00:00Z',
        },
      ];

      expect.assertions(1);
      const result = await teadsCurve.execute(inputs);

      expect(result).toStrictEqual([
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',

          'vcpus-allocated': 1,
          'vcpus-total': 64,
          'energy-cpu': 0.0015,
        },
      ]);
    });

    it('returns a result when the `vcpus-allocated` is a string.', async () => {
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
        interpolation: Interpolation.LINEAR,
      });

      const inputs = [
        {
          duration: 3600,
          'cpu-util': 10.0,
          'vcpus-allocated': '1',
          'vcpus-total': '64',
          timestamp: '2021-01-01T00:00:00Z',
        },
      ];

      const result = await teadsCurve.execute(inputs);

      expect.assertions(1);

      expect(result).toStrictEqual([
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',
          'vcpus-allocated': '1',
          'vcpus-total': '64',
          'energy-cpu': 0.0015,
        },
      ]);
    });

    it('returns a result when the `thermal-design-power` is provided in the input.', async () => {
      const teadsCurve = TeadsCurve();
      const inputs = [
        {
          duration: 3600,
          'cpu-util': 10.0,
          'thermal-design-power': 200,
          'vcpus-allocated': '1',
          'vcpus-total': '64',
          timestamp: '2021-01-01T00:00:00Z',
        },
      ];

      const result = await teadsCurve.execute(inputs);

      expect.assertions(1);
      expect(result).toStrictEqual([
        {
          duration: 3600,
          'cpu-util': 10.0,
          timestamp: '2021-01-01T00:00:00Z',
          'vcpus-allocated': '1',
          'thermal-design-power': 200,
          'vcpus-total': '64',
          'energy-cpu': 0.001,
        },
      ]);
    });

    it('throws an error when the `vcpus-allocated` is in wrong type.', async () => {
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
        interpolation: Interpolation.LINEAR,
      });

      const inputs = [
        {
          duration: 3600,
          'cpu-util': 10.0,
          'vcpus-allocated': false,
          'vcpus-total': '64',
          timestamp: '2021-01-01T00:00:00Z',
        },
      ];

      expect.assertions(2);

      try {
        await teadsCurve.execute(inputs);
      } catch (error) {
        expect(error).toBeInstanceOf(InputValidationError);
        expect(error).toEqual(
          new InputValidationError(
            "TeadsCurve: Invalid type for 'vcpus-allocated' in input[0]."
          )
        );
      }
    });

    it('throws an error when the `thermal-design-power` is not provided in the input and config.', async () => {
      const teadsCurve = TeadsCurve();
      const errorMessage =
        '"thermal-design-power" parameter is required. Error code: invalid_type.';

      expect.assertions(2);

      try {
        await teadsCurve.execute([
          {
            duration: 3600,
            timestamp: '2021-01-01T00:00:00Z',
          },
        ]);
      } catch (error) {
        expect(error).toBeInstanceOf(InputValidationError);
        expect(error).toEqual(new InputValidationError(errorMessage));
      }
    });

    it('throws an error when the `cpu-util` is not provided in the input.', async () => {
      const errorMessage =
        '"cpu-util" parameter is required. Error code: invalid_type.';
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
      });

      expect.assertions(2);

      try {
        await teadsCurve.execute([
          {
            duration: 3600,
            timestamp: '2021-01-01T00:00:00Z',
          },
        ]);
      } catch (error) {
        expect(error).toBeInstanceOf(InputValidationError);
        expect(error).toEqual(new InputValidationError(errorMessage));
      }
    });

    it('throws an error when the `cpu-util` is out of the range 0-100.', async () => {
      const errorMessage =
        '"cpu-util" parameter is number must be less than or equal to 100. Error code: too_big.';
      const teadsCurve = TeadsCurve({
        'thermal-design-power': 300,
      });

      expect.assertions(2);
      try {
        await teadsCurve.execute([
          {
            duration: 3600,
            timestamp: '2021-01-01T00:00:00Z',
            'cpu-util': 105,
          },
        ]);
      } catch (error) {
        expect(error).toBeInstanceOf(InputValidationError);
        expect(error).toEqual(new InputValidationError(errorMessage));
      }
    });
  });
});
