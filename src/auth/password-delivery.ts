import { Injectable } from '@nestjs/common';

export const PASSWORD_EMAIL_DELIVERY = Symbol('PASSWORD_EMAIL_DELIVERY');

export interface PasswordEmailDelivery {
  send(input: { email: string; resetUrl: string }): Promise<void>;
}

@Injectable()
export class ConfiguredPasswordEmailDelivery implements PasswordEmailDelivery {
  async send(_input: { email: string; resetUrl: string }) {
    if (process.env.PASSWORD_RESET_EMAIL_DELIVERY_ENABLED !== 'true') {
      throw new Error('PASSWORD_RESET_EMAIL_DELIVERY_NOT_CONFIGURED');
    }
    throw new Error('PASSWORD_RESET_EMAIL_DELIVERY_ADAPTER_NOT_IMPLEMENTED');
  }
}
