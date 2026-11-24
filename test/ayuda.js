import os from 'node:os'
import path from 'node:path'
import { prepararEntorno } from '../src/cerebro.js'
import { leerConfig } from '../src/config.js'
import { dirsDe } from '../src/dirs.js'
import { estadoInicial } from '../src/estado.js'

export const MANUAL = `# Manual
Mail del local: hola@negocio.com
## Siempre preguntale al dueño
- precios
- descuentos
- quejas
## Temas seguros para modo auto
- hola
- horario
`

export function armar(env = {}, extras = {}) {
  const config = {
    ...leerConfig({
      CEREBRO: 'simulacion',
      MODO: 'aprobar',
      CODIGO_DUENIO: 'codigo-largo-de-prueba',
      OWNER_EMAIL: 'duenio@correo.com',
      OWNER_WHATSAPP: '5491112345678',
      ...env,
    }),
    duenioSimulador: env.DUENIO_SIMULADOR || '',
  }
  const raiz = fsRaiz()
  const dirs = dirsDe(config, raiz)
  prepararEntorno(dirs)
  const pedidos = []
  const ocupado = { hayDatos: extras.hayDatos || false, intervalos: extras.intervalos || [] }
  const ctx = {
    config,
    dirs,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TELEGRAM_TOKEN: '777777:AAAabcdefghijklmnopqrst',
      OWNER_EMAIL: config.ownerEmail,
      CODIGO_DUENIO: config.codigoDuenio,
    },
    canalesActivos: extras.canalesActivos || ['simulador', 'telegram'],
    ahora: () => Date.parse('2026-11-24T15:00:00-03:00'),
    reglas: () => extras.reglas || MANUAL,
    leerOcupado: async () => ocupado,
    guardarOcupado: async (intervalos) => {
      ocupado.hayDatos = true
      ocupado.intervalos = intervalos
    },
    cerebro: extras.cerebro || (async (pedido) => {
      pedidos.push(pedido)
      if (pedido.camino === 'duenio') return 'Listo, camino del dueño.'
      return 'Hola. El horario es de 9 a 18. Escribí a hola@negocio.com.'
    }),
    log: { info() {}, error() {} },
  }
  return { config, dirs, ctx, pedidos, ocupado, estado: estadoInicial() }
}

function fsRaiz() {
  return path.join(os.tmpdir(), 'asistente-raiz-test')
}

export function cliente(texto, id = '555') {
  return { canal: 'telegram', senderId: id, responderId: id, texto }
}

export function duenioTelegram(texto, id = '42') {
  return { canal: 'telegram', senderId: id, responderId: id, texto }
}
