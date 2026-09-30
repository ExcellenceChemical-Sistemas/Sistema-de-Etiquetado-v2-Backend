// Horas hábiles de Excellence Chemical: lunes a viernes, 7:30am a 5:30pm, menos el refrigerio. Se
// usa para medir cuánto tiempo "real de trabajo" pasó desde un evento (ej. AlertasPedidosService),
// sin contar noches, fines de semana ni el refrigerio, que inflarían el conteo sin que nadie
// pudiera haber actuado.
const INICIO_JORNADA = { hora: 7, minuto: 30 };
const FIN_JORNADA = { hora: 17, minuto: 30 };

export interface Refrigerio {
  inicioMinutos: number; // minutos desde medianoche
  finMinutos: number;
}

function restarOverlap(segmentoInicio: Date, segmentoFin: Date, desde: Date, hasta: Date): number {
  const inicio = segmentoInicio > desde ? segmentoInicio : desde;
  const fin = segmentoFin < hasta ? segmentoFin : hasta;
  return fin > inicio ? (fin.getTime() - inicio.getTime()) / 3_600_000 : 0;
}

// El refrigerio es escalonado por persona (Joel/Alice 1-2pm, Jheremy/Hiro/Charlie 12-1pm, cada
// quien lo carga en su perfil — ver PATCH /usuarios/:id/refrigerio). Cuando el llamador pasa el
// refrigerio de varias personas (ej. todas las que pueden marcar un pedido como entregado), solo
// se descuenta la INTERSECCIÓN de sus horarios: si están escalonados para que siempre haya alguien
// cubriendo, nunca se descuenta nada; si coinciden, se descuenta la franja en que nadie puede
// actuar. Sin refrigerios (array vacío), no se descuenta nada.
function interseccionRefrigerios(refrigerios: Refrigerio[]): { inicioMinutos: number; finMinutos: number } | null {
  if (refrigerios.length === 0) return null;
  const inicioMinutos = Math.max(...refrigerios.map((r) => r.inicioMinutos));
  const finMinutos = Math.min(...refrigerios.map((r) => r.finMinutos));
  return finMinutos > inicioMinutos ? { inicioMinutos, finMinutos } : null;
}

export function horasHabilesEntre(inicio: Date, fin: Date, refrigerios: Refrigerio[] = []): number {
  const refrigerioComun = interseccionRefrigerios(refrigerios);
  let horas = 0;
  let cursor = new Date(inicio);

  while (cursor < fin) {
    const diaSemana = cursor.getDay(); // 0 = domingo ... 6 = sábado
    if (diaSemana >= 1 && diaSemana <= 5) {
      const inicioJornada = new Date(cursor);
      inicioJornada.setHours(INICIO_JORNADA.hora, INICIO_JORNADA.minuto, 0, 0);
      const finJornada = new Date(cursor);
      finJornada.setHours(FIN_JORNADA.hora, FIN_JORNADA.minuto, 0, 0);

      const segmentoInicio = cursor > inicioJornada ? cursor : inicioJornada;
      const segmentoFin = fin < finJornada ? fin : finJornada;
      if (segmentoFin > segmentoInicio) {
        let horasRefrigerio = 0;
        if (refrigerioComun) {
          const inicioRefrigerio = new Date(cursor);
          inicioRefrigerio.setHours(0, refrigerioComun.inicioMinutos, 0, 0);
          const finRefrigerio = new Date(cursor);
          finRefrigerio.setHours(0, refrigerioComun.finMinutos, 0, 0);
          horasRefrigerio = restarOverlap(segmentoInicio, segmentoFin, inicioRefrigerio, finRefrigerio);
        }
        horas += (segmentoFin.getTime() - segmentoInicio.getTime()) / 3_600_000 - horasRefrigerio;
      }
    }

    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return horas;
}
