import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppLogger } from './app-logger.service';
import { SlowRequestInterceptor } from './slow-request.interceptor';

@Global()
@Module({
  providers: [
    AppLogger,
    {
      provide: APP_INTERCEPTOR,
      useClass: SlowRequestInterceptor,
    },
  ],
  exports: [AppLogger],
})
export class LoggingModule {}
