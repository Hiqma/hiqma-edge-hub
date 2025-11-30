import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('redoc')
export class RedocController {
  @Get()
  getRedoc(@Res() res: Response) {
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>Hiqma Edge Hub API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
      body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <redoc spec-url='/api-json'></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@2.0.0/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
    res.send(html);
  }
}