import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class AuditUtil {
  private static readonly logger = new Logger('AuditUtil');

  static async log(
    prisma: PrismaService,
    userId: string,
    action: string,
    entityType: string,
    entityId?: string,
    changes?: any,
    metadata?: any,
    request?: any,
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId,
          changes: changes ? JSON.parse(JSON.stringify(changes)) : null,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
          ipAddress: request?.ip || request?.headers?.['x-forwarded-for'] || null,
          userAgent: request?.headers?.['user-agent'] || null,
        },
      });
    } catch (error) {
      // Don't throw - audit logging should not break the application
      AuditUtil.logger.error(`Audit logging failed: ${error}`);
    }
  }
}

