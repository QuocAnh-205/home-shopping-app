import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorCode, defaultCode } from '../errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[]; code?: string; details?: unknown };
        message = b.message ?? exception.message;
        code = b.code;
        details = b.details;
      }
      // ValidationPipe trả mảng thông báo theo từng trường
      if (!code && status === HttpStatus.BAD_REQUEST && Array.isArray(message)) code = ErrorCode.VALIDATION_ERROR;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced resource does not exist';
      }
    } else if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      (exception instanceof Error && exception.name === 'MaxRetriesPerRequestError')
    ) {
      // DB/Redis mất kết nối: trả 503 để client/Nginx hiểu là lỗi tạm thời, có thể retry
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Service temporarily unavailable';
    }

    if (status >= 500) {
      this.logger.error(
        { err: exception instanceof Error ? { message: exception.message, stack: exception.stack } : exception, path: req.url, reqId: req.id },
        'Unhandled exception',
      );
    }

    res.status(status).json({
      statusCode: status,
      code: code ?? defaultCode(status),
      message,
      ...(details !== undefined ? { details } : {}),
      path: req.url,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
}
