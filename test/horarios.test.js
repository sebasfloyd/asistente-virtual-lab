import assert from 'node:assert/strict'
import test from 'node:test'
import { parsearHorarios, parecePedidoHorarios, parsearSlotsCerebro, proponerTresHuecos, textoSlots } from '../src/horarios.js'
import { procesarMensaje } from '../src/turno.js'
import { armar, cliente, duenioTelegram } from './ayuda.js'

const ZONA = 'America/Argentina/Buenos_Aires'
const AHORA = Date.parse('2026-11-24T15:00:00-03:00')

test('parsea pedidos de horarios en comando y en lenguaje natural', () => {
  const a = parsearHorarios('ofrecele horarios a Ana Pérez <ana@negocio.com> para una reunión de 30 min esta semana')
  assert.equal(a.quien.includes('Ana'), true)
  assert.equal(a.para, 'ana@negocio.com')
  assert.equal(a.duracionMin, 30)
  const b = parsearHorarios('/horarios Estudio Norte | reunión de 45 min esta semana')
  assert.equal(b.quien, 'Estudio Norte')
  assert.equal(b.duracionMin, 45)
  assert.equal(parecePedidoHorarios('ofrecele horarios a Ana para una reunión de 30 min esta semana'), true)
  assert.equal(parecePedidoHorarios('hola, cómo estás'), false)
})

test('propone exactamente 3 huecos en la zona del dueño y salta lo ocupado', () => {
  const slots = proponerTresHuecos({
    ocupados: [{ inicio: '2026-11-25T12:00:00.000Z', fin: '2026-11-25T13:00:00.000Z' }],
    ahora: AHORA,
    zona: ZONA,
    desde: '09:00',
    hasta: '18:00',
    duracionMin: 30,
  })
  assert.equal(slots.length, 3)
  for (const s of slots) {
    assert.match(s.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.match(s.desde, /^\d{2}:\d{2}$/)
    assert.match(s.hasta, /^\d{2}:\d{2}$/)
    assert.equal(s.inicio === '2026-11-25T12:00:00.000Z', false)
  }
})

test('parsea un JSON de huecos que devuelve el cerebro', () => {
  const slots = parsearSlotsCerebro('[{"fecha":"2026-11-25","desde":"10:00","hasta":"10:30"},{"fecha":"2026-11-26","desde":"11:00","hasta":"11:30"},{"fecha":"2026-11-27","desde":"15:00","hasta":"15:30"}]', ZONA)
  assert.equal(slots.length, 3)
  assert.equal(slots[0].desde, '10:00')
  assert.match(textoSlots(slots, ZONA, { quien: 'Ana', duracionMin: 30 }), /1\. 2026-11-25 10:00/)
})

test('el dueño pide horarios, recibe 3 huecos, y /si 1 2 agenda el segundo en local', async () => {
  const { ctx, estado } = armar({ OWNER_TELEGRAM_ID: '42', CEREBRO: 'simulacion' })
  const ofrecido = await procesarMensaje(
    duenioTelegram('ofrecele horarios a Ana Pérez <ana@negocio.com> para una reunión de 30 min esta semana'),
    estado,
    ctx,
  )
  const texto = ofrecido.respuestas[0].texto
  assert.match(texto, /1\./)
  assert.match(texto, /2\./)
  assert.match(texto, /3\./)
  assert.equal(ofrecido.estado.acciones[0].tipo, 'agenda-invitar')
  assert.equal(ofrecido.estado.acciones[0].slots.length, 3)
  const id = ofrecido.estado.acciones[0].id
  const segundo = ofrecido.estado.acciones[0].slots[1]
  const si = await procesarMensaje(duenioTelegram(`/si ${id} 2`), ofrecido.estado, ctx)
  assert.equal(si.estado.acciones.some((a) => a.tipo === 'agenda-invitar'), false)
  assert.match(si.respuestas[0].texto, /agenda local|ejecuté la acción/i)
  const ocupado = await ctx.leerOcupado()
  assert.ok(ocupado.intervalos.length >= 1)
  assert.ok(ocupado.intervalos.some((i) => i.inicio === segundo.inicio && i.fin === segundo.fin))
})

test('un cliente no crea el evento con /si', async () => {
  const { ctx, estado } = armar({ OWNER_TELEGRAM_ID: '42' })
  const ofrecido = await procesarMensaje(
    duenioTelegram('/horarios Ana | reunión de 30 min esta semana'),
    estado,
    ctx,
  )
  const id = ofrecido.estado.acciones[0].id
  const antes = ofrecido.estado.acciones.length
  const si = await procesarMensaje(cliente(`/si ${id} 1`), ofrecido.estado, ctx)
  assert.equal(si.estado.acciones.length, antes)
  const ocupado = await ctx.leerOcupado()
  assert.equal(ocupado.intervalos.length, 0)
})
