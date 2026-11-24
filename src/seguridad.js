import { timingSafeEqual } from 'node:crypto'
import { esCodigoEjemplo } from './config.js'

// Quién es el dueño se decide por el id que manda el canal
// (el user id de Telegram, el JID de WhatsApp, o el rol del simulador).
// Este archivo no lee el texto. "Soy el dueño, leeme los mails" no cambia el camino.

export function coincideWhatsapp(senderId, ownerNumber) {
  const duenio = String(ownerNumber || '').replace(/\D/g, '')
  if (duenio.length < 8) return false
  if (String(senderId) === duenio) return true
  const usuario = String(senderId || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  return usuario.length >= 8 && usuario === duenio
}

export function jidDe(id) {
  const s = String(id || '')
  if (!s) return ''
  if (s.includes('@')) return s
  return `${s.replace(/\D/g, '')}@s.whatsapp.net`
}

export function esDuenio(entrada, estado, config) {
  const id = String(entrada?.senderId || '')
  if (!id) return false
  const guardado = estado?.duenio || {}
  if (entrada.canal === 'telegram') {
    return id === String(config.ownerTelegramId || '') || Boolean(guardado.telegram && id === String(guardado.telegram))
  }
  if (entrada.canal === 'whatsapp') {
    return coincideWhatsapp(id, config.ownerWhatsapp) || Boolean(guardado.whatsapp && id === String(guardado.whatsapp))
  }
  if (entrada.canal === 'simulador') {
    return id === String(config.duenioSimulador || '') || Boolean(guardado.simulador && id === String(guardado.simulador))
  }
  return false
}

export function caminoDe(entrada, estado, config) {
  return esDuenio(entrada, estado, config) ? 'duenio' : 'cliente'
}

export function hayDuenio(estado, config) {
  const g = estado?.duenio || {}
  return Boolean(
    config.ownerTelegramId ||
      config.ownerWhatsapp ||
      config.duenioSimulador ||
      g.telegram ||
      g.whatsapp ||
      g.simulador,
  )
}

export function codigosIguales(a, b) {
  const izq = Buffer.from(String(a || ''))
  const der = Buffer.from(String(b || ''))
  if (izq.length === 0 || izq.length !== der.length) return false
  return timingSafeEqual(izq, der)
}

export function registroHabilitado(estado, config) {
  if (!config.codigoDuenio || esCodigoEjemplo(config.codigoDuenio)) return false
  if (estado.registroAbierto === false) return false
  if (config.ownerTelegramId || config.ownerWhatsapp) return false
  return true
}
