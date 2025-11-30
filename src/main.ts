import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const config = new DocumentBuilder()
    .setTitle('Hiqma Edge Hub API')
    .setDescription('African Edge-Learning Hub Edge Server API')
    .setVersion('1.0')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Hiqma Edge Hub API Docs - Swagger UI',
  });
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
