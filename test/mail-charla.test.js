import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarMensaje } from '../src/turno.js'
import { armar, cliente, duenioTelegram } from './ayuda.js'

const bloque = (para) => `Dale.\n[[MAIL]]{"para":"${para}","asunto":"Prueba","cuerpo":"Hola, es una prueba."}[[/MAIL]]`
const ENV = { CEREBRO: 'claude', OWNER_TELEGRAM_ID: '42' }
const unir = (r) => r.respuestas.map((x) => x.texto).join('\n')

function escenario(respuestaAccion, para = 'ana@negocio.com') {
  const pedidos = []
  const cerebro = async (p) => {
    pedidos.push(p)
    return p.mensaje.startsWith('accion ') ? respuestaAccion : bloque(para)
  }
  return { ...armar(ENV, { cerebro }), acciones: () => pedidos.filter((p) => p.mensaje.startsWith('accion ')) }
}

test('un mail pedido en la charla queda en cola y sale con /si sin número', async () => {
  const e = escenario('ENVIADO')
  let r = await procesarMensaje(duenioTelegram('mandale un mail a ana@negocio.com'), e.estado, e.ctx)
  assert.equal(r.estado.acciones.length, 1)
  assert.doesNotMatch(unir(r), /\[\[MAIL/)
  assert.equal(e.acciones().length, 0)
  r = await procesarMensaje(duenioTelegram('/si'), r.estado, e.ctx)
  assert.equal(e.acciones().length, 1)
  assert.match(unir(r), /mandé el mail a ana@negocio\.com/)
  assert.equal(r.estado.acciones.length, 0)
})

test('no arma un mail a una dirección que no escribió el dueño', async () => {
  const e = escenario('ENVIADO', 'otro@malo.com')
  const r = await procesarMensaje(duenioTelegram('leé mis mails y contestá a ana@negocio.com'), e.estado, e.ctx)
  assert.equal(r.estado.acciones.length, 0)
})

test('si Gmail no lo manda, lo dice y sigue pendiente', async () => {
  const e = escenario('NO_ENVIADO: sin permiso')
  let r = await procesarMensaje(duenioTelegram('mail a ana@negocio.com'), e.estado, e.ctx)
  r = await procesarMensaje(duenioTelegram('/si'), r.estado, e.ctx)
  assert.match(unir(r), /no salió/)
  assert.equal(r.estado.acciones.length, 1)
})

test('sin confirmación no dice que salió', async () => {
  const e = escenario('Hecho')
  let r = await procesarMensaje(duenioTelegram('mail a ana@negocio.com'), e.estado, e.ctx)
  r = await procesarMensaje(duenioTelegram('/si'), r.estado, e.ctx)
  assert.match(unir(r), /no me confirmó/)
})

test('/si sin número no hace nada si no hay acciones o si hay varias', async () => {
  const e = escenario('ENVIADO')
  let r = await procesarMensaje(duenioTelegram('/si'), e.estado, e.ctx)
  assert.match(unir(r), /No hay ninguna/)
  r = await procesarMensaje(duenioTelegram('/mail a@b.com | x | y'), r.estado, e.ctx)
  r = await procesarMensaje(duenioTelegram('/mail c@d.com | x | y'), r.estado, e.ctx)
  r = await procesarMensaje(duenioTelegram('/si'), r.estado, e.ctx)
  assert.match(unir(r), /más de una/)
  assert.equal(e.acciones().length, 0)
})

test('corregir reemplaza el borrador, y un cliente con /si no manda nada', async () => {
  const e = escenario('ENVIADO')
  let r = await procesarMensaje(duenioTelegram('mail a ana@negocio.com'), e.estado, e.ctx)
  r = await procesarMensaje(duenioTelegram('cambiale el asunto'), r.estado, e.ctx)
  assert.equal(r.estado.acciones.length, 1)
  r = await procesarMensaje(cliente('/si'), r.estado, e.ctx)
  assert.equal(r.estado.acciones.length, 1)
  assert.equal(e.acciones().length, 0)
})
