import { calcularHuecos, fechaEnZona, intervaloHorario } from './huecos.js'

export function parsearHorarios(texto) {
  const t = String(texto || '').trim()
  const cmd = t.match(/^\/horarios(?:@\w+)?\s+([\s\S]+)$/i)
  const cuerpo = cmd ? cmd[1].trim() : t
  if (!cuerpo) return null
  if (!cmd && !parecePedidoHorarios(t)) return null
  const partes = cuerpo.split(/\s*\|\s*/)
  let quien = ''
  let resto = cuerpo
  if (partes.length >= 2) {
    quien = partes[0].trim()
    resto = partes.slice(1).join(' ')
  } else {
    const m = cuerpo.match(/^(?:ofrece(?:le|les)?|manda(?:le)?|propon[eé]|tira(?:le)?)\s+horarios?\s+a\s+(.+?)\s+para\b/i)
      || cuerpo.match(/^(?:ofrece(?:le|les)?|propon[eé])\s+a\s+(.+?)\s+(?:horarios?|una reuni[oó]n|un turno)/i)
    if (m) quien = m[1].trim()
    else if (cmd) quien = cuerpo.split(/\s+para\s+|\s+\d/)[0].trim()
  }
  const mail = cuerpo.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/)
  if (mail && !quien) quien = mail[0]
  const dur = cuerpo.match(/(\d{2,3})\s*(?:min|mins|minutos)?/i)
  const duracionMin = dur ? Math.min(240, Math.max(15, Number(dur[1]))) : 30
  if (!quien && !cmd) return null
  return {
    quien: (quien || 'la persona').replace(/<[^>]+>/g, '').trim(),
    para: mail ? mail[0] : '',
    duracionMin,
    ventana: /semana/i.test(cuerpo) ? 'semana' : 'semana',
  }
}

export function parecePedidoHorarios(texto) {
  const n = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (/^\/horarios\b/.test(n)) return true
  return /horario|hueco|disponib|reuni[oó]n|agendar|agenda/.test(n)
    && /ofrec|propon|tir[ae]|manda|esta semana|30|reunion/.test(n)
}

export function diasDeVentana(ahora, zona, cantidad = 5) {
  const hoy = fechaEnZona(new Date(ahora), zona)
  const dias = []
  let delta = 0
  while (dias.length < cantidad && delta < 14) {
    const utc = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + delta)
    const d = new Date(utc)
    const p = fechaEnZona(d, zona)
    const base = { anio: p.anio, mes: p.mes, dia: p.dia, weekday: p.weekday }
    if (base.weekday !== 0 && base.weekday !== 6) dias.push(base)
    delta += 1
  }
  return dias
}

export function proponerTresHuecos({ ocupados = [], ahora, zona, desde, hasta, duracionMin }) {
  const dias = diasDeVentana(ahora, zona)
  const slots = []
  for (const dia of dias) {
    const huecos = calcularHuecos({ ocupados, dia, desde, hasta, duracionMin, zona })
    for (const hueco of huecos) {
      if (Date.parse(hueco.inicio) <= ahora) continue
      const p = fechaEnZona(new Date(hueco.inicio), zona)
      const f = fechaEnZona(new Date(hueco.fin), zona)
      slots.push({
        fecha: `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`,
        desde: `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`,
        hasta: `${String(f.hora).padStart(2, '0')}:${String(f.minuto).padStart(2, '0')}`,
        inicio: hueco.inicio,
        fin: hueco.fin,
      })
      if (slots.length >= 3) return slots
    }
  }
  return slots
}

export function parsearSlotsCerebro(texto, zona = "America/Argentina/Buenos_Aires") {
  const crudo = String(texto || '')
  const json = crudo.match(/\[[\s\S]*\]/)
  if (json) {
    try {
      const arr = JSON.parse(json[0])
      return (arr || []).map((item) => normalizarSlot(item, zona)).filter(Boolean).slice(0, 3)
    } catch { /* sigue */ }
  }
  const slots = []
  const re = /(\d{4}-\d{2}-\d{2}).{0,8}(\d{2}:\d{2}).{1,20}(\d{2}:\d{2})/g
  let m
  while ((m = re.exec(crudo)) && slots.length < 3) {
    const slot = normalizarSlot({ fecha: m[1], desde: m[2], hasta: m[3] }, zona)
    if (slot) slots.push(slot)
  }
  return slots
}

function normalizarSlot(item, zona = 'America/Argentina/Buenos_Aires') {
  if (!item) return null
  if (item.inicio && item.fin && !item.fecha) {
    return { inicio: item.inicio, fin: item.fin, fecha: String(item.inicio).slice(0, 10), desde: '', hasta: '' }
  }
  const fecha = item.fecha || item.dia || ''
  const desde = item.desde || item.inicioHora || item.start || ''
  const hasta = item.hasta || item.finHora || item.end || ''
  const inter = intervaloHorario({ fecha, desde, hasta, zona })
  if (inter) return { fecha, desde, hasta, inicio: inter.inicio, fin: inter.fin }
  if (fecha && desde && hasta) return { fecha, desde, hasta, inicio: '', fin: '' }
  return null
}

export function textoSlots(slots, zona, { quien, duracionMin } = {}) {
  if (!slots?.length) return 'No encontré 3 huecos libres en esta semana, en el horario de atención.'
  const lineas = slots.map((s, i) => {
    const etiqueta = s.fecha && s.desde && s.hasta
      ? `${s.fecha} ${s.desde}–${s.hasta}`
      : `${s.inicio} – ${s.fin}`
    return `${i + 1}. ${etiqueta}`
  })
  const para = quien ? ` para ${quien}` : ''
  return [
    `Te propongo estos ${slots.length} huecos${para}, de ${duracionMin || 30} min, en tu zona:`,
    ...lineas,
    `Si alguno sirve, confirmá con /si N M (N es el número de la acción, M es el hueco). Hasta el /si no se crea el evento ni se invita a nadie.`,
  ].join('\n')
}

export function promptDeHorarios({ quien, duracionMin, zona, desde, hasta }) {
  return [
    `Buscá 3 huecos libres de ${duracionMin} minutos para una reunión con ${quien}, de acá a 7 días hábiles.`,
    `Zona horaria: ${zona}. Jornada: ${desde} a ${hasta}.`,
    'Usá las herramientas de lectura de Google Calendar (list_events, suggest_time, search_events). No crees ni muevas eventos.',
    'No listes títulos de eventos ajenos. No inventes huecos si no pudiste leer la agenda.',
    'Respondé SOLO un JSON, un array de hasta 3 objetos: {"fecha":"AAAA-MM-DD","desde":"HH:MM","hasta":"HH:MM"}.',
    'Si no pudiste leer el calendario, devolvé [] y en una línea aparte decí que hay que conectar Google Calendar en https://claude.ai/customize/connectors.',
  ].join(' ')
}
