import { partesParaEnviar, pausaPorLargo } from './estilo.js'

const dormirDefault = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)) })

export async function enviarConEstilo({
  canal,
  destino,
  texto,
  config = {},
  dormir = dormirDefault,
} = {}) {
  const partes = partesParaEnviar(texto, {
    partir: config.partirMensajes !== false,
    nombre: config.nombre,
  })
  const baseMs = config.pausaEntreMensajesMs ?? 700
  for (const parte of partes) {
    if (typeof canal?.indicarEscribiendo === 'function') {
      await canal.indicarEscribiendo(destino).catch(() => {})
    }
    const pausa = pausaPorLargo(parte, { baseMs, minMs: Math.min(350, baseMs), maxMs: 2800 })
    if (pausa > 0) await dormir(pausa)
    await canal.enviar(destino, parte)
  }
  return partes
}
