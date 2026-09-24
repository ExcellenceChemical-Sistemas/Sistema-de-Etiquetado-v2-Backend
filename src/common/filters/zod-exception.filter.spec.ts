import { z } from 'zod';
import { ZodExceptionFilter } from './zod-exception.filter';
import { crearUsuarioSchema } from '../../usuario/dto/usuarios.dto';

function ejecutar(error: z.ZodError) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host: any = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
  new ZodExceptionFilter().catch(error, host);
  return { status, cuerpo: json.mock.calls[0][0] };
}

describe('ZodExceptionFilter', () => {
  it('convierte un cuerpo inválido en 400 con el motivo, no en 500', () => {
    const r = crearUsuarioSchema.safeParse({ nombre: 'Ana', email: 'ana@empresa.com', password: 'corta1' });
    if (r.success) throw new Error('debía fallar');

    const { status, cuerpo } = ejecutar(r.error);

    expect(status).toHaveBeenCalledWith(400);
    expect(cuerpo.message).toContain('al menos 10 caracteres');
    expect(cuerpo.errores).toEqual([{ campo: 'password', mensaje: expect.stringContaining('10 caracteres') }]);
  });

  it('junta el motivo de varios campos inválidos', () => {
    const r = crearUsuarioSchema.safeParse({ nombre: '', email: 'no-es-un-mail', password: 'Quimica2026x' });
    if (r.success) throw new Error('debía fallar');

    const { cuerpo } = ejecutar(r.error);

    expect(cuerpo.errores.map((e: { campo: string }) => e.campo).sort()).toEqual(['email', 'nombre']);
  });
});
