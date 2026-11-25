// WhatsApp API oficial (Meta Cloud API). Sin dependencias: fetch para mandar y node:http para el webhook.
// Mandar: POST https://graph.facebook.com/<versión>/<phone_number_id>/messages con el access token.
// Recibir: Meta llama a tu webhook (necesita una URL pública https, por ejemplo con cloudflared).
// Regla de Meta: fuera de las 24 h desde el último mensaje del cliente, solo se puede abrir con una plantilla aprobada.
import { createHmac, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { aWhatsapp } from '../formato.js'
import { atiendeNumeros } from './whatsapp-texto.js'

export class ErrorWhatsappApi extends Error {
  constructor(mensaje, codigo = 0) {
    super(mensaje)
    this.codigo = codigo
  }
}

export const numeroDe = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
export const jidDeNumero = (n) => `${String(n || '').replace(/\D/g, '')}@s.whatsapp.net`

export function firmaValida(cuerpoCrudo, cabecera, secreto) {
  if (!secreto) return true
  const esperado = `sha256=${createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex')}`
  const recibido = String(cabecera || '')
  if (recibido.length !== esperado.length) return false
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))
}

function textoDeMensaje(m) {
  if (m.type === 'text') return m.text?.body || ''
  if (m.type === 'button') return m.button?.text || ''
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  return ''
}

// Del JSON que manda Meta a entradas como las de los otros canales.
export function entradasDeWebhook(cuerpo) {
  const out = []
  for (const entry of cuerpo?.entry || []) {
    for (const cambio of entry.changes || []) {
      const valor = cambio.value || {}
      for (const m of valor.messages || []) {
        const texto = textoDeMensaje(m).trim()
        if (!texto || !m.from) continue
        const jid = jidDeNumero(m.from)
        out.push({ canal: 'whatsapp', senderId: jid, responderId: jid, texto, id: m.id || '' })
      }
    }
  }
  return out
}

// Meta verifica el webhook con un GET: hub.mode=subscribe, hub.verify_token, hub.challenge.
export function respuestaVerificacion(url, verifyToken) {
  const q = new URL(url, 'http://x').searchParams
  if (q.get('hub.mode') === 'subscribe' && verifyToken && q.get('hub.verify_token') === verifyToken) {
    return { status: 200, cuerpo: q.get('hub.challenge') || '' }
  }
  return { status: 403, cuerpo: 'no' }
}

export function textoErrorApi(status, data) {
  const e = data?.error || {}
  const codigo = Number(e.code || 0)
  if (status === 401 || codigo === 190) return { codigo, texto: 'Meta rechazó el access token (venció o es temporal). Generá uno permanente (usuario de sistema) y corré npm run setup.' }
  if (codigo === 131047 || codigo === 470) return { codigo, texto: 'Pasaron más de 24 h desde el último mensaje de esa persona: Meta solo deja abrir la charla con una plantilla aprobada (WHATSAPP_API_PLANTILLA).' }
  if (codigo === 131030) return { codigo, texto: 'Ese número no está en la lista de prueba de tu app de Meta. Agregalo en WhatsApp → Configuración de la API, o usá un número verificado.' }
  if (codigo === 100 || codigo === 33) return { codigo, texto: 'El WHATSAPP_API_PHONE_ID no es válido para este token.' }
  return { codigo, texto: `Meta no aceptó el mensaje (${status}${codigo ? `, código ${codigo}` : ''}).` }
}

