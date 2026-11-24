import test from 'node:test'
import assert from 'node:assert/strict'
import { atiendeWhatsapp } from '../src/canales/whatsapp-texto.js'
const de = (jid, extra = {}) => ({ key: { remoteJid: jid, ...extra } })
test('whatsapp no atiende a desconocidos por defecto', () => {
  const otro = de('5491100000000@s.whatsapp.net')
  assert.equal(atiendeWhatsapp(otro), false)
  assert.equal(atiendeWhatsapp(otro, { clientes: '5491199999999' }), false)
  assert.equal(atiendeWhatsapp(otro, { clientes: '+54 911 0000-0000, 123' }), true)
  assert.equal(atiendeWhatsapp(otro, { duenio: '5491100000000' }), true)
  assert.equal(atiendeWhatsapp(otro, { clientes: 'todos' }), true)
  assert.equal(atiendeWhatsapp(de('5491100000000@lid'), { clientes: '5491100000000' }), false)
  assert.equal(atiendeWhatsapp(de('99@lid', { senderPn: '5491100000000@s.whatsapp.net' }), { clientes: '5491100000000' }), true)
})
