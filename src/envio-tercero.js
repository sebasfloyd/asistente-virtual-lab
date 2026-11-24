const VERBO_ENVIO = /(?:podes |pod[eé]s |puedo |quiero )?(?:manda(?:le|les)?|escrib(?:ile|irle|ile)|envia(?:le|les)?|mandar|enviar|escribirle)\b/i
const CONTEXTO_ENVIO = /\b(?:whats?app|wsp|wpp|\bwa\b|mensaje|saludos|celu|celular|tel[eé]fono|n[uú]mero)\b/i

export function extraerTelefono(texto) {
  const candidatos = String(texto || '').match(/(?:\+|00)?\d[\d\s().-]{7,18}\d/g) || []
  for (const c of candidatos) {
    const d = String(c).replace(/\D/g, '')
    if (d.length >= 10 && d.length <= 15) return d
  }
  return ''
}

export function extraerNombre(texto) {
  const t = String(texto || '')
  const llama = t.match(/\bse llama\s+([A-Za-záéíóúÁÉÍÓÚñÑ]{2,40})\b/i)
  if (llama) return capitalizar(llama[1])
  const a = t.match(/\ba\s+mi\s+(?:hermano|hermana|amigo|amiga|socio|socia|cliente)\s+([A-Za-záéíóúÁÉÍÓÚñÑ]{2,40})\b/i)
  if (a) return capitalizar(a[1])
  const aNombre = t.match(/\ba\s+([A-Za-záéíóúÁÉÍÓÚñÑ]{2,40})\b(?:\s|$|,|\.|:)/)
  if (aNombre && !/^(mi|un|una|el|la|los|las|su|este|esta|whatsapp|mensaje|celu|celular)$/i.test(aNombre[1])) {
    return capitalizar(aNombre[1])
  }
  const al = t.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ]{2,40})\s+al\b/)
  if (al) return capitalizar(al[1])
  return ''
}

function capitalizar(nombre) {
  const s = String(nombre || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function extraerCuerpo(texto) {
  let t = String(texto || '').trim()
  t = t.replace(/\bse llama\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,40}\.?/gi, '')
  t = t.replace(/(?:\+|00)?\d[\d\s().-]{7,18}\d/g, '')
  const m = t.match(/^(?:podes |pod[eé]s |puedo |quiero )?(?:mandale|escribile|decile|enviale|manda(?:r)?|enviar|escribirle)\s+(?:un\s+mensaje\s+)?(?:por\s+whats?app\s+)?(?:a\s+(?:mi\s+)?[^,.]+?\s+)?(?:que\s+)?([\s\S]+)$/i)
  if (m) t = m[1]
  t = t.replace(/^(?:que\s+)/i, '')
  t = t.replace(/\b(?:si )?celu(?:lar)?(?: es|:)\s*/gi, '')
  t = t.replace(/\s{2,}/g, ' ').replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim()
  if (!t) return ''
  if (/^(?:un\s+)?mensaje(?:\s+por\s+(?:telegram|whats?app|wsp|wpp))?$/i.test(t)) return ''
  if (/^(?:por\s+(?:telegram|whats?app|wsp|wpp)|un\s+whats?app|esto|eso)?\s*$/i.test(t)) return ''
  if (/\b(?:podes|pod[eé]s|puedo|quiero)\s+(?:mandarle|enviarle|escribirle)\b/i.test(String(texto || '')) && t.length < 40 && /hermano|hermana|amigo|mensaje|celu/.test(t)) {
    return ''
  }
  return t
}

export function parecePedidoEnvio(texto, { borrador, historial } = {}) {
  const t = String(texto || '').trim()
  if (!t || t.startsWith('/')) return false
  if (borrador?.destino) return true
  const telefono = extraerTelefono(t) || telefonoEnHistorial(historial)
  if (VERBO_ENVIO.test(t) && (CONTEXTO_ENVIO.test(t) || telefono || extraerNombre(t))) return true
  if (telefono && CONTEXTO_ENVIO.test(t)) return true
  return false
}

function telefonoEnHistorial(historial) {
  const items = Array.isArray(historial) ? historial : []
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item?.rol !== 'cliente') continue
    const n = extraerTelefono(item.texto)
    if (n) return n
  }
  return ''
}

