import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditUtil } from '../utils/audit.util';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;
    const userId = user?.id || user?.userId;

    // Only log authenticated mutations — skip GET reads entirely to keep audit_logs lean
    if (!userId || method === 'GET') {
      return next.handle();
    }

    // Determine action and entity type from URL
    const action = this.getAction(method);
    const entityType = this.getEntityType(url);

    return next.handle().pipe(
      tap({
        next: (data) => {
          // Log successful operations
          const entityId = this.extractEntityId(url, data);
          AuditUtil.log(
            this.prisma,
            userId,
            action,
            entityType,
            entityId,
            { requestBody: request.body },
            { method, url, status: 'success' },
            request,
          );
        },
        error: (error) => {
          // Log failed operations
          AuditUtil.log(
            this.prisma,
            userId,
            action,
            entityType,
            null,
            { requestBody: request.body },
            { method, url, status: 'error', error: error.message },
            request,
          );
        },
      }),
    );
  }

  private getAction(method: string): string {
    switch (method) {
      case 'GET':
        return 'READ';
      case 'POST':
        return 'CREATE';
      case 'PATCH':
      case 'PUT':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return 'UNKNOWN';
    }
  }

  private getEntityType(url: string): string {
    const parts = url.split('/').filter((p) => p);
    // Remove 'api' prefix if present
    const entityIndex = parts[0] === 'api' ? 1 : 0;
    return parts[entityIndex]?.toUpperCase() || 'UNKNOWN';
  }

  private extractEntityId(url: string, data: any): string | undefined {
    // Try to extract from URL first
    const urlMatch = url.match(/\/([a-f0-9]{24})\/?/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Try to extract from response data
    if (data?.id) {
      return data.id;
    }

    if (data?.data?.id) {
      return data.data.id;
    }

    return undefined;
  }
}

