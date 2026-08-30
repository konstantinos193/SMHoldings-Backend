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
          ipAddress: AuditUtil.resolveIp(request),
          userAgent: request?.headers?.['user-agent'] || null,
        },
      });
    } catch (error) {
      // Don't throw - audit logging should not break the application
      AuditUtil.logger.error(`Audit logging failed: ${error}`);
    }
  }

  /**
   * With `trust proxy` set, Express already resolves req.ip from X-Forwarded-For.
   * The header is still read as a fallback, and the IPv4-mapped IPv6 prefix is
   * stripped so entries read `172.18.0.1` rather than `::ffff:172.18.0.1`.
   * (The previous `request?.ip || header` order made the fallback unreachable —
   * req.ip is always set.)
   */
  private static resolveIp(request?: any): string | null {
    const forwarded = request?.headers?.['x-forwarded-for'];
    const forwardedFirst = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === 'string'
        ? forwarded.split(',')[0]
        : null;

    const raw = request?.ip || forwardedFirst || request?.socket?.remoteAddress || null;
    if (!raw) return null;

    return String(raw).trim().replace(/^::ffff:/i, '') || null;
  }
}