function cuerpoEnHistorial(historial) {
  const items = Array.isArray(historial) ? historial : []
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item?.rol !== 'cliente') continue
    if (!VERBO_ENVIO.test(item.texto || '')) continue
    const cuerpo = extraerCuerpo(item.texto)
    if (cuerpo) return cuerpo
  }
  return ''
}

function nombreEnHistorial(historial, borrador) {
  if (borrador?.nombre) return borrador.nombre
  const items = Array.isArray(historial) ? historial : []
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item?.rol !== 'cliente') continue
    const n = extraerNombre(item.texto)
    if (n) return n
  }
  return ''
}

export function parsearPedidoEnvio(texto, { borrador, historial } = {}) {
  const t = String(texto || '').trim()
  if (!parecePedidoEnvio(t, { borrador, historial })) return null
  const destino = extraerTelefono(t) || borrador?.destino || telefonoEnHistorial(historial)
  const nombre = extraerNombre(t) || nombreEnHistorial(historial, borrador)
  let cuerpo = extraerCuerpo(t)
  if (!cuerpo) cuerpo = cuerpoEnHistorial(historial)
  return {
    canal: pideTelegram(t) ? 'telegram' : 'whatsapp',
    destino: destino || '',
    nombre: nombre || '',
    texto: cuerpo || '',
  }
}

export function pideTelegram(texto) {
  return /\btelegram\b/i.test(String(texto || '')) && !/\bwhats?app\b/i.test(String(texto || ''))
}

export function textoTelegramNoCelular({ destino, nombre, texto } = {}) {
  const quien = nombre || 'esa persona'
  const num = destino ? ` al ${destino}` : ''
  const cita = texto ? ` El texto quedaría: «${texto}»` : ''
  return [
    `Un bot de Telegram no puede escribirle a un número de celular. Solo puede hablarle a alguien que ya le haya escrito al bot.`,
    `Si querés mandarle a ${quien}${num}, tiene que ser por WhatsApp.`,
  ].join(' ') + cita
}

export function textoPedirCuerpo({ destino, nombre } = {}) {
  const quien = nombre || destino || 'esa persona'
  return `Dale, qué querés que le diga a ${quien}? Todavía no mandé nada: cuando lo tengas, te armo el envío para que lo confirmes con /si.`
}

export function textoPedirDestino() {
  return 'Decime el número de celular (con código de país, por ejemplo +54911...) y el texto. Todavía no mandé nada.'
}

export function textoWhatsappApagado({ destino, nombre, texto, porTelegram = false } = {}) {
  const quien = nombre || 'esa persona'
  const num = destino ? ` al ${destino}` : ''
  const cita = texto ? ` El texto quedaría: «${texto}»` : ''
  const cabeza = porTelegram
    ? `Un bot de Telegram no puede escribirle a un número de celular. Solo puede hablarle a alguien que ya le haya escrito al bot. Para mandarle a ${quien}${num} hace falta WhatsApp, y en esta compu WhatsApp no está prendido.`
    : `WhatsApp no está prendido en esta compu, así que no le pude mandar nada a ${quien}${num}.`
  return [
    cabeza,
    'Para usarlo, en el .env poné WHATSAPP=true, reiniciá con npm start y vinculá el teléfono con el QR.',
    `No le escribí a ${quien}, y este chat es el tuyo: acá no te hablo como si fueras ${quien}.`,
    'Cuando esté prendido, pedímelo de nuevo y te armo el envío para confirmar con /si.',
  ].join(' ') + cita
}
