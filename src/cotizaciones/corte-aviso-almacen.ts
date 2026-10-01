import { esFeriadoPeruYMD } from '../common/fecha/feriados-peru';

// Joel no avisa a almacén apenas aprueba cada cotización: junta todas las del día y hace un solo
// corte a las 5pm hora Perú (política confirmada con el negocio — ver AlertasCotizacionesService).
// Antes de ese corte, una cotización aprobada esa misma mañana no está "demorada" todavía.
//
// Escrito con aritmética explícita en UTC-5 (Perú no tiene horario de verano, el offset es fijo)
// para no depender de en qué huso horario corre el proceso de Node — nunca usar getHours()/
// getDay()/setHours() locales acá, dan un resultado distinto según el huso del servidor.
const OFFSET_PERU_MINUTOS = 5 * 60;
const HORA_CORTE = 17; // 5pm hora Perú

// No es un instante real: son los campos UTC de un Date corrido 5h atrás, que por eso coinciden
// con la hora de pared en Perú del instante original. Leerlos con los getters *UTC* (nunca los
// locales) es lo que hace que esto no dependa del huso del proceso.
function comoCamposPeru(instanteUtc: Date): Date {
  return new Date(instanteUtc.getTime() - OFFSET_PERU_MINUTOS * 60_000);
}

function esDiaHabilPeru(camposPeru: Date): boolean {
  const diaSemana = camposPeru.getUTCDay(); // 0 domingo ... 6 sábado
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !esFeriadoPeruYMD(camposPeru.getUTCFullYear(), camposPeru.getUTCMonth() + 1, camposPeru.getUTCDate());
}

// El corte vigente en este momento: las 5pm hora Perú del día hábil más reciente que ya pasó.
// Si "ahora" cae en un día hábil pero todavía no son las 5pm, el corte vigente es el del día
// hábil anterior (el de hoy todavía no llegó). Fines de semana y feriados no tienen corte propio
// — se salta hacia atrás hasta encontrar un día hábil.
export function corteAvisoAlmacenVigente(ahoraUtc: Date): Date {
  let camposPeru = comoCamposPeru(ahoraUtc);

  // El día de "hoy" (i === 0) solo cuenta si ya pasaron las 5pm — por eso se compara la hora.
  // Cualquier día anterior a hoy (i > 0) ya quedó atrás por completo: si es hábil, su corte de
  // las 5pm quedó en el pasado sin importar a qué hora del día actual estemos parados.
  for (let i = 0; i < 14; i++) {
    if (esDiaHabilPeru(camposPeru)) {
      const corteDelDiaComoCampos = new Date(
        Date.UTC(camposPeru.getUTCFullYear(), camposPeru.getUTCMonth(), camposPeru.getUTCDate(), HORA_CORTE, 0, 0, 0),
      );
      if (i > 0 || corteDelDiaComoCampos <= camposPeru) {
        // Campos Perú → instante UTC real: deshace el corrimiento de comoCamposPeru.
        return new Date(corteDelDiaComoCampos.getTime() + OFFSET_PERU_MINUTOS * 60_000);
      }
    }
    camposPeru = new Date(
      Date.UTC(camposPeru.getUTCFullYear(), camposPeru.getUTCMonth(), camposPeru.getUTCDate() - 1, 12, 0, 0, 0),
    );
  }
  // No debería pasar nunca (14 días cubre de sobra cualquier combinación real de feriados
  // consecutivos) — mejor fallar fuerte que devolver un corte silenciosamente incorrecto.
  throw new Error('No se encontró un día hábil en los últimos 14 días para calcular el corte de aviso a almacén');
}
