import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Turns database errors caused by bad input (unknown id, duplicate, broken
 * reference) into clean 4xx responses instead of 500s, without exposing
 * table or column names.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(err: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : 'VALIDATION';
    const [status, message] =
      code === 'P2025' ? [HttpStatus.NOT_FOUND, 'not_found'] :
      code === 'P2002' ? [HttpStatus.CONFLICT, 'already_exists'] :
      code === 'P2003' ? [HttpStatus.BAD_REQUEST, 'invalid_reference'] :
      code === 'P2020' || code === 'VALIDATION' ? [HttpStatus.BAD_REQUEST, 'invalid_input'] :
      [HttpStatus.INTERNAL_SERVER_ERROR, 'internal_error'];
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(err);
    res.status(status).json({ statusCode: status, message });
  }
}
