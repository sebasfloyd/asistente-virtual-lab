import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pdfBasico, renderizarPropuesta } from '../src/pdf.js'
import {
  guardarPropuesta,
  noInventarPrecios,
  parsearPropuesta,
  preciosDe,
  propuestaDeSimulacion,
} from '../src/propuesta.js'
import { procesarMensaje } from '../src/turno.js'
import { armar, duenioTelegram } from './ayuda.js'

test('parsea /propuesta con cliente, mail y pedido', () => {
  const a = parsearPropuesta('/propuesta Ana Pérez <ana@negocio.com> / implementación del asistente')
  assert.equal(a.cliente, 'Ana Pérez')
  assert.equal(a.para, 'ana@negocio.com')
  assert.equal(a.pedido, 'implementación del asistente')
  const b = parsearPropuesta('/propuesta Estudio Norte | acompañamiento comercial')
  assert.equal(b.cliente, 'Estudio Norte')
  assert.equal(b.pedido, 'acompañamiento comercial')
  assert.equal(parsearPropuesta('hola qué tal'), null)
})

test('no inventa precios y deja [completar] si servicios.md está vacío', () => {
  const servicios = '# Servicios\n- Consultoría: [completar]\n'
  assert.deepEqual(preciosDe(servicios), [])
  const texto = propuestaDeSimulacion({
    plantilla: 'Para [cliente]\nPedido: [pedido]\nInversión: $12.000',
    servicios,
    cliente: 'Ana',
    pedido: 'consultoría',
    fecha: '2026-11-24',
  })
  assert.match(texto, /Ana/)
  assert.match(texto, /\[completar\]/)
  assert.equal(texto.includes('$12.000'), false)
  assert.equal(noInventarPrecios('Sale $5000', servicios).includes('$5000'), false)
})

test('el PDF básico es un PDF válido y se guarda en data/propuestas', () => {
  const buf = pdfBasico({ titulo: 'Propuesta', cuerpo: 'Para Ana\nInversión: [completar]' })
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-')
  assert.match(buf.toString('latin1'), /%%EOF/)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'propuestas-'))
  const guardado = guardarPropuesta({
    dir,
    cliente: 'Ana Pérez',
    pedido: 'consultoría',
    markdown: '# Propuesta\n\nPara Ana\n\nInversión: [completar]\n',
    ahora: Date.parse('2026-11-24T15:00:00-03:00'),
  })
  assert.equal(fs.existsSync(guardado.ruta), true)
  assert.equal(fs.readFileSync(guardado.ruta).subarray(0, 5).toString(), '%PDF-')
  assert.equal(fs.existsSync(guardado.html), true)
  assert.equal(fs.existsSync(guardado.md), true)
})

test('/propuesta arma el PDF, se lo manda al dueño y /si no envía mail en simulación', async () => {
  const { ctx, estado } = armar({ OWNER_TELEGRAM_ID: '42', CEREBRO: 'simulacion' })
  const propuesto = await procesarMensaje(
    duenioTelegram('/propuesta Ana Pérez <ana@negocio.com> / implementación del asistente'),
    estado,
    ctx,
  )
  const r = propuesto.respuestas[0]
  assert.match(r.texto, /propuesta para Ana Pérez/i)
  assert.ok(r.archivo)
  assert.equal(fs.existsSync(r.archivo), true)
  assert.equal(fs.readFileSync(r.archivo).subarray(0, 5).toString(), '%PDF-')
  assert.equal(propuesto.estado.acciones[0].tipo, 'propuesta-mail')
  assert.equal(propuesto.estado.acciones[0].para, 'ana@negocio.com')
  const id = propuesto.estado.acciones[0].id
  const si = await procesarMensaje(duenioTelegram(`/si ${id}`), propuesto.estado, ctx)
  assert.equal(si.estado.acciones.some((a) => a.tipo === 'propuesta-mail'), false)
  assert.match(si.respuestas[0].texto, /no mandé el mail/i)
  const rec = si.estado.acciones.find((a) => a.tipo === 'recordatorio-propuesta')
  assert.ok(rec)
  const recSi = await procesarMensaje(duenioTelegram(`/si ${rec.id}`), si.estado, ctx)
  assert.equal(recSi.estado.recordatorios.length, 1)
  assert.equal(recSi.estado.recordatorios[0].avisado, false)
})

test('/propuesta sin mail pide la dirección antes de enviar', async () => {
  const { ctx, estado } = armar({ OWNER_TELEGRAM_ID: '42' })
  const propuesto = await procesarMensaje(
    duenioTelegram('/propuesta Estudio Norte / acompañamiento'),
    estado,
    ctx,
  )
  const id = propuesto.estado.acciones[0].id
  const temprano = await procesarMensaje(duenioTelegram(`/si ${id}`), propuesto.estado, ctx)
  assert.equal(temprano.estado.acciones[0].tipo, 'propuesta-mail')
  assert.match(temprano.respuestas[0].texto, /Falta el mail/i)
  const conMail = await procesarMensaje(duenioTelegram(`/si ${id} ana@negocio.com`), temprano.estado, ctx)
  assert.equal(conMail.estado.acciones.some((a) => a.tipo === 'propuesta-mail'), false)
  assert.match(conMail.respuestas[0].texto, /no mandé el mail/i)
})

test('renderizarPropuesta siempre deja un PDF aunque no haya weasyprint', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'))
  const destino = path.join(dir, 't.pdf')
  const prev = process.env.PROPUESTA_PDF
  delete process.env.PROPUESTA_PDF
  const r = renderizarPropuesta({
    html: '<html><body>Hola</body></html>',
    texto: 'Hola',
    titulo: 'T',
    destino,
  })
  if (prev !== undefined) process.env.PROPUESTA_PDF = prev
  assert.equal(fs.existsSync(r.ruta), true)
  assert.equal(fs.readFileSync(r.ruta).subarray(0, 5).toString(), '%PDF-')
})
