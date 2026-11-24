export function esJidIgnorado(jid) {
  const id = String(jid || '')
  return !id || id === 'status@broadcast' || id.endsWith('@g.us') || id.endsWith('@newsletter')
}

export function textoPlano(message) {
  if (!message) return ''
  const interno = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message
  return (interno.conversation || interno.extendedTextMessage?.text || '').trim()
}

export function textoDeWhatsapp(mensaje) {
  if (!mensaje || mensaje.key?.fromMe) return null
  const jid = mensaje.key?.remoteJid || ''
  if (esJidIgnorado(jid)) return null
  const texto = textoPlano(mensaje.message)
  if (!texto) return null
  return { canal: 'whatsapp', senderId: jid, responderId: jid, texto }
}
