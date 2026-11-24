import { atiendeWhatsapp, esJidIgnorado, textoDeWhatsapp } from './whatsapp-texto.js'
import { aWhatsapp } from '../formato.js'

export { esJidIgnorado, textoDeWhatsapp }

export async function crearWhatsapp({ dirSesion, onMensaje, log = () => {}, clientes = '', duenio = '' }) {
  let baileys
  let qrcode
  let pino
  try {
    baileys = await import('@whiskeysockets/baileys')
    qrcode = await import('qrcode-terminal')
    pino = await import('pino')
  } catch {
    return null
  }

  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys
  let parado = false
  let sock = null
  let intento = 0
  const vistos = new Set()

  async function conectar() {
    if (parado) return
    const { state, saveCreds } = await useMultiFileAuthState(dirSesion)
    const hacerLogger = pino.default ?? pino
    const qr = qrcode.default ?? qrcode
    sock = makeWASocket({
      auth: state,
      logger: hacerLogger({ level: 'silent' }),
      syncFullHistory: false,
      markOnlineOnConnect: false,
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        log('WhatsApp: escaneá el QR con un chip aparte (Ajustes → Dispositivos vinculados).')
        qr.generate(update.qr, { small: true })
      }
      if (update.connection === 'open') {
        intento = 0
        log('WhatsApp conectado.')
      }
      if (update.connection === 'close') {
        const codigo = update.lastDisconnect?.error?.output?.statusCode
        if (codigo === DisconnectReason.loggedOut) {
          log('WhatsApp cerró la sesión. Borrá data/sesion-whatsapp y volvé a escanear.')
          return
        }
        if (parado) return
        const espera = Math.min(30000, 1000 * 2 ** intento)
        intento += 1
        setTimeout(conectar, espera)
      }
    })
    sock.ev.on('messages.upsert', async (evento) => {
      if (evento.type !== 'notify') return
      for (const mensaje of evento.messages || []) {
        const entrada = textoDeWhatsapp(mensaje)
        if (!entrada || !atiendeWhatsapp(mensaje, { clientes, duenio })) continue
        const id = mensaje.key?.id
        if (id && vistos.has(id)) continue
        if (id) vistos.add(id)
        if (vistos.size > 500) vistos.delete(vistos.values().next().value)
        await onMensaje(entrada)
      }
    })
  }

  await conectar()
  return {
    nombre: 'whatsapp',
    async indicarEscribiendo(jid) {
      if (!sock) return
      await sock.sendPresenceUpdate('composing', jid)
    },
    async enviar(jid, texto) {
      if (!sock) throw new Error('WhatsApp no está conectado.')
      await sock.sendMessage(jid, { text: aWhatsapp(texto) })
      await sock.sendPresenceUpdate('paused', jid).catch(() => {})
    },
    cerrar() {
      parado = true
      sock?.end?.()
    },
  }
}
