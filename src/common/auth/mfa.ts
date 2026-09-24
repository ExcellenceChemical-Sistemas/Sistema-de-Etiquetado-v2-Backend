// Segundo factor (TOTP de Supabase Auth). El login normal da una sesión de nivel
// `aal1`; al verificar el código de la app autenticadora pasa a `aal2`, y ese nivel
// viaja en el claim `aal` del JWT. Si solo el frontend pidiera el código, quien
// tenga la contraseña podría llamar a la API con su sesión `aal1` y saltárselo:
// por eso el backend lo exige acá, en cada request.

export type NivelAal = 'aal1' | 'aal2';

export type ResultadoMfa = 'OK' | 'MFA_REQUERIDO' | 'MFA_ENROLAR';

interface FactorSupabase {
  factor_type?: string;
  status?: string;
}

/**
 * Lee el claim `aal` del JWT. Se llama DESPUÉS de que `auth.getUser(token)` ya
 * validó la firma, así que acá solo se decodifica, no se vuelve a verificar.
 * Devuelve null si no se puede leer: quien lo use debe tratarlo como "no verificado".
 */
export function leerAal(token: string): NivelAal | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload?.aal === 'aal2' ? 'aal2' : payload?.aal === 'aal1' ? 'aal1' : null;
  } catch {
    return null;
  }
}

/** Un factor sin verificar (enrolamiento a medias) no cuenta como segundo factor activo. */
export function tieneSegundoFactor(factors: FactorSupabase[] | null | undefined): boolean {
  return (factors ?? []).some((f) => f.status === 'verified');
}

export function evaluarMfa(p: {
  aal: NivelAal | null;
  factors: FactorSupabase[] | null | undefined;
  esAdmin: boolean;
  esAdminKpis: boolean;
  /** EXIGIR_MFA_ADMIN=true: los administradores no pueden operar sin segundo factor. */
  exigirAdmin: boolean;
}): ResultadoMfa {
  if (tieneSegundoFactor(p.factors)) {
    return p.aal === 'aal2' ? 'OK' : 'MFA_REQUERIDO';
  }
  if (p.exigirAdmin && (p.esAdmin || p.esAdminKpis)) return 'MFA_ENROLAR';
  return 'OK';
}
