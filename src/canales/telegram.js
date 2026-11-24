import fs from 'node:fs/promises'
import path from 'node:path'
import { partir } from '../texto.js'
import { aPlano, aTelegramHtml } from '../formato.js'

export const TEXTO_OTRA_COPIA = 'Hay otra copia del bot usando este mismo token (otra terminal, otra carpeta u otra compu). Telegram atiende a una sola. Dejá una sola corriendo: cerrá la otra con Ctrl-C o con  pkill -f "src/index.js"  y volvé a correr npm start.'

export function updateAMensaje(update) {
  const msg = update?.message
  if (!msg?.text || !msg.from || msg.from.is_bot) return null
  if (msg.chat?.type && msg.chat.type !== 'private') return null
  return {
    canal: 'telegram',
    senderId: String(msg.from.id),
    responderId: String(msg.chat.id),
    texto: msg.text,
  }
}

async function pedir(fetchFn, url, body, signal) {
  try {
    return await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return null
    throw new Error('Falló la conexión con Telegram.')
  }
}

export function crearTelegram({
  token,
  onMensaje,
  fetchFn = fetch,
  apiBase = 'https://api.telegram.org',
  timeoutSeg = 25,
  log = () => {},
  onError = () => {},
  esperaConflictoMs = 10000,
}) {
  let offset = 0
  let parado = false
  const control = new AbortController()
  const base = apiBase.replace(/\/$/, '')

  function senal(ms) {
    return AbortSignal.any([control.signal, AbortSignal.timeout(ms)])
  }

  function esperar(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      control.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
    })
  }

  async function indicarEscribiendo(chatId) {
    await pedir(fetchFn, `${base}/bot${token}/sendChatAction`, { chat_id: chatId, action: 'typing' }, senal(5000))
  }

  async function enviarArchivo(chatId, ruta, epigrafe = '') {
    const nombre = path.basename(ruta)
    const buf = await fs.readFile(ruta)
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('document', new Blob([buf]), nombre)
    if (epigrafe) form.append('caption', String(epigrafe).slice(0, 1024))
    try {
      const respuesta = await fetchFn(`${base}/bot${token}/sendDocument`, { method: 'POST', body: form, signal: senal(30000) })
      if (control.signal.aborted) return
      if (!respuesta) throw new Error('No pude enviar el archivo por Telegram.')
      if (respuesta.status === 401) throw new Error('Telegram rechazó el token.')
      if (!respuesta.ok) throw new Error('Telegram no aceptó el archivo.')
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('No pude enviar el archivo por Telegram.')
      throw error
    }
  }

  async function mandarUno(chatId, cuerpo) {
    const respuesta = await pedir(fetchFn, `${base}/bot${token}/sendMessage`, { chat_id: chatId, ...cuerpo }, senal(20000))
    if (control.signal.aborted) return 'abortado'
    if (!respuesta) throw new Error('No pude enviar el mensaje por Telegram.')
    if (respuesta.status === 401) throw new Error('Telegram rechazó el token.')
    if (respuesta.status === 400) return 'formato'
    if (!respuesta.ok) throw new Error('Telegram no aceptó el mensaje.')
    return 'ok'
  }

  // Markdown → HTML de Telegram. Si Telegram rechaza el HTML, va en texto plano.
  async function enviar(chatId, texto) {
    for (const parte of partir(String(texto || ''), 3800)) {
      const html = aTelegramHtml(parte)
      if (!html.trim()) continue
      const r = await mandarUno(chatId, { text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
      if (r === 'abortado') return
      if (r === 'formato') {
        const plano = aPlano(parte)
        if (!plano.trim()) continue
        const r2 = await mandarUno(chatId, { text: plano })
        if (r2 === 'formato') throw new Error('Telegram no aceptó el mensaje.')
      }
    }
  }

  async function vuelta() {
    const respuesta = await pedir(
      fetchFn,
      `${base}/bot${token}/getUpdates`,
      { offset, timeout: timeoutSeg, allowed_updates: ['message'] },
      senal((timeoutSeg + 15) * 1000),
    )
    if (!respuesta) return
    if (respuesta.status === 401) throw new Error('Telegram rechazó el token. Revisá TELEGRAM_TOKEN en .env (si lo revocaste en @BotFather, pegá el nuevo).')
    if (respuesta.status === 409) {
      const error = new Error(TEXTO_OTRA_COPIA)
      error.conflicto = true
      throw error
    }
    if (!respuesta.ok) throw new Error(`Telegram respondió mal (código ${respuesta.status}).`)
    const data = await respuesta.json()
    for (const update of data.result || []) {
      offset = update.update_id + 1
      const entrada = updateAMensaje(update)
      if (entrada) await onMensaje(entrada)
    }
  }

  // No llenamos la consola con el mismo error cada 6 segundos: se avisa una vez
  // y se vuelve a avisar recién si cambia o pasa un rato.
  let ultimoError = ''
  let ultimoAviso = 0
  async function loop() {
    while (!parado) {
      try {
        await vuelta()
        ultimoError = ''
      } catch (error) {
        const ahora = Date.now()
        if (error.message !== ultimoError || ahora - ultimoAviso > 5 * 60 * 1000) {
          log(error.message)
          onError(error)
          ultimoError = error.message
          ultimoAviso = ahora
        }
        await esperar(error.conflicto ? esperaConflictoMs : 1500)
      }
    }
  }

  const corriendo = loop()
  return {
    nombre: 'telegram',
    enviar,
    enviarArchivo,
    indicarEscribiendo,
    vuelta,
    cerrar() {
      parado = true
      control.abort()
    },
    corriendo,
  }
}
