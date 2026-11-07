import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const valoresIniciales = Object.freeze({
  colorEncabezado: "#0D1B2A",
  colorIconos: "#0D1B2A",
  colorMenuF1: "#FFFFFF",
  colorSeleccion: "#2563EB",
  colorTarjetas: "#FFFFFF",
  colorCobrar: "#2563EB",
  colorFondo: "#F4F7FA",
  colorLetras: "auto",
  tintaEncabezado: "auto",
  tintaIconos: "auto",
  tintaMenu: "auto",
  limiteCaja: 3000,
});

const esColor = valor => typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor);

function luminancia(valor) {
  const color = esColor(valor) ? valor : "#FFFFFF";
  const canales = [1, 3, 5].map(inicio => {
    const canal = parseInt(color.slice(inicio, inicio + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return canales[0] * 0.2126 + canales[1] * 0.7152 + canales[2] * 0.0722;
}

export function textoSobre(fondo, preferencia = "auto") {
  const luz = luminancia(fondo);
  if (esColor(preferencia)) return preferencia;
  return (luz + 0.05) / 0.05 >= 1.05 / (luz + 0.05) ? "#000000" : "#FFFFFF";
}
export function esAmarillo(color) {
  if (!esColor(color)) return false;
  const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  if(d<0.15 || max<0.4)return false;
  let h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  h=(h*60+360)%360;return h>=38 && h<=70;
}
export function usePaginaNegocio(ownerUid) {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    if (!ownerUid) return undefined;
    let activo = true;
    const cancelar = onSnapshot(
      doc(db, "usuarios", ownerUid, "configuracion", "pagina"),
      snapshot => {
        if (!activo) return;
        const datos = snapshot.data() || {};
        const pagina = { ...valoresIniciales };
        for (const campo of Object.keys(valoresIniciales)) {
          if (campo === "limiteCaja") continue;
          if (esColor(datos[campo])) pagina[campo] = datos[campo];
        }
        pagina.colorTarjetas=pagina.colorIconos;
        pagina.colorCobrar=pagina.colorMenuF1;
        const limite = Number(datos.limiteCaja);
        if (typeof limite === "number" && Number.isFinite(limite) && limite > 0) {
          pagina.limiteCaja = limite;
        }
        setEstado({ ownerUid, pagina, listo: true, error: "" });
      },
      error => {
        if (!activo) return;
        console.error("No se pudo sincronizar la configuración de la página:", error);
        setEstado({ ownerUid, pagina: valoresIniciales, listo: false, error: error.message });
      }
    );
    return () => { activo = false; cancelar(); };
  }, [ownerUid]);
  if (!ownerUid || estado?.ownerUid !== ownerUid) {
    return { ...valoresIniciales, listo: false, error: "" };
  }
  return { ...estado.pagina, listo: estado.listo, error: estado.error };
}

