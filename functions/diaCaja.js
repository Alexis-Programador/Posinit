const fechaNegocio = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City", year:"numeric", month:"2-digit", day:"2-digit"
});

// Busca el primer milisegundo del día del negocio, sin usar la zona del navegador.
function inicioDiaCaja(instante = Date.now()) {
  const dia = fechaNegocio.format(instante);
  let antes = instante - 36 * 3600000;
  let dentro = instante;
  while (dentro - antes > 1) {
    const medio = Math.floor((antes + dentro) / 2);
    if (fechaNegocio.format(medio) === dia) dentro = medio;
    else antes = medio;
  }
  return dentro;
}

module.exports = { inicioDiaCaja };
