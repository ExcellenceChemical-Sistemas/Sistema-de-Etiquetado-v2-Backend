import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

// Los controladores de usuarios validan el cuerpo con `schema.parse(body)`. Sin
// este filtro, un cuerpo inválido salía como 500 "Internal server error" y quien
// llamaba no sabía qué corregir. Ahora es un 400 con el motivo de cada campo.
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: exception.issues.map((i) => i.message).join('; '),
      errores: exception.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }
}
