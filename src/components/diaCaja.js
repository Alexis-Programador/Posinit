import { collection, query, where } from "firebase/firestore";
import { useState, useEffect } from "react";

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

export { inicioDiaCaja };
export function useDiaCaja() {
  const [dia,setDia]=useState(()=>inicioDiaCaja());
  useEffect(()=>{
    let timer;
    function actualizar(){
      clearTimeout(timer);
      const ahora=Date.now(), hoy=inicioDiaCaja(ahora);
      setDia(hoy);
      timer=setTimeout(actualizar, Math.max(1,inicioDiaCaja(hoy+36*3600000)-ahora+10));
    }
    actualizar();
    window.addEventListener("focus",actualizar);
    document.addEventListener("visibilitychange",actualizar);
    return ()=>{clearTimeout(timer);window.removeEventListener("focus",actualizar);document.removeEventListener("visibilitychange",actualizar)};
  },[]);
  return dia;
}

export function movimientosDelDia(db,uid,coleccion,inicio){
  const fin=inicioDiaCaja(inicio+36*3600000);
  return query(collection(db,"usuarios",uid,coleccion),where("fechaHora",">=",inicio),where("fechaHora","<",fin));
}
