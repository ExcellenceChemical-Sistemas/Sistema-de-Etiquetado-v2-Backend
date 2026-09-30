// Horas hábiles de Excellence Chemical: lunes a viernes, 7:30am a 5:30pm. Se usa para medir
// cuánto tiempo "real de trabajo" pasó desde un evento (ej. AlertasPedidosService), sin contar
// noches ni fines de semana, que inflarían el conteo sin que nadie pudiera haber actuado.
const INICIO_JORNADA = { hora: 7, minuto: 30 };
const FIN_JORNADA = { hora: 17, minuto: 30 };

export function horasHabilesEntre(inicio: Date, fin: Date): number {
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
        horas += (segmentoFin.getTime() - segmentoInicio.getTime()) / 3_600_000;
      }
    }

    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return horas;
}
