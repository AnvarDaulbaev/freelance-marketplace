import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Behind nginx every browser request carries X-Forwarded-For (nginx sets it).
 * A request without it can only come from inside the Docker network, i.e. the
 * web container's server-side rendering, which must not share one rate-limit
 * bucket for all visitors.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.TRUST_PROXY !== 'true') return false;
    const req = context.switchToHttp().getRequest();
    return !req.headers['x-forwarded-for'];
  }
}
