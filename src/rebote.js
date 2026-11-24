export function esComando(texto) {
  return /^\s*\//.test(String(texto || ''))
}

export function crearRebote({
  esperaMs = 2500,
  esperaComandoMs = 250,
  onLote,
  programar = setTimeout,
  cancelar = clearTimeout,
  claveDe = (entrada) => `${entrada.canal}:${entrada.senderId}`,
} = {}) {
  const pend = new Map()

  function esperaDe(entrada, textos) {
    const ultima = String(entrada?.texto || '')
    const hayComando = esComando(ultima) || textos.some(esComando)
    if (hayComando && textos.length === 1) return Math.max(0, Number(esperaComandoMs) || 0)
    return Math.max(0, Number(esperaMs) || 0)
  }

  function flushClave(clave) {
    const item = pend.get(clave)
    if (!item) return
    pend.delete(clave)
    if (item.timer) cancelar(item.timer)
    const textos = item.textos.filter((t) => String(t || '').trim())
    if (!textos.length) return
    const combinada = { ...item.base, texto: textos.join('\n') }
    return onLote(combinada)
  }

  function recibir(entrada) {
    const clave = claveDe(entrada)
    const prev = pend.get(clave)
    if (prev?.timer) cancelar(prev.timer)
    const textos = [...(prev?.textos || []), entrada.texto]
    const base = prev?.base || { ...entrada }
    const esperar = esperaDe(entrada, textos)
    const timer = programar(() => {
      pend.delete(clave)
      const lote = textos.filter((t) => String(t || '').trim())
      if (!lote.length) return
      onLote({ ...base, texto: lote.join('\n'), responderId: entrada.responderId || base.responderId })
    }, esperar)
    pend.set(clave, { textos, timer, base })
  }

  function flush(clave) {
    if (clave) return flushClave(clave)
    const resultados = []
    for (const k of [...pend.keys()]) resultados.push(flushClave(k))
    return resultados
  }

  function cerrar() {
    for (const item of pend.values()) {
      if (item.timer) cancelar(item.timer)
    }
    pend.clear()
  }

  return { recibir, flush, cerrar, pendientes: () => pend.size }
}
