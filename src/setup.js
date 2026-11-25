// npm run setup: deja el .env listo sin que ningún secreto pase por un chat.
// 1) Canal: Telegram, WhatsApp por QR o WhatsApp API oficial.  2) Mail propio del asistente.  3) Nombre y chequeos.
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { spawnSync } from 'node:child_process'
import { actualizarEnv, escribirEnv, leerEnv, tokenValido } from './entorno.js'
import { procesoVivo } from './candado.js'
import { enviarMail } from './correo.js'
import { leerConfig } from './config.js'
import {
  TEXTO_API_REQUISITOS, TEXTO_CANALES, TEXTO_POR_QUE_MAIL, cambiosCanal, cambiosMail, cambiosWhatsappApi,
  claveAppValida, esMailValido, opcionActual, problemaMailAsistente, textoWebhook,
} from './setup-pasos.js'

const raiz = process.cwd()
const rutaEnv = path.join(raiz, '.env')
const rutaEjemplo = path.join(raiz, '.env.example')
const API = 'https://api.telegram.org'

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r.trim()) }))
}

// Entrada oculta: no se ve lo que pegás, solo puntitos.
function preguntarOculto(texto) {
  if (!process.stdin.isTTY) return preguntar(texto)
  return new Promise((resolve) => {
    process.stdout.write(texto)
    const entrada = process.stdin
    entrada.setRawMode(true)
    entrada.resume()
    entrada.setEncoding('utf8')
    let valor = ''
    const alDato = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') {
          entrada.setRawMode(false)
          entrada.pause()
          entrada.off('data', alDato)
          process.stdout.write('\n')
          resolve(valor.trim())
          return
        }
        if (c === '\u0003') {
          process.stdout.write('\n')
          process.exit(1)
        }
        if (c === '\u007f' || c === '\b') {
          if (valor.length) { valor = valor.slice(0, -1); process.stdout.write('\b \b') }
          continue
        }
        if (c >= ' ') { valor += c; process.stdout.write('•') }
      }
    }
    entrada.on('data', alDato)
  })
}

