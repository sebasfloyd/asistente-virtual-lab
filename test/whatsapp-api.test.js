import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  crearWhatsappApi, entradasDeWebhook, firmaValida, respuestaVerificacion, textoErrorApi,
} from '../src/canales/whatsapp-api.js'
import { leerConfig, revisarConfig, secretosDe } from '../src/config.js'
import {
  cambiosCanal, cambiosMail, cambiosWhatsappApi, claveAppValida, opcionActual, problemaMailAsistente, textoWebhook,
} from '../src/setup-pasos.js'

const webhook = (from, texto, id = 'wamid.1') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { messages: [{ from, id, type: 'text', text: { body: texto } }] } }] }],
})

function fetchFalso(respuestas = []) {
  const llamadas = []
  const f = async (url, opciones) => {
    llamadas.push({ url, opciones, cuerpo: typeof opciones.body === 'string' ? JSON.parse(opciones.body) : opciones.body })
    const r = respuestas.shift() || { status: 200, data: { messages: [{ id: 'x' }] } }
    return { ok: r.status < 300, status: r.status, json: async () => r.data }
  }
  return { f, llamadas }
}

const api = { token: 'EAAtokenfalso123', phoneId: '1234567890', verifyToken: 'verif', appSecret: 'secreto', puerto: 0, version: 'v21.0', plantilla: '', idioma: 'es_AR' }

test('webhook de Meta → entrada con el mismo formato que WhatsApp por QR', () => {
  const [e] = entradasDeWebhook(webhook('5491111111111', ' hola '))
  assert.deepEqual(e, { canal: 'whatsapp', senderId: '5491111111111@s.whatsapp.net', responderId: '5491111111111@s.whatsapp.net', texto: 'hola', id: 'wamid.1' })
  assert.equal(entradasDeWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] }).length, 0)
})

test('verificación del webhook y firma de Meta', () => {
  assert.deepEqual(respuestaVerificacion('/webhook?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=123', 'verif'), { status: 200, cuerpo: '123' })
  assert.equal(respuestaVerificacion('/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1', 'verif').status, 403)
  const cuerpo = Buffer.from('{"a":1}')
  const firma = `sha256=${createHmac('sha256', 'secreto').update(cuerpo).digest('hex')}`
  assert.equal(firmaValida(cuerpo, firma, 'secreto'), true)
  assert.equal(firmaValida(cuerpo, 'sha256=mal', 'secreto'), false)
})

test('API oficial: solo atiende al dueño salvo WHATSAPP_CLIENTES, y no repite mensajes', async () => {
  const recibidos = []
  const { f } = fetchFalso()
  const wa = await crearWhatsappApi({ api, duenio: '5491100000000', onMensaje: async (e) => recibidos.push(e), fetch: f, escuchar: false })
  await wa.recibir(webhook('5491199999999', 'soy un amigo', 'a'))
  await wa.recibir(webhook('5491100000000', 'soy el dueño', 'b'))
  await wa.recibir(webhook('5491100000000', 'soy el dueño', 'b'))
  assert.deepEqual(recibidos.map((e) => e.texto), ['soy el dueño'])
})

test('API oficial: manda texto con el token y sin markdown crudo', async () => {
  const { f, llamadas } = fetchFalso()
  const wa = await crearWhatsappApi({ api, onMensaje: async () => {}, fetch: f, escuchar: false })
  await wa.enviar('5491111111111@s.whatsapp.net', '**Hola** Ana')
  const envio = llamadas.find((l) => l.url.endsWith('/1234567890/messages') && l.cuerpo.type === 'text')
  assert.equal(envio.url, 'https://graph.facebook.com/v21.0/1234567890/messages')
  assert.equal(envio.opciones.headers.authorization, 'Bearer EAAtokenfalso123')
  assert.equal(envio.cuerpo.to, '5491111111111')
  assert.equal(envio.cuerpo.text.body, '*Hola* Ana')
})

test('API oficial: fuera de 24 h usa la plantilla si hay, y si no explica el motivo', async () => {
  const fuera = { status: 400, data: { error: { code: 131047, message: 'Re-engagement' } } }
  const sin = fetchFalso([fuera])
  const wa = await crearWhatsappApi({ api, onMensaje: async () => {}, fetch: sin.f, escuchar: false })
  await assert.rejects(wa.enviar('5491111111111', 'hola'), /24 h.*plantilla/)
  const con = fetchFalso([fuera])
  const wa2 = await crearWhatsappApi({ api: { ...api, plantilla: 'retomar' }, onMensaje: async () => {}, fetch: con.f, escuchar: false })
  await assert.rejects(wa2.enviar('5491111111111', 'hola'), /le mandé la plantilla/)
  assert.equal(con.llamadas[1].cuerpo.template.name, 'retomar')
  assert.match(textoErrorApi(401, {}).texto, /access token/)
})

