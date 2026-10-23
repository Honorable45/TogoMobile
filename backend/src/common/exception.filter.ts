import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Format d'erreur uniforme : { statusCode, message, errors? }.
 * Les erreurs internes ne divulguent jamais de détails techniques au client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') return res.status(status).json({ statusCode: status, message: body });
      const b = body as { message?: string | string[]; errors?: unknown; code?: string };
      const message = Array.isArray(b.message) ? 'Certaines informations sont invalides.' : b.message ?? exception.message;
      return res.status(status).json({
        statusCode: status,
        message,
        ...(Array.isArray(b.message) ? { errors: b.message } : {}),
        ...(b.errors ? { errors: b.errors } : {}),
        ...(b.code ? { code: b.code } : {}),
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: 'Cet élément existe déjà.' });
      }
      if (exception.code === 'P2025') {
        return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Élément introuvable.' });
      }
    }

    this.logger.error(`${req.method} ${req.path}`, exception instanceof Error ? exception.stack : String(exception));
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Une erreur inattendue est survenue. Veuillez réessayer.' });
  }
}
