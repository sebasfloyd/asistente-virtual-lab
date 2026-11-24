import readline from 'node:readline'
import { spawnSync } from 'node:child_process'
import { crearAplicacion } from './app.js'
import { leerConfig } from './config.js'
import { partesParaEnviar } from './estilo.js'

const ID_CLIENTE = 'sim-cliente'
const ID_DUENIO = 'sim-duenio'
const config = leerConfig()
const app = await crearAplicacion({ canalesActivos: ['simulador'], duenioSimulador: ID_DUENIO })
let rol = 'cliente'

if (config.cerebro === 'claude') {
  const cual = process.platform === 'win32' ? 'where' : 'which'
  const hay = spawnSync(cual, ['claude'], { encoding: 'utf8' })
  if (hay.status !== 0) {
    console.log('No encontré el comando `claude`. Para practicar sin el modelo, poné CEREBRO=simulacion en .env.')
  }
}

console.log('Simulador local. No se conecta a Telegram ni a WhatsApp.')
console.log('Comandos: /cliente  /duenio  /reiniciar  /salir')
console.log(`Ahora hablás como cliente (${ID_CLIENTE}). /duenio usa ${ID_DUENIO}, que en esta compu es el dueño.`)
console.log(`Cerebro: ${config.cerebro}. Modo: ${app.config.modo}.`)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
let cola = Promise.resolve()
let cerrado = false

function prompt() {
  rl.setPrompt(rol === 'duenio' ? 'dueño> ' : 'cliente> ')
  rl.prompt()
}

function imprimir(respuestas) {
  for (const respuesta of respuestas) {
    const titulo = respuesta.audiencia === 'duenio'
      ? '—— para el dueño (esto no lo ve el cliente) ——'
      : '—— para el cliente ——'
    const partes = partesParaEnviar(respuesta.texto, {
      partir: config.partirMensajes !== false,
      nombre: config.nombre,
    })
    for (const parte of partes) console.log(`\n${titulo}\n${parte}\n`)
    if (respuesta.archivo) console.log(`\n${titulo}\n[archivo] ${respuesta.archivo}\n`)
  }
}

async function procesarLinea(linea) {
  const texto = linea.trim()
  if (!texto) return
  if (texto === '/salir') {
    cerrado = true
    rl.close()
    return
  }
  if (texto === '/cliente') {
    rol = 'cliente'
    console.log('Ahora hablás como cliente.')
    return
  }
  if (texto === '/duenio') {
    rol = 'duenio'
    console.log('Ahora hablás como dueño.')
    return
  }
  if (texto === '/reiniciar') {
    await app.reiniciar()
    console.log('Borré dueño, borradores e historial de esta prueba. La sesión de WhatsApp no se toca.')
    return
  }
  const entrada = rol === 'duenio'
    ? { canal: 'simulador', senderId: ID_DUENIO, responderId: ID_DUENIO, texto }
    : { canal: 'simulador', senderId: ID_CLIENTE, responderId: ID_CLIENTE, texto }
  try {
    imprimir(await app.manejar(entrada))
  } catch (error) {
    app.log.error('simulador', { mensaje: error.message })
    console.log('Se me complicó procesar ese mensaje.')
  }
}

rl.on('line', (linea) => {
  rl.pause()
  cola = cola.then(() => procesarLinea(linea)).then(() => {
    if (!cerrado) {
      prompt()
      rl.resume()
    }
  })
})

const reloj = setInterval(() => {
  app.revisarReloj().then((respuestas) => {
    if (respuestas.length) imprimir(respuestas)
  }).catch(() => {})
}, 20000)

rl.on('close', () => {
  cerrado = true
  clearInterval(reloj)
  cola.then(() => process.exit(0))
})
prompt()
