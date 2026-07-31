import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrderDto } from './update-order.dto';

describe('UpdateOrderDto optimistic version contract', () => {
  it.each([undefined, null, 0, -1, 1.5, 'invalid'])(
    'rejects invalid expectedVersion %p',
    async (expectedVersion) => {
      const dto = plainToInstance(UpdateOrderDto, { expectedVersion });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'expectedVersion')).toBe(
        true,
      );
    },
  );

  it('accepts and transforms a positive integer version', async () => {
    const dto = plainToInstance(UpdateOrderDto, { expectedVersion: '7' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.expectedVersion).toBe(7);
  });
});
