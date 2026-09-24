import { crearUsuarioSchema, PASSWORD_MIN } from './usuarios.dto';

const valido = { nombre: 'Ana', email: 'ana@empresa.com', password: 'Quimica2026x' };

describe('crearUsuarioSchema — contraseña inicial', () => {
  it('acepta una contraseña con largo suficiente, letras y números', () => {
    expect(crearUsuarioSchema.safeParse(valido).success).toBe(true);
  });

  it('acepta justo el mínimo', () => {
    expect(crearUsuarioSchema.safeParse({ ...valido, password: 'abcdefghi1' }).success).toBe(true);
  });

  it('rechaza una más corta que el mínimo (antes bastaban 8)', () => {
    const r = crearUsuarioSchema.safeParse({ ...valido, password: 'Abc12345' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain(String(PASSWORD_MIN));
  });

  it('exige letras y números', () => {
    for (const password of ['1234567890', 'sololetrasaqui']) {
      const r = crearUsuarioSchema.safeParse({ ...valido, password });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toContain('letras y números');
    }
  });
});
