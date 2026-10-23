import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logging/app-logger.service';
import { scrubString } from '../logging/scrub-secrets';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger?: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // 5xx is an error worth a grep away; 4xx is client noise but still worth
    // a warning record (unhandled Guzzle-style exceptions land here with
    // their full URL — the message goes through the scrubber either way).
    if (this.logger) {
      const entry = {
        method: request.method,
        url: request.url,
        statusCode: status,
        ip: request.ip,
        stack: exception instanceof Error ? exception.stack : undefined,
      };
      const text =
        exception instanceof Error
          ? scrubString(exception.message)
          : 'Unhandled exception';
      if (status >= 500) {
        this.logger.app.error(text, entry);
      } else {
        this.logger.app.warn(text, entry);
      }
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'string' ? message : (message as any).message || 'An error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        error: exception instanceof Error ? exception.stack : exception,
      }),
    };

    response.status(status).json(errorResponse);
  }
}
