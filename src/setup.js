// npm run setup: deja el .env listo sin que el token pase por ningún chat.
// Pide el token con la entrada oculta, lo valida con Telegram y toma tu ID solo.
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { spawnSync } from 'node:child_process'
import { actualizarEnv, escribirEnv, leerEnv, tokenValido } from './entorno.js'
import { procesoVivo } from './candado.js'

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
  let texto = fs.readFileSync(rutaEnv, 'utf8')
  const actual = leerEnv(texto)
  const cambios = {}

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
    cambios.TELEGRAM_TOKEN = nuevo
  }
  const yo = await telegram(token, 'getMe').catch(() => ({ status: 0, data: {} }))
  if (yo.status === 401) {
    console.log('Telegram dice que ese token no sirve (¿lo revocaste?). Pedí uno nuevo en @BotFather con /token y corré npm run setup de nuevo.')
    process.exit(1)
  }
  const username = yo.data?.result?.username || ''
  if (username) console.log(`Token OK: es el bot @${username}.`)
  else console.log('No pude comprobar el token con Telegram (¿sin internet?). Lo guardo igual.')
  cambios.TELEGRAM = 'true'

  const nombre = await preguntar(`Nombre del asistente${actual.ASISTENTE_NOMBRE ? ` [${actual.ASISTENTE_NOMBRE}]` : ''} (Enter para dejarlo): `)
  if (nombre) cambios.ASISTENTE_NOMBRE = nombre.slice(0, 40)

  texto = actualizarEnv(texto, cambios)
  escribirEnv(rutaEnv, texto)

  const owner = leerEnv(texto).OWNER_TELEGRAM_ID
  if (!owner && username) {
    const id = await esperarDuenio(token, username)
    if (id) {
      texto = actualizarEnv(texto, { OWNER_TELEGRAM_ID: id })
      escribirEnv(rutaEnv, texto)
      console.log(`Listo: te guardé como dueño (ID ${id}).`)
    }
  }

  const version = claudeInstalado()
  console.log('')
  if (version) console.log(`Claude Code: instalado (${version}). Si nunca iniciaste sesión, corré  claude  y escribí /login.`)
  else console.log('Claude Code: NO lo encuentro. Instalalo con  npm install -g @anthropic-ai/claude-code  y después corré  claude  para iniciar sesión.')
  console.log('\nTodo guardado en .env. Ahora: npm start   (una sola terminal; para frenarlo, Ctrl-C).')
  console.log('Importante: no pegues el token en Claude, WhatsApp ni capturas. Si se filtró, en @BotFather usá /revoke y corré npm run setup de nuevo.')
}

main().catch((error) => {
  console.error(`No pude terminar la configuración: ${error.message}`)
  process.exit(1)
})
