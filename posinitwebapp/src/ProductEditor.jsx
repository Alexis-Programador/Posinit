import { useEffect, useRef, useState } from 'react';
import { money, saveProduct, deleteProduct, saveCategory, normalizeCatalogValue } from './data';

const CLOUD_NAME = 'jizeim68';
const CLOUD_PRESET = 'pos_init_productos';
const CLOUD_URL = 'https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/image/upload';

async function jpegFromFile(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Selecciona una fotografía válida.');
  if (file.size > 25 * 1024 * 1024) throw new Error('La fotografía es demasiado grande (máximo 25 MB antes de convertir).');
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('No se pudo abrir esta fotografía. Prueba con una imagen JPG o PNG.'); }
  try {
    const side = Math.min(1, 1800 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * side));
    canvas.height = Math.max(1, Math.round(img.height * side));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo preparar la foto.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.83));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('Foto demasiado grande después de comprimirla.');
    return blob;
  } finally { img.close?.(); }
}

async function uploadImage(file) {
  const blob = await jpegFromFile(file);
  const body = new FormData();
  body.append('file', blob, 'producto.jpg');
  body.append('upload_preset', CLOUD_PRESET);
  const response = await fetch(CLOUD_URL, { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'No se pudo subir la fotografía. Comprueba Internet.');
  const url = String(data.secure_url || '');
  if (!url.startsWith('https://res.cloudinary.com/' + CLOUD_NAME + '/')) throw new Error('El servicio no devolvió una URL válida.');
  return url;
}

export default function ProductEditor({ product, uid, products, categories, onClose, onSaved }) {
  const [values, setValues] = useState({
    nombre: product?.nombre || '',
    codigoBarras: product?.codigoBarras || '',
    categoria: product?.categoria || '',
    precioVenta: String(product?.precioVenta ?? ''),
  });
  const [newCategory, setNewCategory] = useState('');
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (key, value) => { setValues(p => ({ ...p, [key]: value })); setError(''); };
  const existingNames = products.filter(p => p.docId !== product?.docId);
  const dupName = existingNames.some(p => normalizeCatalogValue(p.nombre) === normalizeCatalogValue(values.nombre)) && !!values.nombre.trim();
  const dupBarcode = existingNames.some(p => normalizeCatalogValue(p.codigoBarras) === normalizeCatalogValue(values.codigoBarras)) && !!values.codigoBarras.trim();
  const image = preview || (typeof product?.imagenUri === 'string' && product.imagenUri.startsWith('https://') ? product.imagenUri : '');
  const categoriesAvailable = [...new Set([
    ...categories.map(c => c.nombre).filter(Boolean), product?.categoria,
  ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const createCategory = async () => {
    if (!newCategory.trim() || categoryCreating) return;
    setCategoryCreating(true); setError('');
    try {
      await saveCategory(uid, newCategory);
      change('categoria', newCategory.trim());
      setNewCategory('');
    } catch (err) { setError(err.message || 'No se pudo crear la categoría.'); }
    finally { setCategoryCreating(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (dupName) return setError('Ya existe un producto con ese nombre.');
    if (dupBarcode) return setError('Ese código de barras ya pertenece a otro producto.');
    if (!values.categoria) return setError('Selecciona una categoría registrada.');
    setBusy(true); setError('');
    try {
      const imagenUri = file ? await uploadImage(file) : (product?.imagenUri || '');
      await saveProduct(uid, { ...values, imagenUri }, product);
      onSaved?.('✅ Producto guardado y sincronizado con tus dispositivos.');
      onClose();
    } catch (err) { setError(err.message || 'No se pudo guardar el producto.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy || !product) return;
    if (!window.confirm('¿Eliminar "'+product.nombre+'"? Esta acción quitará el producto del catálogo de todos los dispositivos. Las ventas anteriores se conservan.')) return;
    setBusy(true); setError('');
    try { await deleteProduct(uid, product); onSaved?.('✅ Producto eliminado del catálogo.'); onClose(); }
    catch (err) { setError(err.message || 'No se pudo eliminar el producto.'); }
    finally { setBusy(false); }
  };
  return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={product ? 'Editar producto' : 'Nuevo producto'} className="modal product-editor">
      <div className="panel-header"><div><h2>{product ? '✏️ Editar producto' : '📦 Nuevo producto'}</h2><p>Los cambios se sincronizan con Android e iOS.</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Cerrar">✕</button></div>
      <form onSubmit={submit} className="edit-form">
        <div className="product-editor-layout">
          <div className="photo-column">
            <div className="photo-preview">{image ? <img src={image} alt="Vista previa del producto" /> : <div className="photo-placeholder"><span>📷</span><strong>Foto del producto</strong><small>JPG, PNG o imagen del celular</small></div>}</div>
            <div className="photo-actions">
              <button type="button" className="btn outline" disabled={busy} onClick={()=>galleryRef.current?.click()}>🖼️ Agregar imagen</button>
              <button type="button" className="btn outline" disabled={busy} onClick={()=>cameraRef.current?.click()}>📷 Tomar foto</button>
            </div>
            <input ref={galleryRef} type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} className="visually-hidden"/>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e=>setFile(e.target.files?.[0]||null)} className="visually-hidden"/>
            <small className="muted">{file ? 'Foto seleccionada; se cargará al guardar.' : product?.imagenUri ? 'Foto actual del producto.' : 'Selecciona una fotografía o abre la cámara.'}</small>
          </div>
          <div className="form-column">
            <label className="field"><span>Nombre del producto</span><input required maxLength={120} value={values.nombre} onChange={e=>change('nombre',e.target.value)} aria-invalid={dupName}/></label>
            {dupName&&<p role="alert" className="inline-field-error">Ya existe un producto con ese nombre.</p>}
            <label className="field"><span>Código de barras</span><input required maxLength={90} value={values.codigoBarras} onChange={e=>change('codigoBarras',e.target.value)} aria-invalid={dupBarcode}/></label>
            {dupBarcode&&<p role="alert" className="inline-field-error">Ese código ya está registrado.</p>}
            <label className="field"><span>Categoría</span><select value={values.categoria} required onChange={e=>change('categoria',e.target.value)}><option value="">Seleccionar categoría</option>{categoriesAvailable.map(c=><option value={c} key={c}>{c}</option>)}</select></label>
            <div className="inline-category">
              <input value={newCategory} maxLength={80} onChange={e=>setNewCategory(e.target.value)} placeholder="Nueva categoría" aria-label="Nueva categoría"/>
              <button type="button" className="btn outline" disabled={categoryCreating||busy||!newCategory.trim()} onClick={createCategory}>{categoryCreating?'Creando…':'+ Crear'}</button>
            </div>
            <label className="field"><span>Precio de venta (MXN)</span><input required type="number" min="0" step="0.01" value={values.precioVenta} onChange={e=>change('precioVenta',e.target.value)}/></label>
            {values.precioVenta!==''&&<p className="muted">Precio: {money(values.precioVenta)}</p>}
          </div>
        </div>
        {error&&<div role="alert" className="message error">{error}</div>}
        <div className="form-actions product-editor-actions">
          {product&&<button type="button" className="btn danger-button" disabled={busy} onClick={remove}>🗑️ Eliminar producto</button>}
          <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="btn primary" type="submit" disabled={busy||dupName||dupBarcode}>{busy?'Guardando…':'Guardar producto'}</button>
        </div>
      </form>
    </section>
  </div>;
}
