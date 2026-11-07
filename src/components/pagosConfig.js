// Nunca colocar claves privadas Stripe ni credenciales Firebase en VITE_*.
export const ENTORNO_PAGOS = import.meta.env.VITE_POS_PAY_MODE === "live" ? "live" : "test";
const direccion = import.meta.env.VITE_POS_PAY_API_URL || (ENTORNO_PAGOS === "test" ? "https://pos-init-pay-api.alexis52gamer.workers.dev" : "");
export const API_PAGOS = (() => {
  try { const u=new URL(direccion);return u.protocol==="https:"?u.href.replace(/\/$/,""):""; }
  catch { return ""; }
})();
export function sesionStripeValida(id) {
  return typeof id === "string" && id.length <= 255 && new RegExp(`^cs_${ENTORNO_PAGOS}_[a-zA-Z0-9_]+$`).test(id);
}
