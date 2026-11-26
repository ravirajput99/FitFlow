import { ArgumentsHost, Catch, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import { Prisma, TenantViolationError } from '@fitflow/db';
import type { Response } from 'express';

/** Turns database errors into clean HTTP responses instead of 500s. */
@Catch(Prisma.PrismaClientKnownRequestError, TenantViolationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(err: Prisma.PrismaClientKnownRequestError | TenantViolationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (err instanceof TenantViolationError) {
      res.status(HttpStatus.FORBIDDEN).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }

    switch (err.code) {
      case 'P2002': // unique constraint
        res.status(HttpStatus.CONFLICT).json({
          statusCode: 409,
          message: 'A record with these details already exists',
          fields: (err.meta?.target as string[] | undefined) ?? [],
        });
        return;
      case 'P2025': // record not found (update/delete)
        res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
        return;
      case 'P2003': // foreign key
        res
          .status(HttpStatus.BAD_REQUEST)
          .json({ statusCode: 400, message: 'A referenced record does not exist' });
        return;
      default:
        // Log server-side only; the client gets no query or schema details.
        this.logger.error(`Unhandled Prisma error ${err.code}: ${err.message}`, err.stack);
        res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ statusCode: 500, message: 'Internal server error' });
    }
  }
}
