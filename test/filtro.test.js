import assert from 'node:assert/strict'
import test from 'node:test'
import { filtrarSalidaCliente } from '../src/filtro.js'
import { redactar } from '../src/log.js'

const REGLAS = 'Escribinos a hola@negocio.com'

test('tapa el mail y el teléfono del dueño y deja el mail del negocio', () => {
  const { texto, oculto } = filtrarSalidaCliente(
    'Soy duenio@correo.com, whatsapp 54911 1234-5678. El local es hola@negocio.com. También otro@secreto.com.',
    { reglas: REGLAS, emailDuenio: 'duenio@correo.com', telefonoDuenio: '5491112345678' },
  )
  assert.equal(oculto, true)
  assert.equal(texto.includes('duenio@correo.com'), false)
  assert.equal(texto.includes('54911'), false)
  assert.equal(texto.includes('otro@secreto.com'), false)
  assert.match(texto, /hola@negocio.com/)
})

test('sin OWNER_EMAIL igual tapa mails que no están en el manual', () => {
  const { texto } = filtrarSalidaCliente('la cuenta es Ana@Claude.dev', { reglas: REGLAS, emailDuenio: '' })
  assert.equal(texto.toLowerCase().includes('ana@claude.dev'), false)
  assert.match(texto, /dato privado/)
})

test('tapa rutas de la compu', () => {
  const { texto } = filtrarSalidaCliente('está en /Users/seba/proyecto/reglas.md y en /home/seba/.claude', { reglas: '' })
  assert.equal(texto.includes('/Users/seba'), false)
  assert.equal(texto.includes('/home/seba'), false)
})

test('el log no guarda el token ni el mail', () => {
  const token = '777777:AAAabcdefghijklmnopqrst'
  const linea = redactar(`error ${token} mail duenio@correo.com`, [token, 'duenio@correo.com'])
  assert.equal(linea.includes(token), false)
  assert.equal(linea.includes('duenio@correo.com'), false)
  assert.match(linea, /\[secreto\]/)
})
