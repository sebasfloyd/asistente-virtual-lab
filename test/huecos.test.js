import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { calcularHuecos, intervalosDesdeEventos, textoHuecos } from '../src/huecos.js'
import { procesarMensaje } from '../src/turno.js'
import { armar, cliente } from './ayuda.js'

test('los huecos no arrastran título ni detalle', () => {
  const ejemplo = JSON.parse(fs.readFileSync(new URL('../ocupado.ejemplo.json', import.meta.url), 'utf8'))
  const intervalos = intervalosDesdeEventos(ejemplo.intervalos)
  assert.equal(JSON.stringify(intervalos).includes('TITULO'), false)
  assert.equal(JSON.stringify(intervalos).includes('privada'), false)
  const huecos = calcularHuecos({
    ocupados: ejemplo.intervalos,
    dia: { anio: 2026, mes: 11, dia: 25 },
    desde: '09:00',
    hasta: '13:00',
    duracionMin: 60,
    zona: 'America/Argentina/Buenos_Aires',
  })
  const texto = textoHuecos({
    huecos,
    dia: { anio: 2026, mes: 11, dia: 25 },
    zona: 'America/Argentina/Buenos_Aires',
    hayDatos: true,
    diaEntendido: true,
  })
  assert.equal(texto.includes('ESTE TITULO'), false)
  assert.equal(texto.includes('privada'), false)
  assert.match(texto, /09:00 a 10:00/)
  assert.equal(texto.includes('10:00 a 11:00'), false)
  assert.match(texto, /11:00 a 12:00/)
})

test('sin agenda no inventa que el día está libre', async () => {
  const { ctx, pedidos, estado } = armar({ OWNER_TELEGRAM_ID: '42', HUECOS_LIBRES: 'true' })
  const paso = await procesarMensaje(cliente('¿hay lugar mañana?'), estado, ctx)
  assert.equal(pedidos.length, 0)
  const aviso = paso.respuestas.find((r) => r.audiencia === 'duenio').texto
  assert.match(aviso, /no hay una agenda cargada/)
  assert.equal(aviso.includes('libre el'), false)
})