export function crearClienteApi({ token, phoneId, version = 'v21.0', fetch: f = globalThis.fetch }) {
  const base = `https://graph.facebook.com/${version}`
  async function llamar(ruta, opciones) {
    const r = await f(`${base}/${ruta}`, { ...opciones, headers: { authorization: `Bearer ${token}`, ...(opciones.headers || {}) }, signal: AbortSignal.timeout(30000) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const { codigo, texto } = textoErrorApi(r.status, data)
      throw new ErrorWhatsappApi(texto, codigo)
    }
    return data
  }
  const mandar = (cuerpo) => llamar(`${phoneId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
  })
  return {
    texto: (numero, texto) => mandar({ to: numero, type: 'text', text: { body: texto, preview_url: false } }),
    plantilla: (numero, nombre, idioma = 'es_AR') => mandar({ to: numero, type: 'template', template: { name: nombre, language: { code: idioma } } }),
    async documento(numero, ruta, epigrafe = '') {
      const form = new FormData()
      form.append('messaging_product', 'whatsapp')
      form.append('file', new Blob([fs.readFileSync(ruta)], { type: 'application/pdf' }), path.basename(ruta))
      const subido = await llamar(`${phoneId}/media`, { method: 'POST', body: form })
      return mandar({ to: numero, type: 'document', document: { id: subido.id, filename: path.basename(ruta), caption: epigrafe || undefined } })
    },
    marcarLeido: (id) => mandar({ status: 'read', message_id: id }),
    info: () => llamar(`${phoneId}?fields=display_phone_number,verified_name`, { method: 'GET' }),
  }
}

export async function crearWhatsappApi({
  api,
  onMensaje,
  log = () => {},
  clientes = '',
  duenio = '',
  fetch: f,
  escuchar = true,
}) {
  const cliente = crearClienteApi({ token: api.token, phoneId: api.phoneId, version: api.version, fetch: f })
  const vistos = new Set()

  async function recibir(cuerpo) {
    for (const entrada of entradasDeWebhook(cuerpo)) {
      if (entrada.id && vistos.has(entrada.id)) continue
      if (entrada.id) vistos.add(entrada.id)
      if (vistos.size > 500) vistos.delete(vistos.values().next().value)
      if (!atiendeNumeros([numeroDe(entrada.senderId)], { clientes, duenio })) continue
      if (entrada.id) cliente.marcarLeido(entrada.id).catch(() => {})
      await onMensaje(entrada)
    }
  }

  const server = http.createServer((req, res) => {
    const ruta = new URL(req.url, 'http://x').pathname
    if (ruta !== '/webhook') { res.writeHead(404).end(); return }
    if (req.method === 'GET') {
      const r = respuestaVerificacion(req.url, api.verifyToken)
      if (r.status === 200) log('WhatsApp API: Meta verificó el webhook.')
      res.writeHead(r.status, { 'content-type': 'text/plain' }).end(r.cuerpo)
      return
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    const partes = []
    let largo = 0
    req.on('data', (c) => { largo += c.length; if (largo < 2_000_000) partes.push(c) })
    req.on('end', () => {
      const crudo = Buffer.concat(partes)
      if (!firmaValida(crudo, req.headers['x-hub-signature-256'], api.appSecret)) {
        log('WhatsApp API: llegó un POST sin firma válida, lo ignoro.')
        res.writeHead(401).end()
        return
      }
      res.writeHead(200).end('ok')
      let cuerpo = null
      try { cuerpo = JSON.parse(crudo.toString('utf8')) } catch { return }
      recibir(cuerpo).catch((e) => log(`WhatsApp API: ${e.message}`))
    })
  })
  server.on('error', (e) => log(`WhatsApp API: no pude abrir el puerto ${api.puerto} (${e.code || e.message}).`))
  if (escuchar) {
    await new Promise((resolve) => server.listen(api.puerto, api.host || '127.0.0.1', resolve))
    log(`WhatsApp API: webhook escuchando en http://localhost:${server.address()?.port}/webhook (Meta necesita una URL https pública: mirá el README).`)
  }

  async function conPlantilla(numero, fn) {
    try {
      return await fn()
    } catch (error) {
      if (error.codigo === 131047 && api.plantilla) {
        await cliente.plantilla(numero, api.plantilla, api.idioma)
        throw new ErrorWhatsappApi('Pasaron más de 24 h: le mandé la plantilla para reabrir la charla. Cuando conteste, sigo.', 131047)
      }
      throw error
    }
  }

  return {
    nombre: 'whatsapp',
    server,
    recibir,
    async indicarEscribiendo() {},
    async enviar(jid, texto) {
      const numero = numeroDe(jid)
      await conPlantilla(numero, () => cliente.texto(numero, aWhatsapp(texto)))
    },
    async enviarArchivo(jid, ruta, epigrafe = '') {
      const numero = numeroDe(jid)
      await conPlantilla(numero, () => cliente.documento(numero, ruta, epigrafe))
    },
    cerrar() {
      server.close()
    },
  }
}
