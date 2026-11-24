import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extraerCuerpo,
  extraerNombre,
  extraerTelefono,
  parsearPedidoEnvio,
  parecePedidoEnvio,
} from '../src/envio-tercero.js'
import { armarPrompt, TOPE_HISTORIAL_DUENIO } from '../src/prompt.js'
import { procesarMensaje } from '../src/turno.js'
import { armar, duenioTelegram } from './ayuda.js'

const NUMERO = '5491199998888'

test('parsea número, nombre y texto en un pedido de envío', () => {
  assert.equal(extraerTelefono('Podes mandarle un mensaje a mi hermano? Si celu es +54 9 11 9999-8888'), NUMERO)
  const primero = parsearPedidoEnvio('Podes mandarle un mensaje a mi hermano? Si celu es +5491199998888')
  assert.equal(primero.destino, NUMERO)
  assert.equal(primero.texto, '')
  const segundo = parsearPedidoEnvio('Mandale saludos de mi parte. se llama demian.', {
    borrador: { destino: NUMERO },
  })
  assert.equal(segundo.destino, NUMERO)
  assert.equal(segundo.nombre, 'Demian')
  assert.equal(segundo.texto, 'saludos de mi parte')
})

test('retiene nombre, número y texto a lo largo de varios turnos', () => {
  const historial = [
    { rol: 'cliente', texto: 'Podes mandarle un mensaje a mi hermano? Si celu es +5491199998888' },
    { rol: 'asistente', texto: 'Dale, qué querés que le diga?' },
    { rol: 'cliente', texto: 'Mandale saludos de mi parte. se llama demian.' },
    { rol: 'asistente', texto: 'Hola Demian' },
    { rol: 'cliente', texto: 'Pero me mandaste a mi, no a demian' },
  ]
  const pedido = parsearPedidoEnvio('Mandale un mensaje por telegram', {
    historial,
    borrador: { destino: NUMERO, nombre: 'Demian' },
  })
  assert.equal(pedido.destino, NUMERO)
  assert.equal(pedido.nombre, 'Demian')
  assert.equal(pedido.texto, 'saludos de mi parte')
  assert.equal(pedido.canal, 'telegram')
  assert.equal(parecePedidoEnvio('Mandale un mensaje por telegram', { historial, borrador: { destino: NUMERO } }), true)
})

test('si WhatsApp está apagado, no le habla al dueño como si fuera el destinatario ni manda nada', async () => {
  const { ctx, estado, pedidos } = armar({ OWNER_TELEGRAM_ID: '42' })
  const primero = await procesarMensaje(
    duenioTelegram('Podes mandarle un mensaje a mi hermano? Si celu es +5491199998888'),
    estado,
    ctx,
  )
  assert.equal(pedidos.length, 0)
  assert.equal(primero.estado.envioBorrador.destino, NUMERO)
  assert.match(primero.respuestas[0].texto, /qué querés que le diga/i)
  assert.equal(/hola demian/i.test(primero.respuestas[0].texto), false)
  const segundo = await procesarMensaje(
    duenioTelegram('Mandale saludos de mi parte. se llama demian.'),
    primero.estado,
    ctx,
  )
  assert.equal(pedidos.length, 0)
  const texto = segundo.respuestas[0].texto
  assert.match(texto, /WhatsApp no está prendido/)
  assert.match(texto, /5491199998888/)
  assert.match(texto, /saludos de mi parte/)
  assert.equal(/hola demian/i.test(texto), false)
  assert.equal(segundo.estado.acciones.length, 0)
  assert.equal(segundo.respuestas.some((r) => r.audiencia === 'externo' || r.canal === 'whatsapp'), false)
})

