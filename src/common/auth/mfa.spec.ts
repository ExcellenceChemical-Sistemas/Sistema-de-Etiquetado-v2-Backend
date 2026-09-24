import { evaluarMfa, leerAal, tieneSegundoFactor } from './mfa';

function jwt(payload: object): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${parte({ alg: 'ES256' })}.${parte(payload)}.firma`;
}

describe('leerAal', () => {
  it('lee aal1 y aal2 del JWT', () => {
    expect(leerAal(jwt({ aal: 'aal1' }))).toBe('aal1');
    expect(leerAal(jwt({ aal: 'aal2' }))).toBe('aal2');
  });

  it('devuelve null si falta, es desconocido o el token no es un JWT', () => {
    expect(leerAal(jwt({ sub: 'x' }))).toBeNull();
    expect(leerAal(jwt({ aal: 'aal3' }))).toBeNull();
    expect(leerAal('basura')).toBeNull();
    expect(leerAal('')).toBeNull();
  });
});

describe('tieneSegundoFactor', () => {
  it('solo cuenta un factor verificado', () => {
    expect(tieneSegundoFactor([{ factor_type: 'totp', status: 'verified' }])).toBe(true);
    expect(tieneSegundoFactor([{ factor_type: 'totp', status: 'unverified' }])).toBe(false);
  });

  it('sin factores (o campo ausente) es que no tiene', () => {
    expect(tieneSegundoFactor([])).toBe(false);
    expect(tieneSegundoFactor(undefined)).toBe(false);
    expect(tieneSegundoFactor(null)).toBe(false);
  });
});

describe('evaluarMfa', () => {
  const verificado = [{ factor_type: 'totp', status: 'verified' }];
  const base = { esAdmin: false, esAdminKpis: false, exigirAdmin: false };

  it('con segundo factor activo exige aal2: una sesión aal1 (solo contraseña) no pasa', () => {
    expect(evaluarMfa({ ...base, aal: 'aal1', factors: verificado })).toBe('MFA_REQUERIDO');
    expect(evaluarMfa({ ...base, aal: null, factors: verificado })).toBe('MFA_REQUERIDO');
    expect(evaluarMfa({ ...base, aal: 'aal2', factors: verificado })).toBe('OK');
  });

  it('un factor a medio enrolar no bloquea el acceso', () => {
    expect(evaluarMfa({ ...base, aal: 'aal1', factors: [{ status: 'unverified' }] })).toBe('OK');
  });

  it('sin factor y sin exigencia, nadie queda bloqueado (activarlo es opcional)', () => {
    expect(evaluarMfa({ ...base, esAdmin: true, aal: 'aal1', factors: undefined })).toBe('OK');
  });

  it('con EXIGIR_MFA_ADMIN los administradores sin factor deben enrolarse', () => {
    const exigir = { ...base, exigirAdmin: true, aal: 'aal1' as const, factors: undefined };
    expect(evaluarMfa({ ...exigir, esAdmin: true })).toBe('MFA_ENROLAR');
    expect(evaluarMfa({ ...exigir, esAdminKpis: true })).toBe('MFA_ENROLAR');
  });

  it('con EXIGIR_MFA_ADMIN los usuarios comunes sin factor siguen entrando', () => {
    expect(evaluarMfa({ ...base, exigirAdmin: true, aal: 'aal1', factors: undefined })).toBe('OK');
  });

  it('un administrador que ya lo activó y verificó pasa aunque se exija', () => {
    expect(evaluarMfa({ ...base, esAdmin: true, exigirAdmin: true, aal: 'aal2', factors: verificado })).toBe('OK');
  });
});
