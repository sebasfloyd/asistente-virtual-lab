const WEEKDAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

export function intervalosDesdeEventos(eventos) {
  return (eventos || [])
    .map((evento) => ({
      inicio: evento?.inicio || evento?.start || evento?.startTime || '',
      fin: evento?.fin || evento?.end || evento?.endTime || '',
    }))
    .filter((intervalo) => fechaValida(intervalo.inicio) && fechaValida(intervalo.fin))
}

function fechaValida(valor) {
  const t = Date.parse(valor)
  return Number.isFinite(t)
}

export function fechaEnZona(date, zona) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const partes = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  let hora = Number(partes.hour)
  if (hora === 24) hora = 0
  return {
    anio: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora,
    minuto: Number(partes.minute),
    weekday: WEEKDAY[String(partes.weekday).slice(0, 3).toLowerCase()],
  }
}

export function armarFechaZona({ anio, mes, dia, hora, minuto }, zona) {
  let utc = Date.UTC(anio, mes - 1, dia, hora, minuto)
  for (let i = 0; i < 4; i += 1) {
    const got = fechaEnZona(new Date(utc), zona)
    const delta = Date.UTC(got.anio, got.mes - 1, got.dia, got.hora, got.minuto) - Date.UTC(anio, mes - 1, dia, hora, minuto)
    if (delta === 0) break
    utc -= delta
  }
  return new Date(utc)
}

function sumarDias(fecha, dias) {
  const d = new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia + dias))
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

function fechaIsoValida(anio, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

export function interpretarDia(texto, ahora, zona) {
  const iso = String(texto || '').match(/(20\d{2})-(\d{2})-(\d{2})/)
  if (iso) {
    const anio = Number(iso[1])
    const mes = Number(iso[2])
    const dia = Number(iso[3])
    if (fechaIsoValida(anio, mes, dia)) return { anio, mes, dia }
  }
  const n = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const hoy = fechaEnZona(new Date(ahora), zona)
  const base = { anio: hoy.anio, mes: hoy.mes, dia: hoy.dia }
  if (/(^|[^a-z])pasado manana([^a-z]|$)/.test(n)) return sumarDias(base, 2)
  if (/(^|[^a-z])manana([^a-z]|$)/.test(n)) return sumarDias(base, 1)
  if (/(^|[^a-z])hoy([^a-z]|$)/.test(n)) return base
  for (let i = 0; i < NOMBRES_DIA.length; i += 1) {
    const re = new RegExp(`(^|[^a-z])${NOMBRES_DIA[i]}([^a-z]|$)`)
    if (!re.test(n)) continue
    const delta = (i - hoy.weekday + 7) % 7
    return sumarDias(base, delta)
  }
  return null
}

function minutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function solapan(aInicio, aFin, bInicio, bFin) {
  return aInicio < bFin && aFin > bInicio
}

export function calcularHuecos({ ocupados, dia, desde, hasta, duracionMin, zona }) {
  const inicioMin = minutos(desde)
  const finMin = minutos(hasta)
  const busy = intervalosDesdeEventos(ocupados).map((intervalo) => ({
    inicio: Date.parse(intervalo.inicio),
    fin: Date.parse(intervalo.fin),
  }))
  const huecos = []
  for (let cursor = inicioMin; cursor + duracionMin <= finMin; cursor += duracionMin) {
    const inicio = armarFechaZona({ ...dia, hora: Math.floor(cursor / 60), minuto: cursor % 60 }, zona)
    const fin = armarFechaZona(
      { ...dia, hora: Math.floor((cursor + duracionMin) / 60), minuto: (cursor + duracionMin) % 60 },
      zona,
    )
    const choca = busy.some((b) => solapan(inicio.getTime(), fin.getTime(), b.inicio, b.fin))
    if (!choca) huecos.push({ inicio: inicio.toISOString(), fin: fin.toISOString() })
  }
  return huecos
}

function horaCorta(iso, zona) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(new Date(iso))
}

function fechaLarga(dia, zona) {
  const fecha = armarFechaZona({ ...dia, hora: 12, minuto: 0 }, zona)
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zona }).format(fecha)
}

export function intervaloHorario({ fecha, desde, hasta, zona }) {
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m || !/^\d{2}:\d{2}$/.test(desde || '') || !/^\d{2}:\d{2}$/.test(hasta || '')) return null
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (!fechaIsoValida(anio, mes, dia)) return null
  const [ah, am] = desde.split(':').map(Number)
  const [bh, bm] = hasta.split(':').map(Number)
  if (ah > 23 || bh > 23 || am > 59 || bm > 59) return null
  if (ah * 60 + am >= bh * 60 + bm) return null
  return {
    inicio: armarFechaZona({ anio, mes, dia, hora: ah, minuto: am }, zona).toISOString(),
    fin: armarFechaZona({ anio, mes, dia, hora: bh, minuto: bm }, zona).toISOString(),
  }
}

export function textoOcupados(intervalos, zona) {
  const limpios = intervalosDesdeEventos(intervalos)
  if (!limpios.length) return 'No hay ocupados cargados.'
  return limpios
    .map((intervalo) => {
      const p = fechaEnZona(new Date(intervalo.inicio), zona)
      const dia = `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
      return `${dia} ${horaCorta(intervalo.inicio, zona)} a ${horaCorta(intervalo.fin, zona)}`
    })
    .join('\n')
}

export function textoHuecos({ huecos, dia, zona, hayDatos, diaEntendido }) {
  if (!diaEntendido) return 'Para qué día lo querés? Podés decir hoy, mañana o una fecha AAAA-MM-DD.'
  if (!hayDatos) return 'Todavía no hay una agenda cargada, así que no te puedo decir huecos. No invento que el día está libre.'
  const cuando = fechaLarga(dia, zona)
  if (!huecos.length) return `El ${cuando} no tengo huecos libres en el horario de atención.`
  const muestra = huecos.slice(0, 8)
  const lista = muestra.map((h) => `• ${horaCorta(h.inicio, zona)} a ${horaCorta(h.fin, zona)}`).join('\n')
  const extra = huecos.length > muestra.length ? '\nHay más tarde; si querés te los detallo.' : ''
  return `Huecos libres el ${cuando}:\n${lista}${extra}\nUn hueco no es una reserva: el dueño lo confirma.`
}

const PISTAS_HUECO = ['lugar', 'turno', 'disponibilidad', 'hueco', 'cita', 'reserva', 'reservar']

export function esPreguntaDeHuecos(texto) {
  const n = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
  return PISTAS_HUECO.some((pista) => ` ${n} `.includes(` ${pista} `) || n.split(' ').some((w) => w === `${pista}s`))
}
