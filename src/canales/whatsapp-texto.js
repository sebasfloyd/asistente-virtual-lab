export function esJidIgnorado(jid) {
  const id = String(jid || '')
  return !id || id === 'status@broadcast' || id.endsWith('@g.us') || id.endsWith('@newsletter')
}

export function textoPlano(message) {
  if (!message) return ''
  const interno = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message
  return (interno.conversation || interno.extendedTextMessage?.text || '').trim()
}

// Vacío: no se atiende a nadie salvo al dueño. "todos": a cualquiera. Si no, números separados por coma.
export function atiendeWhatsapp(mensaje, { clientes = '', duenio = '' } = {}) {
  const lista = String(clientes || '').trim().toLowerCase()
  if (lista === 'todos') return true
  const numero = (jid) => {
    const s = String(jid || '')
    return s.endsWith('@s.whatsapp.net') ? s.split('@')[0].split(':')[0] : ''
  }
  const key = mensaje?.key || {}
  const quienes = [key.remoteJid, key.senderPn, key.remoteJidAlt].map(numero).filter(Boolean)
  const permitidos = [...lista.split(','), String(duenio || '')].map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 8)
  return quienes.some((n) => permitidos.includes(n))
}

export function textoDeWhatsapp(mensaje) {
  if (!mensaje || mensaje.key?.fromMe) return null
  const jid = mensaje.key?.remoteJid || ''
  if (esJidIgnorado(jid)) return null
  const texto = textoPlano(mensaje.message)
  if (!texto) return null
  return { canal: 'whatsapp', senderId: jid, responderId: jid, texto }
}
