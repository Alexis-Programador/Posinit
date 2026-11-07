import {useEffect,useState} from "react";
import {collection,onSnapshot} from "firebase/firestore";
import {db} from "../firebase/firebaseConfig";
export function useOfertas(uid) {
  const [estado,setEstado]=useState(null);
  useEffect(()=>{
    if(!uid)return;
    return onSnapshot(collection(db,"usuarios",uid,"ofertas"),snap=>setEstado({uid,listo:true,error:"",mapa:Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]))}),()=>setEstado({uid,listo:true,error:"No se pudieron consultar las promociones. Revisa la conexión y las reglas de Firebase.",mapa:{}}));
  },[uid]);
  return estado?.uid===uid ? estado : {listo:false,error:"",mapa:{}};
}
