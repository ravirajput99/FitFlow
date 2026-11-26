import { Injectable, Logger } from '@nestjs/common';

/** Delivers a login code to a phone. MSG91 (DLT-approved template) is wired in Phase 1. */
export abstract class OtpSender {
  abstract send(phone: string, code: string): Promise<void>;
}

/** Development sender: prints the code to the API console. Blocked in production by env checks. */
@Injectable()
export class LogOtpSender extends OtpSender {
  private readonly logger = new Logger('OTP');

  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`Login code for ${phone}: ${code}`);
  }
}
