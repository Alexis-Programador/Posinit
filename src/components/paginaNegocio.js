import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const base = { colorEncabezado: "#0d1b2a", colorCobrar: "#2563eb", colorFondo:"#f4f7fa", colorTarjetas:"#ffffff", colorLetras:"auto", colorMenuF1:"#ffffff", colorSeleccion:"#2563eb", limiteCaja: 3000, listo: false };
const esColor = valor => typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor);

function luminancia(color) {
  const [r,g,b] = color.slice(1).match(/../g).map(c => parseInt(c,16)/255)
    .map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
export function textoSobre(color, elegido="auto") {
  const fondo=luminancia(color);
  if(esColor(elegido)){
    const tinta=luminancia(elegido);
    if((Math.max(tinta,fondo)+.05)/(Math.min(tinta,fondo)+.05)>=4.5) return elegido;
  }
  return fondo>.17913 ? "#000" : "#fff";
}
export function usePaginaNegocio(ownerUid) {
  const [valor,setValor] = useState(base);
  useEffect(() => {
    if (!ownerUid) return;
    return onSnapshot(doc(db,"usuarios",ownerUid,"configuracion","pagina"), snap => {
      const data=snap.data() || {};
      const limite=Number(data.limiteCaja);
      setValor({ownerUid, listo:true,
        colorEncabezado:esColor(data.colorEncabezado)?data.colorEncabezado:base.colorEncabezado,
        colorCobrar:esColor(data.colorCobrar)?data.colorCobrar:base.colorCobrar,
        colorFondo:esColor(data.colorFondo)?data.colorFondo:base.colorFondo,
        colorTarjetas:esColor(data.colorTarjetas)?data.colorTarjetas:base.colorTarjetas,
        colorMenuF1:esColor(data.colorMenuF1)?data.colorMenuF1:base.colorMenuF1,
        colorSeleccion:esColor(data.colorSeleccion)?data.colorSeleccion:base.colorSeleccion,
        colorLetras:esColor(data.colorLetras)?data.colorLetras:"auto",
        limiteCaja:Number.isFinite(limite)&&limite>0?limite:base.limiteCaja});
    }, error => {setValor({...base,ownerUid,error:error.message});});
  }, [ownerUid]);
  return valor.ownerUid===ownerUid?valor:base;
}
