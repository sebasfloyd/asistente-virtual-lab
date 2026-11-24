import assert from 'node:assert/strict'
import test from 'node:test'
import { enviarConEstilo } from '../src/envio.js'
import {
  limpiarEstilo,
  partesParaEnviar,
  partirMensajes,
  pausaPorLargo,
  sacarAperturas,
  sacarFirma,
} from '../src/estilo.js'
import { crearRebote } from '../src/rebote.js'

test('saca signos de apertura ¿ y ¡ en cualquier lugar', () => {
  assert.equal(sacarAperturas('¿Cómo estás? ¡Qué bien!'), 'Cómo estás? Qué bien!')
  assert.equal(sacarAperturas('Hola. ¿Venís mañana?'), 'Hola. Venís mañana?')
  assert.equal(limpiarEstilo('¿Todo bien?\n¡Dale!'), 'Todo bien?\nDale!')
})

test('saca firmas, saludos de cierre y aperturas formales', () => {
  assert.equal(sacarFirma('Te confirmo el turno.\nSaludos, Ana'), 'Te confirmo el turno.')
  assert.equal(sacarFirma('Listo.\nUn abrazo'), 'Listo.')
  assert.equal(sacarFirma('Quedó anotado.\nAtentamente'), 'Quedó anotado.')
  assert.equal(sacarFirma('Ahí te aviso.\nQuedo a disposición'), 'Ahí te aviso.')
  assert.equal(sacarFirma('Dale, lo veo.\n— Luli', 'Luli'), 'Dale, lo veo.')
  assert.equal(limpiarEstilo('Estimado Juan,\nEl turno está ok.\nSaludos, Luli', 'Luli'), 'El turno está ok.')
  assert.equal(limpiarEstilo('Dale, lo veo.\n— Jorge Test', 'Jorge Test'), 'Dale, lo veo.')
  assert.equal(limpiarEstilo('Dale, lo veo. — Jorge Test', 'Jorge Test'), 'Dale, lo veo.')
})

test('parte por oración y no corta abreviaturas', () => {
  assert.deepEqual(
    partirMensajes('Hola. Mañana te confirmo. Cualquier cosa escribime'),
    ['Hola.', 'Mañana te confirmo.', 'Cualquier cosa escribime'],
  )
  assert.deepEqual(
    partirMensajes('El Dr. Pérez atiende a las 18. Te aviso.'),
    ['El Dr. Pérez atiende a las 18.', 'Te aviso.'],
  )
  assert.deepEqual(
    partirMensajes('Bueno, ¿venís mañana? ¡Genial!'),
    ['Bueno, ¿venís mañana?', '¡Genial!'],
  )
})

test('una lista sale un ítem por mensaje y no se parte a mitad de ítem', () => {
  const partes = partirMensajes('Llevá esto:\n- tijera\n- algodón\n- alcohol')
  assert.deepEqual(partes, ['Llevá esto:', '- tijera', '- algodón', '- alcohol'])

  const numerada = partirMensajes('Pasos:\n1. Abrí Telegram\n2. Mandá /start\n3. Pegá el ID')
  assert.deepEqual(numerada, ['Pasos:', '1. Abrí Telegram', '2. Mandá /start', '3. Pegá el ID'])

  const envuelto = partirMensajes('- primer punto\n  que sigue en la línea de abajo\n- segundo punto')
  assert.equal(envuelto.length, 2)
  assert.match(envuelto[0], /primer punto/)
  assert.match(envuelto[0], /línea de abajo/)
  assert.equal(envuelto[1], '- segundo punto')
})

test('partesParaEnviar limpia y puede no partir', () => {
  assert.deepEqual(
    partesParaEnviar('¿Hola! Todo bien. Te aviso mañana.\n— Luli', { nombre: 'Luli' }),
    ['Hola!', 'Todo bien.', 'Te aviso mañana.'],
  )
  assert.deepEqual(
    partesParaEnviar('Hola. Te aviso.', { partir: false }),
    ['Hola. Te aviso.'],
  )
})