test('API oficial: webhook HTTP real (verificación, firma y mensaje)', async () => {
  const recibidos = []
  const { f } = fetchFalso()
  const wa = await crearWhatsappApi({ api, clientes: 'todos', onMensaje: async (e) => recibidos.push(e), fetch: f })
  const base = `http://127.0.0.1:${wa.server.address().port}/webhook`
  try {
    const v = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=ok123`)
    assert.equal(await v.text(), 'ok123')
    const cuerpo = JSON.stringify(webhook('5491122222222', 'quiero un turno', 'z'))
    const sinFirma = await fetch(base, { method: 'POST', body: cuerpo })
    assert.equal(sinFirma.status, 401)
    const firma = `sha256=${createHmac('sha256', 'secreto').update(cuerpo).digest('hex')}`
    const ok = await fetch(base, { method: 'POST', body: cuerpo, headers: { 'x-hub-signature-256': firma } })
    assert.equal(ok.status, 200)
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(recibidos[0].texto, 'quiero un turno')
  } finally {
    wa.cerrar()
  }
})

test('API oficial: manda el PDF como documento', async () => {
  const pdf = path.join(os.tmpdir(), `wa-${process.pid}.pdf`)
  fs.writeFileSync(pdf, '%PDF-1.4')
  const { f, llamadas } = fetchFalso([{ status: 200, data: { id: 'media1' } }])
  const wa = await crearWhatsappApi({ api, onMensaje: async () => {}, fetch: f, escuchar: false })
  await wa.enviarArchivo('5491111111111@s.whatsapp.net', pdf, 'Propuesta')
  assert.match(llamadas[0].url, /\/media$/)
  assert.deepEqual(llamadas[1].cuerpo.document, { id: 'media1', filename: path.basename(pdf), caption: 'Propuesta' })
})

test('config: WHATSAPP_MODO=api, secretos tapados y aviso si falta algo', () => {
  const c = leerConfig({ WHATSAPP: 'true', WHATSAPP_MODO: 'api', WHATSAPP_API_TOKEN: 'EAAtokenlargo', WHATSAPP_API_PHONE_ID: '123', WHATSAPP_API_APP_SECRET: 'appsecret1' })
  assert.equal(c.whatsappModo, 'api')
  assert.equal(c.whatsappApi.activo, true)
  assert.equal(c.whatsappApi.puerto, 8787)
  assert.ok(secretosDe(c).includes('EAAtokenlargo'))
  assert.ok(secretosDe(c).includes('appsecret1'))
  assert.equal(leerConfig({ WHATSAPP: 'true' }).whatsappModo, 'qr')
  assert.ok(revisarConfig(leerConfig({ WHATSAPP: 'true', WHATSAPP_MODO: 'api' })).some((p) => p.includes('WHATSAPP_API_TOKEN')))
})

test('setup: elegir canal', () => {
  assert.deepEqual(cambiosCanal('1'), { TELEGRAM: 'true', WHATSAPP: 'false' })
  assert.deepEqual(cambiosCanal('2'), { TELEGRAM: 'false', WHATSAPP: 'true', WHATSAPP_MODO: 'qr' })
  assert.deepEqual(cambiosCanal('3'), { TELEGRAM: 'false', WHATSAPP: 'true', WHATSAPP_MODO: 'api' })
  assert.equal(opcionActual({}), '1')
  assert.equal(opcionActual({ WHATSAPP: 'true', WHATSAPP_MODO: 'api' }), '3')
  const c = cambiosWhatsappApi({ phoneId: '12-34', token: 'EAAx' })
  assert.equal(c.WHATSAPP_API_PHONE_ID, '1234')
  assert.match(c.WHATSAPP_API_VERIFY_TOKEN, /^[0-9a-f]{36}$/)
  assert.match(textoWebhook(8787, 'abc'), /cloudflared tunnel --url http:\/\/localhost:8787/)
})

test('setup: el mail del asistente es propio, nunca el del dueño', () => {
  assert.match(problemaMailAsistente('dueno@ejemplo.com', 'Dueno@ejemplo.com'), /cuenta propia/)
  assert.equal(problemaMailAsistente('martin.asistente@gmail.com', 'dueno@ejemplo.com'), '')
  assert.match(problemaMailAsistente('nada', ''), /no parece/)
  assert.equal(claveAppValida('abcd efgh ijkl mnop'), true)
  assert.equal(claveAppValida('MiClave123'), false)
  assert.deepEqual(cambiosMail({ usuario: 'martin.asistente@gmail.com', clave: 'abcd efgh ijkl mnop', mailDuenio: 'dueno@ejemplo.com' }), {
    MAIL_USUARIO: 'martin.asistente@gmail.com', MAIL_CLAVE_APP: 'abcdefghijklmnop', MAIL_SMTP: 'smtp.gmail.com:465', MAIL_COPIA: 'dueno@ejemplo.com',
  })
})
