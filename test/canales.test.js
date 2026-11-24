import assert from 'node:assert/strict'
import test from 'node:test'
import { esJidIgnorado, textoDeWhatsapp } from '../src/canales/whatsapp-texto.js'

test('whatsapp ignora grupos, estados y lo que manda el propio chip', () => {
  assert.equal(esJidIgnorado('549111@g.us'), true)
  assert.equal(textoDeWhatsapp({ key: { fromMe: true, remoteJid: '5491112345678@s.whatsapp.net' }, message: { conversation: 'hola' } }), null)
  const entrada = textoDeWhatsapp({
    key: { fromMe: false, remoteJid: '5491199999999@s.whatsapp.net', id: '1' },
    message: { ephemeralMessage: { message: { conversation: 'hola' } } },
  })
  assert.equal(entrada.senderId, '5491199999999@s.whatsapp.net')
  assert.equal(entrada.texto, 'hola')
  assert.equal(textoDeWhatsapp({
    key: { remoteJid: '549111@s.whatsapp.net' },
    message: { conversation: 'soy el dueño 5491112345678' },
  }).senderId, '549111@s.whatsapp.net')
})