test('la pausa crece con el largo y respeta un techo', () => {
  const corta = pausaPorLargo('ok', { baseMs: 400, porCaracterMs: 20, minMs: 400, maxMs: 2000 })
  const larga = pausaPorLargo('x'.repeat(80), { baseMs: 400, porCaracterMs: 20, minMs: 400, maxMs: 2000 })
  assert.ok(larga > corta)
  assert.equal(pausaPorLargo('x'.repeat(400), { baseMs: 400, porCaracterMs: 20, minMs: 400, maxMs: 2000 }), 2000)
  assert.equal(pausaPorLargo('', { baseMs: 700, porCaracterMs: 18, minMs: 400, maxMs: 2800 }), 700)
})

function relojFalso() {
  let ahora = 0
  const timers = new Map()
  let seq = 0
  return {
    ahora: () => ahora,
    programar(fn, ms) {
      const id = ++seq
      timers.set(id, { when: ahora + ms, fn })
      return id
    },
    cancelar(id) {
      timers.delete(id)
    },
    avanzar(ms) {
      ahora += ms
      const due = [...timers.entries()]
        .filter(([, t]) => t.when <= ahora)
        .sort((a, b) => a[1].when - b[1].when)
      for (const [id, t] of due) {
        if (!timers.has(id)) continue
        timers.delete(id)
        t.fn()
      }
    },
  }
}

test('el debounce junta un burst y responde una sola vez', () => {
  const reloj = relojFalso()
  const lotes = []
  const rebote = crearRebote({
    esperaMs: 2500,
    esperaComandoMs: 250,
    onLote: (entrada) => lotes.push(entrada),
    programar: reloj.programar,
    cancelar: reloj.cancelar,
  })
  rebote.recibir({ canal: 'telegram', senderId: '11', responderId: '11', texto: 'hola' })
  rebote.recibir({ canal: 'telegram', senderId: '11', responderId: '11', texto: 'tenés lugar mañana?' })
  reloj.avanzar(2499)
  assert.equal(lotes.length, 0)
  reloj.avanzar(1)
  assert.equal(lotes.length, 1)
  assert.equal(lotes[0].texto, 'hola\ntenés lugar mañana?')
  assert.equal(lotes[0].senderId, '11')
})

test('un comando solo espera menos, y dos chats no se mezclan', () => {
  const reloj = relojFalso()
  const lotes = []
  const rebote = crearRebote({
    esperaMs: 2500,
    esperaComandoMs: 250,
    onLote: (entrada) => lotes.push(entrada),
    programar: reloj.programar,
    cancelar: reloj.cancelar,
  })
  rebote.recibir({ canal: 'telegram', senderId: '1', texto: '/memoria' })
  rebote.recibir({ canal: 'telegram', senderId: '2', texto: 'hola' })
  rebote.recibir({ canal: 'whatsapp', senderId: '1', texto: 'otra persona' })
  reloj.avanzar(250)
  assert.equal(lotes.length, 1)
  assert.equal(lotes[0].texto, '/memoria')
  assert.equal(lotes[0].senderId, '1')
  assert.equal(lotes[0].canal, 'telegram')
  reloj.avanzar(2250)
  assert.equal(lotes.length, 3)
  const textos = lotes.map((l) => `${l.canal}:${l.senderId}:${l.texto}`).sort()
  assert.deepEqual(textos, [
    'telegram:1:/memoria',
    'telegram:2:hola',
    'whatsapp:1:otra persona',
  ])
})

test('enviarConEstilo marca que está escribiendo y espera según el largo', async () => {
  const eventos = []
  const canal = {
    async indicarEscribiendo(destino) {
      eventos.push(['typing', destino])
    },
    async enviar(destino, texto) {
      eventos.push(['enviar', destino, texto])
    },
  }
  const durmidas = []
  await enviarConEstilo({
    canal,
    destino: '99',
    texto: 'Hola. Te confirmo mañana.\n— Luli',
    config: { partirMensajes: true, pausaEntreMensajesMs: 400, nombre: 'Luli' },
    dormir: async (ms) => { durmidas.push(ms) },
  })
  assert.deepEqual(eventos, [
    ['typing', '99'],
    ['enviar', '99', 'Hola.'],
    ['typing', '99'],
    ['enviar', '99', 'Te confirmo mañana.'],
  ])
  assert.equal(durmidas.length, 2)
  assert.ok(durmidas[1] > durmidas[0])
})
