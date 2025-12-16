import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import session = require('express-session');
import hbs = require('hbs');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Configure CSP headers for production
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
    );
    next();
  });
  
  // Configure view engine
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  
  // Register Handlebars helpers
  hbs.registerHelper('gt', function(a, b) {
    return a > b;
  });
  
  // Configure session
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'edge-hub-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    }),
  );
  
  const config = new DocumentBuilder()
    .setTitle('Hiqma Edge Hub API')
    .setDescription('African Edge-Learning Hub Edge Server API')
    .setVersion('1.0')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'Hiqma Edge Hub API Docs - Swagger UI',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Hiqma Edge Hub API Docs - Swagger UI',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  
  await app.listen(process.env.PORT ?? 3000);
  console.log(`🌐 Edge Hub running on http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`📊 Dashboard: http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`📚 API Docs: http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