async function telegram(token, metodo, cuerpo = {}) {
  const r = await fetch(`${API}/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(40000),
  })
  const data = await r.json().catch(() => ({}))
  return { status: r.status, data }
}

function claudeInstalado() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 10000 })
  return r.status === 0 ? String(r.stdout || '').trim() : ''
}

async function esperarDuenio(token, username) {
  console.log(`\nAhora abrí https://t.me/${username} en el Telegram de tu celu y mandale /start.`)
  console.log('Te espero hasta 3 minutos...')
  const hasta = Date.now() + 3 * 60 * 1000
  let offset = 0
  while (Date.now() < hasta) {
    const { status, data } = await telegram(token, 'getUpdates', { offset, timeout: 20, allowed_updates: ['message'] })
    if (status === 409) {
      console.log('\nHay otra copia del bot corriendo con este token. Cerrala (Ctrl-C en su terminal, o  pkill -f "src/index.js") y volvé a correr npm run setup.')
      return ''
    }
    for (const u of data.result || []) {
      offset = u.update_id + 1
      const msg = u.message
      if (msg?.chat?.type === 'private' && msg.from && !msg.from.is_bot) {
        await telegram(token, 'getUpdates', { offset, timeout: 0 })
        await telegram(token, 'sendMessage', { chat_id: msg.chat.id, text: 'Listo, quedaste como dueño de este asistente. Volvé a la terminal y corré npm start.' })
        return String(msg.from.id)
      }
    }
  }
  console.log('\nNo me llegó ningún mensaje. Podés volver a correr npm run setup cuando quieras.')
  return ''
}

let texto = ''
let rutaEnvGlobal = ''
function guardar(cambios) {
  texto = actualizarEnv(texto, cambios)
  escribirEnv(rutaEnvGlobal, texto)
  return leerEnv(texto)
}

async function pasoTelegram(actual) {
  let token = actual.TELEGRAM_TOKEN || ''
  if (token && tokenValido(token)) {
    const r = await preguntar('Ya hay un token de Telegram cargado. Lo querés cambiar? (s/N) ')
    if (/^s/i.test(r)) token = ''
  }
  while (!token) {
    console.log('Pegá el token que te dio @BotFather (no se va a ver mientras lo pegás).')
    const nuevo = await preguntarOculto('Token: ')
    if (!tokenValido(nuevo)) {
      console.log('Eso no parece un token de Telegram (tiene la forma 123456789:ABC...). Probá de nuevo.')
      continue
    }
    token = nuevo
    guardar({ TELEGRAM_TOKEN: nuevo })
  }
  const yo = await telegram(token, 'getMe').catch(() => ({ status: 0, data: {} }))
  if (yo.status === 401) {
    console.log('Telegram dice que ese token no sirve (¿lo revocaste?). Pedí uno nuevo en @BotFather con /token y corré npm run setup de nuevo.')
    process.exit(1)
  }
  const username = yo.data?.result?.username || ''
  if (username) console.log(`Token OK: es el bot @${username}.`)
  else console.log('No pude comprobar el token con Telegram (¿sin internet?). Lo guardo igual.')
  if (!leerEnv(texto).OWNER_TELEGRAM_ID && username) {
    const id = await esperarDuenio(token, username)
    if (id) {
      guardar({ OWNER_TELEGRAM_ID: id })
      console.log(`Listo: te guardé como dueño (ID ${id}).`)
    }
  }
}

async function pasoNumeroDuenio(actual) {
  let numero = (actual.OWNER_WHATSAPP || '').replace(/\D/g, '')
  const r = await preguntar(`Tu número de WhatsApp de dueño, con código de país, sin + (ej. 5491112345678)${numero ? ' [Enter deja el actual]' : ''}: `)
  if (r.replace(/\D/g, '').length >= 8) numero = r.replace(/\D/g, '')
  if (numero) guardar({ OWNER_WHATSAPP: numero })
  else console.log('Sin tu número no te puedo reconocer como dueño. Completá OWNER_WHATSAPP después.')
}

async function pasoWhatsappQr(actual) {
  console.log('\nWhatsApp por QR usa WhatsApp Web. No es oficial: usá un chip aparte (no el personal), Meta puede bloquear el número.')
  console.log('Por defecto solo te atiende a vos; los clientes se suman con WHATSAPP_CLIENTES.')
  await pasoNumeroDuenio(actual)
  if (!fs.existsSync(path.join(raiz, 'node_modules', '@whiskeysockets', 'baileys'))) {
    const r = await preguntar('Falta instalar la parte de WhatsApp (1 minuto). La instalo ahora? (S/n) ')
    if (!/^n/i.test(r)) {
      spawnSync('npm', ['install', '@whiskeysockets/baileys@6.7.24', 'qrcode-terminal', 'pino@9'], { stdio: 'inherit', shell: process.platform === 'win32' })
    } else {
      console.log('Cuando quieras: npm install @whiskeysockets/baileys@6.7.24 qrcode-terminal pino@9')
    }
  }
  console.log('Al hacer npm start aparece un QR: escanealo desde el celu del chip del asistente (Ajustes → Dispositivos vinculados).')
}

async function pasoWhatsappApi(actual) {
  console.log(`\n${TEXTO_API_REQUISITOS}\n`)
  const sigo = await preguntar('Ya tenés eso? (S/n) ')
  if (/^n/i.test(sigo)) {
    console.log('Sin problema. Mientras lo tramitás, arrancamos con Telegram. Cuando tengas lo de Meta, corré npm run setup y elegí 3.')
    guardar(cambiosCanal('1'))
    await pasoTelegram(leerEnv(texto))
    return
  }
  let phoneId = (actual.WHATSAPP_API_PHONE_ID || '').replace(/\D/g, '')
  const r = await preguntar(`Phone number ID${phoneId ? ' [Enter deja el actual]' : ''}: `)
  if (r.replace(/\D/g, '')) phoneId = r.replace(/\D/g, '')
  let token = ''
  if (actual.WHATSAPP_API_TOKEN) {
    const c = await preguntar('Ya hay un access token cargado. Lo querés cambiar? (s/N) ')
    if (/^s/i.test(c)) token = await preguntarOculto('Access token (no se ve): ')
  } else {
    token = await preguntarOculto('Access token (no se ve): ')
  }
  const appSecret = actual.WHATSAPP_API_APP_SECRET ? '' : await preguntarOculto('App secret (Enter para saltear; no se ve): ')
  const plantilla = await preguntar(`Nombre de plantilla aprobada para reabrir charlas de más de 24 h${actual.WHATSAPP_API_PLANTILLA ? ` [${actual.WHATSAPP_API_PLANTILLA}]` : ' (Enter para saltear)'}: `)
  const env = guardar(cambiosWhatsappApi({ phoneId, token, appSecret, verifyToken: actual.WHATSAPP_API_VERIFY_TOKEN, plantilla }))
  const config = leerConfig(env)
  try {
    const { crearClienteApi } = await import('./canales/whatsapp-api.js')
    const info = await crearClienteApi(config.whatsappApi).info()
    console.log(`Meta OK: número ${info.display_phone_number || '?'}${info.verified_name ? ` (${info.verified_name})` : ''}.`)
  } catch (e) {
    console.log(`Ojo: ${e.message}`)
  }
  await pasoNumeroDuenio(env)
  console.log(`\n${textoWebhook(config.whatsappApi.puerto, config.whatsappApi.verifyToken)}`)
}

async function pasoMail(actual, nombre) {
  console.log(`\n${TEXTO_POR_QUE_MAIL}\n`)
  let mailDuenio = actual.OWNER_EMAIL || ''
  const d = await preguntar(`Tu mail de dueño (para mandarte copias)${mailDuenio ? ` [${mailDuenio}]` : ''}: `)
  if (esMailValido(d)) mailDuenio = d
  if (mailDuenio) guardar({ OWNER_EMAIL: mailDuenio })
  if (actual.MAIL_USUARIO && actual.MAIL_CLAVE_APP) {
    const c = await preguntar(`El asistente ya tiene mail (${actual.MAIL_USUARIO}). Lo querés cambiar? (s/N) `)
    if (!/^s/i.test(c)) return
  } else {
    const c = await preguntar('Ya creaste la cuenta del asistente y la contraseña de aplicación? (s/N) ')
    if (!/^s/i.test(c)) {
      console.log('Dale. Mientras, los mails que pidas quedan como borrador en tu Gmail (si está conectado a Claude). Cuando la tengas: npm run setup.')
      return
    }
  }
  let usuario = ''
  while (!usuario) {
    const u = await preguntar('Mail del asistente: ')
    const problema = problemaMailAsistente(u, mailDuenio)
    if (problema) { console.log(problema); continue }
    usuario = u.trim()
  }
  let clave = ''
  while (!clave) {
    const c = await preguntarOculto('Contraseña de aplicación (16 letras, no se ve): ')
    if (!claveAppValida(c)) { console.log('Tienen que ser 16 letras (la de myaccount.google.com/apppasswords, no la contraseña de la cuenta).'); continue }
    clave = c
  }
  const env = guardar(cambiosMail({ usuario, clave, mailDuenio }))
  console.log(`Guardado: el asistente manda desde ${usuario}${mailDuenio ? ` con copia a ${mailDuenio}` : ''}.`)
  if (!mailDuenio) return
  const p = await preguntar(`Te mando un mail de prueba a ${mailDuenio}? (S/n) `)
  if (/^n/i.test(p)) return
  try {
    await enviarMail(leerConfig(env).mail, {
      para: mailDuenio,
      asunto: `Prueba de ${nombre || 'tu asistente'}`,
      cuerpo: `Hola. Si leés esto, ${nombre || 'tu asistente'} ya puede mandar mails desde ${usuario}.\n\nCuando le pidas un mail, te muestra el texto y sale recién con tu /si.`,
    })
    console.log('Mail de prueba enviado. Fijate en tu bandeja (y en spam, la primera vez).')
  } catch (e) {
    console.log(`No salió: ${e.message} Revisá la contraseña de aplicación y corré npm run setup de nuevo.`)
  }
}

async function main() {
  console.log('Configuración del asistente. Nada de lo que pegues acá se muestra ni se manda a ningún chat.\n')
  const pid = Number(String(fs.existsSync(path.join(raiz, 'data', 'asistente.pid')) ? fs.readFileSync(path.join(raiz, 'data', 'asistente.pid'), 'utf8') : '').trim())
  if (pid && procesoVivo(pid)) {
    console.log(`El asistente está corriendo (proceso ${pid}). Cerralo primero con Ctrl-C en su terminal o con  kill ${pid}`)
    process.exit(1)
  }
  if (!fs.existsSync(rutaEnv)) {
    if (!fs.existsSync(rutaEjemplo)) {
      console.log('No encuentro .env.example. Corré esto adentro de la carpeta del asistente.')
      process.exit(1)
    }
    escribirEnv(rutaEnv, fs.readFileSync(rutaEjemplo, 'utf8'))
    console.log('Creé el archivo .env (está oculto en la carpeta: en Mac se ve con Cmd+Shift+punto).')
  }
  rutaEnvGlobal = rutaEnv
  texto = fs.readFileSync(rutaEnv, 'utf8')
  const actual = leerEnv(texto)

  const nombre = await preguntar(`Nombre del asistente${actual.ASISTENTE_NOMBRE ? ` [${actual.ASISTENTE_NOMBRE}]` : ''} (Enter para dejarlo): `)
  if (nombre) guardar({ ASISTENTE_NOMBRE: nombre.slice(0, 40) })

  console.log(`\n${TEXTO_CANALES}`)
  const defecto = opcionActual(actual)
  let opcion = await preguntar(`Elegí 1, 2 o 3 [${defecto}]: `)
  if (!['1', '2', '3'].includes(opcion)) opcion = defecto
  const cambios = cambiosCanal(opcion)
  if (opcion !== '1' && tokenValido(actual.TELEGRAM_TOKEN) && String(actual.TELEGRAM).toLowerCase() === 'true') {
    const t = await preguntar('Ya tenés Telegram andando. Lo dejo prendido también? (S/n) ')
    if (!/^n/i.test(t)) cambios.TELEGRAM = 'true'
  }
  guardar(cambios)
  if (opcion === '1') await pasoTelegram(leerEnv(texto))
  else if (opcion === '2') await pasoWhatsappQr(leerEnv(texto))
  else await pasoWhatsappApi(leerEnv(texto))

  await pasoMail(leerEnv(texto), leerEnv(texto).ASISTENTE_NOMBRE)

  const version = claudeInstalado()
  console.log('')
  if (version) console.log(`Claude Code: instalado (${version}). Si nunca iniciaste sesión, corré  claude  y escribí /login.`)
  else console.log('Claude Code: NO lo encuentro. Instalalo con  npm install -g @anthropic-ai/claude-code  y después corré  claude  para iniciar sesión.')
  console.log('\nTodo guardado en .env. Ahora: npm run revisar  y después  npm start   (una sola terminal; para frenarlo, Ctrl-C).')
  console.log('Importante: no pegues tokens ni contraseñas en Claude, WhatsApp ni capturas. Si se filtró uno, revocalo y corré npm run setup de nuevo.')
}

main().catch((error) => {
  console.error(`No pude terminar la configuración: ${error.message}`)
  process.exit(1)
})
