import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type NfceAttemptResult = {
  authorized: true;
  documentId: string;
  status: 'authorized';
  printable: true;
};

@Injectable()
export class NfceAttemptService {
  async tryAuthorize(_signal?: AbortSignal): Promise<NfceAttemptResult> {
    throw new ServiceUnavailableException(
      'O adapter fiscal NFC-e 65 real ainda nao esta configurado.',
    );
  }
}
