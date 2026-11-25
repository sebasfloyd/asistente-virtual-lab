// Piezas de npm run setup que no necesitan terminal (para poder probarlas).
import { randomBytes } from 'node:crypto'

export const TEXTO_CANALES = `Por dónde querés que te hablen tus clientes?
  1) Telegram  (lo más fácil, recomendado para empezar)
  2) WhatsApp por QR  (rápido, pero NO es oficial: usá un chip aparte, Meta puede bloquear el número)
  3) WhatsApp API oficial de Meta  (lo serio para un negocio: pide cuenta de Meta Business, número verificado y una URL pública)`

export const TEXTO_API_REQUISITOS = `WhatsApp API oficial (Meta Cloud API). Antes de seguir necesitás:
  • Una cuenta de Meta Business y una app en developers.facebook.com con el producto WhatsApp.
  • Un número para el asistente (no puede estar usándose en la app de WhatsApp del celu).
  • El "Phone number ID" (en WhatsApp → Configuración de la API).
  • Un access token permanente (usuario de sistema en business.facebook.com). El temporal vence en 24 h.
  • Opcional pero recomendado: el "App secret" (Configuración de la app → Básica), para comprobar que los mensajes vienen de Meta.
Ojo: si el cliente no te escribió en las últimas 24 h, Meta solo deja abrir la charla con una plantilla aprobada, y cobra por conversación.`

export const TEXTO_POR_QUE_MAIL = `Mail propio del asistente
Conviene que el asistente tenga SU cuenta de Gmail (ej. martin.asistente@gmail.com), no la tuya:
  • Los clientes ven que escribe el asistente, y vos recibís copia de todo.
  • Si algo sale mal, revocás esa clave y tu mail personal queda intacto.
  • Nunca le das la contraseña de tu cuenta a ningún programa.
Pasos (5 minutos):
  1. Creá una cuenta nueva en https://accounts.google.com/signup
  2. Prendé la verificación en 2 pasos: https://myaccount.google.com/signinoptions/twosv
  3. Creá una contraseña de aplicación: https://myaccount.google.com/apppasswords  (son 16 letras)
Esa contraseña solo sirve para mandar mails desde el asistente, y la podés borrar cuando quieras.`

export function cambiosCanal(opcion) {
  if (opcion === '2') return { TELEGRAM: 'false', WHATSAPP: 'true', WHATSAPP_MODO: 'qr' }
  if (opcion === '3') return { TELEGRAM: 'false', WHATSAPP: 'true', WHATSAPP_MODO: 'api' }
  return { TELEGRAM: 'true', WHATSAPP: 'false' }
}

export function opcionActual(env) {
  if (String(env.WHATSAPP).toLowerCase() === 'true') return String(env.WHATSAPP_MODO).toLowerCase() === 'api' ? '3' : '2'
  return '1'
}

export const esMailValido = (m) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(m || '').trim())

export function limpiarClaveApp(clave) {
  return String(clave || '').replace(/\s+/g, '')
}

export function claveAppValida(clave) {
  return /^[a-zA-Z]{16}$/.test(limpiarClaveApp(clave))
}

// El asistente tiene que tener su propia identidad: nunca la cuenta del dueño.
export function problemaMailAsistente(usuario, mailDuenio) {
  const u = String(usuario || '').trim().toLowerCase()
  if (!esMailValido(u)) return 'Eso no parece un mail.'
  if (mailDuenio && u === String(mailDuenio).trim().toLowerCase()) {
    return 'Ese es TU mail. El asistente tiene que tener una cuenta propia (creá una nueva, ej. tunegocio.asistente@gmail.com).'
  }
  return ''
}

// Probado con Gmail. Otro proveedor: completá MAIL_SMTP=host:puerto a mano en .env.
export function servidorSmtpPara() {
  return 'smtp.gmail.com:465'
}

export function cambiosMail({ usuario, clave, mailDuenio = '' }) {
  const cambios = {
    MAIL_USUARIO: String(usuario).trim(),
    MAIL_CLAVE_APP: limpiarClaveApp(clave),
    MAIL_SMTP: servidorSmtpPara(usuario),
  }
  if (esMailValido(mailDuenio)) cambios.MAIL_COPIA = String(mailDuenio).trim()
  return cambios
}

export function nuevoVerifyToken() {
  return randomBytes(18).toString('hex')
}

export function cambiosWhatsappApi({ phoneId, token, appSecret = '', verifyToken = '', plantilla = '' }) {
  const cambios = {
    WHATSAPP_API_PHONE_ID: String(phoneId || '').replace(/\D/g, ''),
    WHATSAPP_API_VERIFY_TOKEN: verifyToken || nuevoVerifyToken(),
  }
  if (token) cambios.WHATSAPP_API_TOKEN = String(token).trim()
  if (appSecret) cambios.WHATSAPP_API_APP_SECRET = String(appSecret).trim()
  if (plantilla) cambios.WHATSAPP_API_PLANTILLA = String(plantilla).trim()
  return cambios
}

export function textoWebhook(puerto, verifyToken) {
  return `Para que te lleguen los mensajes, Meta tiene que poder llamar a tu compu por https:
  1. Instalá cloudflared (Mac: brew install cloudflared) y en otra terminal corré:
       cloudflared tunnel --url http://localhost:${puerto}
     Te da una dirección tipo https://algo.trycloudflare.com
  2. En developers.facebook.com → tu app → WhatsApp → Configuración → Webhook:
       URL de devolución de llamada: https://algo.trycloudflare.com/webhook
       Token de verificación: ${verifyToken || '(corré npm run setup)'}
     y suscribite al campo "messages".
  3. El asistente tiene que estar corriendo (npm start) cuando Meta verifica.
La dirección de trycloudflare cambia cada vez; para algo fijo usá un túnel con nombre o un servidor.`
}
