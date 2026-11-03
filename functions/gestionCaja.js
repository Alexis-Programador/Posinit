const { inicioDiaCaja } = require("./diaCaja");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const db = admin.firestore();
const norm = s => String(s ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("es-MX");
const cents = n => Math.round((Number(n) || 0) * 100);

exports.posGuardarProductoUnico = onCall(async ({auth, data}) => {
  if (!auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
  const p = data.producto || {};
  const nombre = String(p.nombre || "").trim();
  const codigo = String(p.codigoBarras || "").normalize("NFKC").trim();
  if (!Number.isSafeInteger(p.id) || !nombre || !codigo || !Number.isFinite(p.precioVenta) || p.precioVenta < 0 || !String(p.categoria || "").trim()) {
    throw new HttpsError("invalid-argument", "Revisa los datos del producto.");
  }
  const owner = db.collection("usuarios").doc(auth.uid);
  const catalog = owner.collection("productos");
  const ref = catalog.doc(String(p.id));
  const lock = owner.collection("_control").doc("catalogo");
  await db.runTransaction(async tx => {
    await tx.get(lock);
    const list = await tx.get(catalog.select("nombre", "codigoBarras"));
    const exists = list.docs.some(doc => doc.id === ref.id);
    if (exists && data.migracion === true) return;
    if (exists && !data.editar) throw new HttpsError("already-exists","El identificador ya existe. Vuelve a guardar.");
    if (!exists && data.editar) throw new HttpsError("not-found","El producto ya fue eliminado.");
    for (const doc of list.docs) {
      if (doc.id === ref.id) continue;
      if (norm(doc.get("codigoBarras")) === norm(codigo)) throw new HttpsError("already-exists","Ese código ya pertenece a otro producto.");
      if (norm(doc.get("nombre")) === norm(nombre)) throw new HttpsError("already-exists","Ya existe un producto con ese nombre.");
    }
    const stock = owner.collection("inventario").doc(ref.id);
    const inventory = await tx.get(stock);
    const now = Date.now();
    tx.set(ref,{id:p.id,nombre,codigoBarras:codigo,categoria:String(p.categoria).trim(),precioVenta:p.precioVenta,
      imagenUri:typeof p.imagenUri === "string" ? p.imagenUri : null, propietarioUid:auth.uid,fechaActualizacion:now},{merge:true});
    if (!inventory.exists) tx.create(stock,{productoId:p.id,stockActual:0,stockMinimo:0,propietarioUid:auth.uid,fechaActualizacion:now});
    tx.set(lock,{fechaActualizacion:now});
  });
  return {ok:true};
});

function sameCashier(row, sale) {
  if (row.usuarioId != null && sale.usuarioId != null) return String(row.usuarioId) === String(sale.usuarioId);
  return Boolean(sale.numeroUsuario) && String(row.numeroUsuario) === String(sale.numeroUsuario);
}
function cashOf(sale) {
  if (String(sale.metodoPago).toLowerCase() === "efectivo") return cents(sale.total);
  if (sale.metodoPago !== "mixto" || !Array.isArray(sale.pagos)) return 0;
  return (sale.pagos || []).filter(p => p.tipo === "efectivo").reduce((v,p)=>v+cents(p.importe),0);
}
exports.posAvisarVentaMovil = onDocumentCreated({document:"usuarios/{uid}/ventas/{ventaId}",retry:true}, async event => {
  const {uid,ventaId} = event.params;
  const owner = db.collection("usuarios").doc(uid);
  const sale = event.data.data();
  const devices = await owner.collection("dispositivosMoviles").get();
  if (devices.empty) return;
  const alert = owner.collection("avisosMoviles").doc(ventaId);
  if (!(await alert.get()).exists) {
    const t = Number(sale.fechaHora);
    if (!Number.isFinite(t)) return;
    const dia = inicioDiaCaja(t);
    const [cuts,config] = await Promise.all([owner.collection("cortesCaja").where("fechaHora",">=",dia).where("fechaHora","<=",t).get(),
      owner.collection("configuracion").doc("pagina").get()]);
    const start = cuts.docs.reduce((v,d)=>sameCashier(d.data(),sale)?Math.max(v,d.get("fechaHora")):v,dia-1);
    const during = name=>owner.collection(name).where("fechaHora",">",start).where("fechaHora","<=",t).get();
    const [sales, withdrawals] = await Promise.all([during("ventas"),during("retirosCaja")]);
    const after = sales.docs.filter(d=>sameCashier(d.data(),sale) && (d.get("fechaHora")<t || d.id<=ventaId))
      .reduce((v,d)=>v+cashOf(d.data()),0) - withdrawals.docs.filter(d=>sameCashier(d.data(),sale)).reduce((v,d)=>v+cents(d.get("monto")),0);
    const limit = cents(config.get("limiteCaja") || 3000);
    const before = after-cashOf(sale);
    const info={nombre:String(sale.nombreUsuario||"Cajero"),numero:String(sale.numeroUsuario||""),total:Number(sale.total)||0,
      saldo:after/100,limite:limit/100,superado:after>limit && before<=limit,fechaHora:t};
    await db.runTransaction(async tx=>{if(!(await tx.get(alert)).exists)tx.create(alert,info);});
  }
  for(let i=0;i<devices.size;i+=500){
    const batch=devices.docs.slice(i,i+500).filter(d=>typeof d.get("token")==="string" && d.get("token"));
    if(!batch.length)continue;
    const response=await admin.messaging().sendEachForMulticast({
      tokens:batch.map(d=>d.get("token")),data:{ownerUid:uid,ventaId},android:{priority:"high",ttl:24*60*60*1000}
    });
    let retry=false;
    await Promise.all(response.responses.map(async(r,j)=>{
      if(r.success)return;
      if(["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(r.error?.code)){
        await batch[j].ref.delete();return;
      }
      retry=true;
    }));
    if(retry)throw new Error("Entrega temporalmente pendiente.");
  }
});
