import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PropertiesModule } from './properties/properties.module';
import { BookingsModule } from './bookings/bookings.module';
import { EditionsModule } from './editions/editions.module';
import { ServicesModule } from './services/services.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { PaymentsModule } from './payments/payments.module';
import { RoomsModule } from './rooms/rooms.module';
import { PropertyGroupsModule } from './property-groups/property-groups.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CleaningModule } from './cleaning/cleaning.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AdminModule } from './admin/admin.module';
import { UploadModule } from './upload/upload.module';
import { ContentModule } from './content/content.module';
import { MediaModule } from './media/media.module';
import { SettingsModule } from './settings/settings.module';
import { ExternalBookingsModule } from './external-bookings/external-bookings.module';
import { LogsModule } from './logs/logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { MessagesModule } from './messages/messages.module';
import { ReportsModule } from './reports/reports.module';
import { PricingModule } from './pricing/pricing.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { EmailModule } from './email/email.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new KeyvRedis(
            config.get<string>('REDIS_URL', 'redis://redis:6379'),
            { namespace: 'stefanos' },
          ),
        ],
        ttl: 0, // per-call TTL; no global default
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    BookingsModule,
    EditionsModule,
    ServicesModule,
    KnowledgeModule,
    PaymentsModule,
    RoomsModule,
    PropertyGroupsModule,
    AnalyticsModule,
    CleaningModule,
    ReviewsModule,
    AdminModule,
    UploadModule,
    ContentModule,
    MediaModule,
    SettingsModule,
    ExternalBookingsModule,
    LogsModule,
    NotificationsModule,
    InquiriesModule,
    MaintenanceModule,
    MessagesModule,
    PricingModule,
    ReportsModule,
    AuditModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}

