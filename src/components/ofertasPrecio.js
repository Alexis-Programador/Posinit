export function aplicarOferta(producto, oferta) {
  const base = Number(producto.precioVenta);
  const valor = oferta?.precioOferta;
  const centavos = Math.round(valor * 100);
  if (oferta?.activa !== true || typeof valor !== "number" || !Number.isFinite(base) || !Number.isFinite(valor) || valor <= 0 || valor >= base || !Number.isSafeInteger(centavos) || Math.abs(valor * 100 - centavos) > 0.00001) return { ...producto, enOferta: false };
  return { ...producto, precioOriginal: base, precioVenta: centavos / 100, enOferta: true, descuento: Math.floor((base - valor) / base * 100) };
}