test('si pide Telegram a un celular, explica que no se puede y ofrece WhatsApp', async () => {
  const { ctx, estado, pedidos } = armar({ OWNER_TELEGRAM_ID: '42' })
  const primero = await procesarMensaje(
    duenioTelegram('Podes mandarle un mensaje a Demian? El celu es +5491199998888'),
    estado,
    ctx,
  )
  const segundo = await procesarMensaje(
    duenioTelegram('Mandale saludos de mi parte'),
    primero.estado,
    ctx,
  )
  const tercero = await procesarMensaje(
    duenioTelegram('Mandale un mensaje por telegram'),
    segundo.estado,
    ctx,
  )
  assert.equal(pedidos.length, 0)
  const texto = tercero.respuestas[0].texto
  assert.match(texto, /no puede escribirle a un número de celular/i)
  assert.match(texto, /WhatsApp/)
  assert.match(texto, /5491199998888/)
  assert.match(texto, /saludos de mi parte/)
  assert.equal(tercero.estado.acciones.length, 0)
  assert.equal(tercero.respuestas.some((r) => r.audiencia === 'externo'), false)
})

test('con WhatsApp prendido, el pedido en varios turnos queda pendiente de /si y no sale solo', async () => {
  const { ctx, estado } = armar({ OWNER_TELEGRAM_ID: '42' }, { canalesActivos: ['simulador', 'telegram', 'whatsapp'] })
  const primero = await procesarMensaje(
    duenioTelegram('Podes mandarle un mensaje a mi hermano? Si celu es +5491199998888'),
    estado,
    ctx,
  )
  const segundo = await procesarMensaje(
    duenioTelegram('Mandale saludos de mi parte. se llama demian.'),
    primero.estado,
    ctx,
  )
  assert.equal(segundo.estado.acciones.length, 1)
  assert.equal(segundo.estado.acciones[0].tipo, 'whatsapp')
  assert.equal(segundo.estado.acciones[0].destino, NUMERO)
  assert.equal(segundo.estado.acciones[0].texto, 'saludos de mi parte')
  assert.match(segundo.respuestas[0].texto, /\/si /)
  assert.equal(segundo.respuestas.some((r) => r.audiencia === 'externo'), false)
  const no = await procesarMensaje(duenioTelegram('/no 1'), segundo.estado, ctx)
  assert.equal(no.estado.acciones.length, 0)
  assert.equal(no.respuestas.some((r) => r.canal === 'whatsapp'), false)
})

test('el prompt del dueño conserva los últimos turnos: nombre, número y texto', async () => {
  const { ctx, pedidos, estado } = armar({ OWNER_TELEGRAM_ID: '42' })
  let actual = estado
  actual.historial['duenio:telegram:42'] = []
  for (let i = 0; i < 22; i += 1) {
    actual.historial['duenio:telegram:42'].push(
      { rol: 'cliente', texto: `nota previa ${i}`, cuando: 1 },
      { rol: 'asistente', texto: `ok ${i}`, cuando: 1 },
    )
  }
  actual.historial['duenio:telegram:42'].push(
    { rol: 'cliente', texto: 'Podes mandarle un mensaje a mi hermano? Si celu es +5491199998888', cuando: 2 },
    { rol: 'asistente', texto: 'Dale, qué querés que le diga?', cuando: 2 },
    { rol: 'cliente', texto: 'Mandale saludos de mi parte. se llama demian.', cuando: 2 },
    { rol: 'asistente', texto: 'WhatsApp no está prendido.', cuando: 2 },
  )
  assert.ok(actual.historial['duenio:telegram:42'].length > 8)
  const r = await procesarMensaje(duenioTelegram('resumime qué te pedí de Demian'), actual, ctx)
  assert.equal(r.respuestas[0].audiencia, 'duenio')
  const prompt = pedidos.at(-1).prompt
  assert.equal(pedidos.at(-1).camino, 'duenio')
  assert.match(prompt, /HISTORIAL RECIENTE/)
  assert.match(prompt, /5491199998888/)
  assert.match(prompt, /demian/i)
  assert.match(prompt, /saludos de mi parte/)
  assert.equal(prompt.includes('nota previa 0'), false)
  assert.match(prompt, /nota previa 21/)
  assert.equal(TOPE_HISTORIAL_DUENIO, 40)
  const armado = armarPrompt({
    camino: 'duenio',
    reglas: 'manual',
    mensaje: 'y ahora?',
    historial: actual.historial['duenio:telegram:42'],
  })
  assert.match(armado, /5491199998888/)
})
