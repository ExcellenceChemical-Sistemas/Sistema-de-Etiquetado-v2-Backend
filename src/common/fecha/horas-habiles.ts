// Horas hábiles de Excellence Chemical: lunes a viernes, 7:30am a 5:30pm, menos el refrigerio.
// Se usa para medir cuánto tiempo "real de trabajo" pasó desde un evento (ej.
// AlertasPedidosService), sin contar noches, fines de semana ni el refrigerio, que inflarían el
// conteo sin que nadie pudiera haber actuado.
const INICIO_JORNADA = { hora: 7, minuto: 30 };
const FIN_JORNADA = { hora: 17, minuto: 30 };

// El refrigerio es escalonado por persona (Joel/Alice 1-2pm, Jheremy/Hiro/Charlie 12-1pm). Esta
// función se usa hoy solo para la alerta de Pedidos (AlertasPedidosService), cuyo responsable es
// Charlie — por eso toma su horario. Si en el futuro se reusa para otro módulo con otro
// responsable, hay que revisar si corresponde el mismo refrigerio o parametrizarlo.
const REFRIGERIO = { horaInicio: 12, horaFin: 13 };

function restarOverlap(segmentoInicio: Date, segmentoFin: Date, desde: Date, hasta: Date): number {
  const inicio = segmentoInicio > desde ? segmentoInicio : desde;
  const fin = segmentoFin < hasta ? segmentoFin : hasta;
  return fin > inicio ? (fin.getTime() - inicio.getTime()) / 3_600_000 : 0;
}

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
        const inicioRefrigerio = new Date(cursor);
        inicioRefrigerio.setHours(REFRIGERIO.horaInicio, 0, 0, 0);
        const finRefrigerio = new Date(cursor);
        finRefrigerio.setHours(REFRIGERIO.horaFin, 0, 0, 0);

        const horasBrutas = (segmentoFin.getTime() - segmentoInicio.getTime()) / 3_600_000;
        const horasRefrigerio = restarOverlap(segmentoInicio, segmentoFin, inicioRefrigerio, finRefrigerio);
        horas += horasBrutas - horasRefrigerio;
      }
    }

    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return horas;
}
