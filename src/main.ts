import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import morgan from 'morgan';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // Validate DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    console.error('Please set DATABASE_URL in your .env file');
    console.error('Format: libsql://<database-host>?authToken=<token>');
    process.exit(1);
  }
  
  // Log database connection info (masked for security)
  const maskedDbUrl = process.env.DATABASE_URL
    .replace(/authToken=[^&]+/i, 'authToken=****')
    .replace(/:([^:@/?]+)@/, ':****@');
  console.log('🔧 Database connection configured');
  console.log(`   Connection: ${maskedDbUrl.substring(0, 80)}${maskedDbUrl.length > 80 ? '...' : ''}`);

  const app = await NestFactory.create(AppModule);

  // Increase body size limits for file uploads
  const express = require('express');
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS - Support multiple origins (frontend + admin panel)
  // Admin panel is always allowed and never restricted
  const envOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : [];
  
  // Always include localhost:3000 and localhost:3002 for development
  const defaultOrigins = ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:57814', 'https://smholdings.gr', 'https://licanto.smholdings.gr', 'https://licanto.vercel.app', 'https://stefanos-admin.vercel.app'];
  const adminUrl = process.env.ADMIN_URL || 'http://localhost:3002';
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins, adminUrl])];
  
  console.log(`🌐 CORS enabled for origins: ${allowedOrigins.join(', ')}`);
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const isLocalhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      if (isLocalhostOrigin) {
        return callback(null, true);
      }
      
      // Always allow admin panel - check if it's from admin URL or contains admin indicators
      if (origin === adminUrl || origin.includes('admin') || origin.includes('3002')) {
        return callback(null, true);
      }

      // Allow Vercel preview/branch deployments for licanto, smholdings, and stefanos-admin
      const isVercelPreview = /^https:\/\/licanto[a-z0-9-]*\.vercel\.app$/i.test(origin)
        || /^https:\/\/incanto[a-z0-9-]*\.vercel\.app$/i.test(origin)
        || /^https:\/\/smholdings[a-z0-9-]*\.vercel\.app$/i.test(origin)
        || /^https:\/\/stefanos-admin[a-z0-9-]*\.vercel\.app$/i.test(origin);
      if (isVercelPreview) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Compress all responses
  app.use(compression());

  // Security - Configure helmet to work with CORS
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }));

  // Logging
  app.use(morgan('combined'));

  // Global prefix
  app.setGlobalPrefix('api');

  // Serve static files from public directory
  app.use(express.static('public'));

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('SM Holdings API')
    .setDescription('Backend API for SM Holdings Real Estate Platform — by adinfinity')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`🚀 Backend server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();


