import path from 'node:path'
import { anexarAccion } from './acciones.js'
import { armarInvocacion, prepararEntorno } from './cerebro.js'
import { crearCerebro } from './cerebro.js'
import { listarConectoresMcp } from './conectores.js'
import { leerConfig, secretosDe } from './config.js'
import { dirsDe } from './dirs.js'
import { leerEstilo } from './estilo.js'
import { cargarEstado, estadoInicial, guardarEstado } from './estado.js'
import { crearLog } from './log.js'
import { leerMemoria, escribirMemoria } from './memoria.js'
import { guardarOcupado, leerOcupado } from './ocupado.js'
import { leerReglas } from './reglas.js'
import { tomarAvisos } from './reloj.js'
import { PROMPT_MAILS, textoResumen, tocaResumen } from './resumen.js'
import { avisosDuenio, procesarMensaje } from './turno.js'

export async function crearAplicacion({ canalesActivos, env = process.env, raiz = process.cwd(), duenioSimulador = '', cerebro } = {}) {
  const base = { ...leerConfig(env), duenioSimulador }
  const config = {
    ...base,
    conectoresDetectados: base.cerebro === 'claude' && base.ownerConectores !== false && !process.env.NODE_TEST_CONTEXT
      ? listarConectoresMcp({ env })
      : [],
  }
  const codigoOriginal = config.codigoDuenio
  const dirs = dirsDe(config, raiz)
  prepararEntorno(dirs)
  let estado = await cargarEstado(dirs.estado)
  const log = crearLog({ ruta: dirs.log, secretos: secretosDe(config), consola: console })
  const pensar = cerebro || crearCerebro(config, { log })
  const memoriaRuta = path.isAbsolute(config.memoriaPath) ? config.memoriaPath : path.join(raiz, config.memoriaPath)
  let cola = Promise.resolve()

  function encolar(fn) {
    const corre = cola.then(fn, fn)
    cola = corre.then(() => {}, () => {})
    return corre
  }

  function contexto() {
    return {
      config,
      dirs,
      env,
      canalesActivos,
      ahora: () => Date.now(),
      reglas: () => leerReglas(path.isAbsolute(config.reglasPath) ? config.reglasPath : path.join(raiz, config.reglasPath)),
      leerOcupado: () => leerOcupado(dirs.ocupado),
      guardarOcupado: (intervalos) => guardarOcupado(dirs.ocupado, intervalos),
      cerebro: pensar,
      log,
      leerMemoria: () => leerMemoria(memoriaRuta),
      guardarMemoria: (texto) => escribirMemoria(memoriaRuta, texto),
      leerEstilo: () => leerEstilo(path.isAbsolute(config.estiloPath) ? config.estiloPath : path.join(raiz, config.estiloPath)),
    }
  }

  async function revisarReloj(ahora = Date.now()) {
    return encolar(async () => {
      const avisos = tomarAvisos(estado, ahora, config.zona)
      const respuestas = []
      for (const aviso of avisos) {
        const textos = avisosDuenio(estado, config, canalesActivos, aviso.texto)
        respuestas.push(...textos)
        anexarAccion(dirs.acciones, {
          tipo: aviso.tipo,
          id: aviso.id,
          texto: aviso.texto,
          simulado: false,
          detalle: textos.length ? 'avisado al dueño' : 'sin destino de dueño',
        }, secretosDe(config))
      }
      const claveResumen = tocaResumen(estado, ahora, config.zona, config.resumenHora)
      if (claveResumen) {
        estado.ultimoResumen = claveResumen
        let mail = 'Sin conector de mail en esta corrida. No invento correos.'
        if (config.cerebro === 'claude' && config.ownerConectores) {
          try {
            mail = await pensar({
              camino: 'duenio',
              prompt: PROMPT_MAILS,
              invocacion: armarInvocacion({
                camino: 'duenio',
                dirs,
                env,
                config: { ...config, ownerEscritura: false },
              }),
              mensaje: 'resumen mails',
              reglas: '',
            })
          } catch (error) {
            log.error('resumen_mail', { mensaje: error.message })
            mail = 'No pude leer el conector de Gmail. No invento correos.'
          }
        }
        const agenda = await leerOcupado(dirs.ocupado)
        const texto = textoResumen({
          pendientes: estado.pendientes,
          intervalos: agenda.intervalos || [],
          zona: config.zona,
          ahora,
          mail,
        })
        respuestas.push(...avisosDuenio(estado, config, canalesActivos, texto))
        anexarAccion(dirs.acciones, {
          tipo: 'resumen',
          texto: 'resumen del día',
          simulado: !(config.cerebro === 'claude' && config.ownerConectores),
          detalle: 'resumen al dueño',
        }, secretosDe(config))
      }
      if (avisos.length || claveResumen) await guardarEstado(dirs.estado, estado)
      return respuestas
    })
  }

  async function manejar(entrada) {
    return encolar(async () => {
      const resultado = await procesarMensaje(entrada, estado, contexto())
      estado = resultado.estado
      await guardarEstado(dirs.estado, estado)
      return resultado.respuestas
    })
  }

  async function reiniciar() {
    estado = estadoInicial()
    config.codigoDuenio = codigoOriginal
    await guardarEstado(dirs.estado, estado)
  }

  return { manejar, reiniciar, revisarReloj, config, dirs, log, canalesActivos }
}
