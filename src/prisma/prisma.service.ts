import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma';
import { PrismaLibSql } from '@prisma/adapter-libsql';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client!: PrismaClient;

  async onModuleInit() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    this.logger.log('Creating PrismaClient with Turso adapter...');
    this.logger.debug(`DATABASE_URL starts with: ${dbUrl.substring(0, 20)}...`);

    try {
      const adapter = new PrismaLibSql({ 
        url: dbUrl,
        // Add connection timeout (30 seconds)
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      
      this.client = new PrismaClient({ 
        adapter,
        // Add query timeout configuration
        log: [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'event' },
          { level: 'warn', emit: 'event' },
        ],
      });

      // Log slow queries (> 5 seconds)
      this.client.$on('query' as any, (e: any) => {
        if (e.duration > 5000) {
          this.logger.warn(`Slow query detected (${e.duration}ms): ${e.query}`);
        }
      });

      this.client.$on('error' as any, (e: any) => {
        this.logger.error(`Prisma query error: ${e.message}`);
      });

      this.logger.debug('Testing connection...');
      await this.client.$connect();
      await this.assertSchemaInitialized();

      this.logger.log('Connected to Turso database successfully');
    } catch (error: any) {
      this.logger.error('Failed to create PrismaClient');
      this.logger.error(error.message);
      if (error.stack) {
        this.logger.debug(`Stack: ${error.stack}`);
      }
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }

  private async assertSchemaInitialized() {
    const result = await this.client.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'",
    );

    if (result.length > 0) {
      return;
    }

    throw new Error(
      'Database schema is not initialized: missing "rooms" table. Run `npm run db:init` in stefanos-backend and restart the API.',
    );
  }

  private getClient(): PrismaClient {
    if (!this.client) {
      throw new Error('PrismaClient not initialized');
    }
    return this.client;
  }

  // Expose PrismaClient models
  get user() { return this.getClient().user; }
  get property() { return this.getClient().property; }
  get amenity() { return this.getClient().amenity; }
  get propertyAmenity() { return this.getClient().propertyAmenity; }
  get booking() { return this.getClient().booking; }
  get propertyAvailability() { return this.getClient().propertyAvailability; }
  get review() { return this.getClient().review; }
  get maintenanceRequest() { return this.getClient().maintenanceRequest; }
  get message() { return this.getClient().message; }
  get notification() { return this.getClient().notification; }
  get edition() { return this.getClient().edition; }
  get service() { return this.getClient().service; }
  get knowledgeArticle() { return this.getClient().knowledgeArticle; }
  get payment() { return this.getClient().payment; }
  get room() { return this.getClient().room; }
  get propertyGroup() { return this.getClient().propertyGroup; }
  get cleaningSchedule() { return this.getClient().cleaningSchedule; }
  get propertyAnalytics() { return this.getClient().propertyAnalytics; }
  get propertyNote() { return this.getClient().propertyNote; }
  get auditLog() { return this.getClient().auditLog; }
  get content() { return this.getClient().content; }
  get contentMedia() { return this.getClient().contentMedia; }
  get media() { return this.getClient().media; }
  get setting() { return this.getClient().setting; }
  get roomContent() { return this.getClient().roomContent; }
  get roomAvailabilityRule() { return this.getClient().roomAvailabilityRule; }
  get inquiry() { return this.getClient().inquiry; }

  // Delegate PrismaClient methods
  $connect() { return this.getClient().$connect(); }
  $disconnect() { return this.getClient().$disconnect(); }
  $transaction(...args: any[]) { return (this.getClient().$transaction as any)(...args); }
  $queryRaw(...args: any[]) { return (this.getClient().$queryRaw as any)(...args); }
  $queryRawUnsafe(...args: any[]) { return (this.getClient().$queryRawUnsafe as any)(...args); }
  $executeRaw(...args: any[]) { return (this.getClient().$executeRaw as any)(...args); }
  $executeRawUnsafe(...args: any[]) { return (this.getClient().$executeRawUnsafe as any)(...args); }
  $extends(...args: any[]) { return (this.getClient().$extends as any)(...args); }
}
