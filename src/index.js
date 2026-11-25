import path from 'node:path'
import { crearAplicacion } from './app.js'
import { soltarCandado, textoOtraCopia, tomarCandado } from './candado.js'
import { crearTelegram } from './canales/telegram.js'
import { crearWhatsapp } from './canales/whatsapp.js'
import { crearWhatsappApi } from './canales/whatsapp-api.js'
import { leerConfig, revisarConfig } from './config.js'
import { enviarConEstilo } from './envio.js'
import { crearRebote } from './rebote.js'

const config = leerConfig()
const problemas = revisarConfig(config)
if (config.telegram && !config.telegramToken) {
  console.error(problemas[0])
  process.exit(1)
}
if (config.whatsapp && config.whatsappModo === 'api' && !config.whatsappApi.activo) {
  console.error(problemas.find((linea) => linea.includes('WHATSAPP_MODO')))
  process.exit(1)
}
if (config.cerebro === 'anthropic' && !config.anthropicKey) {
  console.error(problemas.find((linea) => linea.includes('ANTHROPIC')) || 'Falta ANTHROPIC_API_KEY.')
  process.exit(1)
}

const canalesActivos = [config.telegram ? 'telegram' : '', config.whatsapp ? 'whatsapp' : ''].filter(Boolean)
if (!canalesActivos.length) {
  console.log('No hay canales activos. Para practicar: npm run simulador')
  console.log('Para Telegram: en .env poné TELEGRAM=true y el token de @BotFather, y después npm start.')
  process.exit(0)
}

// Una sola copia por carpeta: si ya hay otra corriendo, avisamos y salimos.
const candado = path.resolve(config.dirDatos, 'asistente.pid')
const lock = tomarCandado(candado)
if (!lock.ok) {
  console.error(textoOtraCopia(lock.pid))
  process.exit(1)
}
process.on('exit', () => soltarCandado(candado))

const canales = {}

function avisarYa(entrada, texto) {
  const canal = canales[entrada.canal]
  if (!canal) return
  return enviarConEstilo({ canal, destino: entrada.responderId || entrada.senderId, texto, config })
}

const app = await crearAplicacion({ canalesActivos, avisarYa })

async function entregar(respuestas) {
  for (const respuesta of respuestas) {
    const canal = canales[respuesta.canal]
    if (!canal) {
      app.log.info('sin_canal', { canal: respuesta.canal })
      continue
    }
    if (respuesta.texto) {
      await enviarConEstilo({ canal, destino: respuesta.destino, texto: respuesta.texto, config })
    }
    if (respuesta.archivo && typeof canal.enviarArchivo === 'function') {
      await canal.enviarArchivo(respuesta.destino, respuesta.archivo, respuesta.epigrafe || '')
    } else if (respuesta.archivo && !respuesta.texto) {
      await enviarConEstilo({
        canal,
        destino: respuesta.destino,
        texto: `Te armé el archivo ${String(respuesta.archivo).split('/').pop()}.`,
        config,
      })
    }
  }
}

// Mientras Claude piensa, Telegram/WhatsApp muestran "escribiendo…" (dura ~5 s, lo renovamos).
function mantenerEscribiendo(entrada) {
  const canal = canales[entrada.canal]
  if (!canal?.indicarEscribiendo) return () => {}
  const destino = entrada.responderId || entrada.senderId
  const tic = () => canal.indicarEscribiendo(destino).catch(() => {})
  tic()
  const timer = setInterval(tic, 4500)
  return () => clearInterval(timer)
}

async function despachar(entrada) {
  const parar = mantenerEscribiendo(entrada)
  try {
    const respuestas = await app.manejar(entrada)
    parar()
    await entregar(respuestas)
  } catch (error) {
    parar()
    app.log.error('mensaje', { mensaje: error.message })
    const canal = canales[entrada.canal]
    if (canal) {
      await enviarConEstilo({
        canal,
        destino: entrada.responderId || entrada.senderId,
        texto: 'Se me complicó procesar ese mensaje.',
        config,
      }).catch(() => {})
    }
  }
}

const rebote = crearRebote({
  esperaMs: config.debounceMensajesMs,
  esperaComandoMs: 250,
  onLote: despachar,
})

function onMensaje(entrada) {
  rebote.recibir(entrada)
}

if (config.telegram) {
  canales.telegram = crearTelegram({
    token: config.telegramToken,
    onMensaje,
    log: (mensaje) => app.log.error('telegram', { mensaje }),
    onError: (error) => {
      if (error.conflicto) console.error(`\n>>> ${error.message}\n`)
    },
  })
  console.log(config.ownerTelegramId
    ? 'Telegram escuchando. Escribile al bot desde tu Telegram. Para frenarlo: Ctrl-C.'
    : 'Telegram escuchando. Escribile /start al bot: te contesta "Tu ID es ...". (Más fácil: npm run setup)')
}

if (config.whatsapp && config.whatsappModo === 'api') {
  canales.whatsapp = await crearWhatsappApi({
    api: config.whatsappApi,
    clientes: config.whatsappClientes,
    duenio: config.ownerWhatsapp,
    onMensaje,
    log: (mensaje) => console.log(mensaje),
  })
  console.log(config.whatsappClientes
    ? 'WhatsApp API oficial: atiendo al dueño y a los clientes de WHATSAPP_CLIENTES.'
    : 'WhatsApp API oficial: por ahora solo te atiendo a vos (OWNER_WHATSAPP). Para clientes, completá WHATSAPP_CLIENTES en .env.')
} else if (config.whatsapp) {
  const whatsapp = await crearWhatsapp({
    dirSesion: app.dirs.sesionWhatsapp,
    clientes: config.whatsappClientes,
    duenio: config.ownerWhatsapp,
    onMensaje,
    log: (mensaje) => console.log(mensaje),
  })
  if (!whatsapp) {
    console.error('WhatsApp no está instalado a propósito, para que npm install tarde segundos.')
    console.error('Cuando quieras probarlo: npm install @whiskeysockets/baileys@6.7.24 qrcode-terminal pino@9')
    if (!config.telegram) process.exit(1)
  } else {
    canales.whatsapp = whatsapp
    console.log('WhatsApp por QR no es oficial: usá un chip aparte, Meta puede bloquear el número.')
    console.log(config.whatsappClientes
      ? `WhatsApp: atiendo al dueño y a ${config.whatsappClientes === 'todos' ? 'cualquiera que escriba' : 'los números de WHATSAPP_CLIENTES'}.`
      : 'WhatsApp: por ahora solo te atiendo a vos (OWNER_WHATSAPP). Para clientes, completá WHATSAPP_CLIENTES en .env.')
  }
}

const reloj = setInterval(() => {
  app.revisarReloj().then(async (respuestas) => {
    for (const respuesta of respuestas) {
      const canal = canales[respuesta.canal]
      if (!canal) continue
      await enviarConEstilo({ canal, destino: respuesta.destino, texto: respuesta.texto, config })
    }
  }).catch((error) => app.log.error('reloj', { mensaje: error.message }))
}, 20000)

if (!config.ownerEmail) {
  console.log('OWNER_EMAIL está vacío. Igual tapo cualquier mail que no esté en reglas.md, pero conviene poner el de tu cuenta de Claude.')
}

function cerrar() {
  clearInterval(reloj)
  rebote.cerrar()
  canales.telegram?.cerrar()
  canales.whatsapp?.cerrar()
  process.exit(0)
}

process.on('SIGINT', cerrar)
process.on('SIGTERM', cerrar)
