import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const MAX_CONCURRENT = 4;
const MAX_QUEUED = 100;

/**
 * bcrypt is deliberately slow and runs on the event loop thread pool. Without
 * a cap, a flood of login/register requests from many IPs would starve every
 * other request. Excess work waits in a short queue; beyond that we shed load.
 */
@Injectable()
export class HashPool {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  hash(password: string) {
    return this.run(() => bcrypt.hash(password, 12));
  }

  compare(password: string, hash: string) {
    return this.run(() => bcrypt.compare(password, hash));
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT) {
      if (this.queue.length >= MAX_QUEUED) throw new ServiceUnavailableException('server_busy');
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
