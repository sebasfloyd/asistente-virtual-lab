import { fechaEnZona, intervalosDesdeEventos, textoOcupados } from './huecos.js'

export const PROMPT_MAILS = [
  'Resumí los mails recientes e importantes.',
  'Si hace falta, proponé un borrador de respuesta por cada uno.',
  'No envíes ningún mail, no crees eventos y no escribas archivos.',
].join(' ')

export function tocaResumen(estado, ahora, zona, horaConfig) {
  if (!horaConfig) return ''
  const [hora, minuto] = String(horaConfig).split(':').map(Number)
  if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return ''
  const local = fechaEnZona(new Date(ahora), zona)
  const clave = `${local.anio}-${local.mes}-${local.dia}`
  if (estado.ultimoResumen === clave) return ''
  const minutos = local.hora * 60 + local.minuto
  const objetivo = hora * 60 + minuto
  if (minutos < objetivo || minutos > objetivo + 5) return ''
  return clave
}

export function textoResumen({ pendientes = [], intervalos = [], zona, ahora, mail }) {
  const hoy = fechaEnZona(new Date(ahora), zona)
  const delDia = intervalosDesdeEventos(intervalos).filter((item) => {
    const p = fechaEnZona(new Date(item.inicio), zona)
    return p.anio === hoy.anio && p.mes === hoy.mes && p.dia === hoy.dia
  })
  const pendientesTxt = pendientes.length
    ? pendientes.map((p) => `#${p.id} (${p.canal}): ${String(p.textoCliente || '').slice(0, 80)}`).join('\n')
    : 'No hay borradores esperando.'
  const agenda = delDia.length ? textoOcupados(delDia, zona) : 'Hoy no hay ocupados cargados.'
  return [
    'Resumen del día',
    '',
    'Pendientes:',
    pendientesTxt,
    '',
    'Agenda de hoy:',
    agenda,
    '',
    'Mails:',
    mail || 'Sin conector de mail en esta corrida. No invento correos.',
  ].join('\n')
}
