import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crearAplicacion } from '../src/app.js'
import { crearTelegram } from '../src/canales/telegram.js'

function servidor() {
  const pendientes = []
  let espera = null
  const enviados = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      if (String(req.url).includes('sendMessage')) {
        enviados.push(JSON.parse(body))
        res.end(JSON.stringify({ ok: true, result: {} }))
        return
      }
      let cerrado = false
      const fin = () => {
        if (cerrado) return
        cerrado = true
        const lote = pendientes.splice(0, pendientes.length)
        res.end(JSON.stringify({ ok: true, result: lote }))
      }
      if (pendientes.length) fin()
      else {
        espera = fin
        setTimeout(fin, 150)
      }
    })
  })
  return {
    enviados,
    listen: () => new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    }),
    push(update) {
      pendientes.push(update)
      const listo = espera
      espera = null
      listo?.()
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function mensaje(id, updateId, texto) {
  return {
    update_id: updateId,
    message: { message_id: updateId, text: texto, from: { id, is_bot: false }, chat: { id, type: 'private' } },
  }
}

async function hasta(pred) {
  const inicio = Date.now()
  while (Date.now() - inicio < 4000) {
    if (pred()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Telegram de prueba no llegó a tiempo')
}

test('telegram de punta a punta: /start, borrador y respuesta sin el mail', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'asistente-tg-'))
  fs.writeFileSync(path.join(raiz, 'reglas.md'), 'Mail del local: hola@negocio.com\nHorario: 9 a 18\n')
  const fake = servidor()
  const port = await fake.listen()
  const token = '777777:AAAabcdefghijklmnopqrst'
  const app = await crearAplicacion({
    raiz,
    canalesActivos: ['telegram'],
    env: {
      TELEGRAM: 'true',
      TELEGRAM_TOKEN: token,
      OWNER_TELEGRAM_ID: '42',
      OWNER_EMAIL: 'duenio@correo.com',
      OWNER_WHATSAPP: '5491112345678',
      CEREBRO: 'simulacion',
      MODO: 'aprobar',
      CODIGO_DUENIO: '',
      DIR_DATOS: 'data',
    },
    cerebro: async (pedido) => {
      if (pedido.camino === 'duenio') return 'ok'
      return 'Atendemos de 9 a 18. Escribí a hola@negocio.com. Cuenta duenio@correo.com y tel 5491112345678.'
    },
  })
  const canal = crearTelegram({
    token,
    apiBase: `http://127.0.0.1:${port}`,
    timeoutSeg: 0,
    onMensaje: async (entrada) => {
      const respuestas = await app.manejar(entrada)
      for (const respuesta of respuestas) await canal.enviar(respuesta.destino, respuesta.texto)
    },
    log() {},
  })

  try {
    fake.push(mensaje(77, 1, '/start'))
    await hasta(() => fake.enviados.some((m) => String(m.chat_id) === '77' && /Hola, soy el asistente/.test(m.text)))

    fake.push(mensaje(77, 2, 'hola, quiero saber el horario'))
    await hasta(() => fake.enviados.some((m) => String(m.chat_id) === '42' && m.text.includes('Borrador #1')))
    const borrador = fake.enviados.find((m) => String(m.chat_id) === '42').text
    assert.equal(borrador.includes('duenio@correo.com'), false)
    assert.equal(borrador.includes('5491112345678'), false)
    assert.match(borrador, /hola@negocio.com/)

    fake.push(mensaje(42, 3, '/aprobar 1'))
    await hasta(() => fake.enviados.some((m) => String(m.chat_id) === '77' && m.text.includes('9 a 18')))
    const alCliente = fake.enviados.filter((m) => String(m.chat_id) === '77').map((m) => m.text).join('\n')
    assert.match(alCliente, /Hola, soy el asistente/)
    assert.match(alCliente, /hola@negocio.com/)
    assert.equal(alCliente.includes('duenio@correo.com'), false)
    assert.equal(alCliente.includes('5491112345678'), false)
    assert.equal(JSON.stringify(fake.enviados).includes(token), false)
  } finally {
    canal.cerrar()
    await canal.corriendo
    await fake.close()
  }
})
