
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { QRCodeSVG } from "qrcode.react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import {
  db,
} from "../firebase/firebaseConfig";

function HistorialVentas({
  ownerUid,
  usuario,
  onCerrar,
}) {
  const [ventas, setVentas] =
    useState([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    ventaSeleccionada,
    setVentaSeleccionada,
  ] = useState(null);

  const [busqueda, setBusqueda] =
    useState("");

  // Por defecto el historial abre mostrando únicamente las ventas de hoy.
  const fechaLocalInput = (fecha = new Date()) => {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  };

  const [diaSeleccionado, setDiaSeleccionado] =
    useState(() => fechaLocalInput());

  // =========================================================
  // CARGAR VENTAS
  // =========================================================

  useEffect(() => {
    const cargarVentas =
      async () => {
        if (!ownerUid) {
          setError(
            "No se encontró el negocio."
          );

          setCargando(false);
          return;
        }

        try {
          setCargando(true);
          setError("");

          const ventasRef =
            collection(
              db,
              "usuarios",
              ownerUid,
              "ventas"
            );

          const resultado =
            await getDocs(
              ventasRef
            );

          const lista =
            resultado.docs
              .map(
                (documento) => ({
                  documentoId:
                    documento.id,

                  ...documento.data(),
                })
              )
              .sort(
                (a, b) =>
                  Number(
                    b.fechaHora ??
                      0
                  ) -
                  Number(
                    a.fechaHora ??
                      0
                  )
              );

          setVentas(lista);
        } catch (err) {
          console.error(
            "Error cargando historial:",
            err
          );

          setError(
            err?.message ||
              "No se pudo cargar el historial de ventas."
          );
        } finally {
          setCargando(false);
        }
      };

    cargarVentas();
  }, [ownerUid]);

  // =========================================================
  // FORMATO DINERO
  // =========================================================

  const dinero = (
    cantidad
  ) =>
    Number(
      cantidad || 0
    ).toLocaleString(
      "es-MX",
      {
        style: "currency",
        currency: "MXN",
      }
    );

  // =========================================================
  // FECHA
  // =========================================================

  const fecha = (
    valor
  ) => {
    if (!valor) {
      return "Sin fecha";
    }

    return new Date(
      Number(valor)
    ).toLocaleString(
      "es-MX",
      {
        dateStyle:
          "medium",

        timeStyle:
          "short",
      }
    );
  };

  // =========================================================
  // MÉTODO DE PAGO
  // =========================================================

  const metodoPagoTexto = (
    metodo
  ) => {
    if (
      metodo === "efectivo"
    ) {
      return "Efectivo";
    }

    if (
      metodo === "tarjeta"
    ) {
      return "Tarjeta";
    }

    return (
      metodo ||
      "Otro"
    );
  };

  // =========================================================
  // FILTRAR
  // =========================================================

  const ventasFiltradas =
    useMemo(() => {
      const texto =
        busqueda
          .trim()
          .toLowerCase();

      return ventas.filter(
        (venta) => {
          const fechaVenta = new Date(
            Number(
              venta.fechaHora ?? 0
            )
          );

          const perteneceAlDia =
            !Number.isNaN(
              fechaVenta.getTime()
            ) &&
            fechaLocalInput(
              fechaVenta
            ) ===
              diaSeleccionado;

          if (!perteneceAlDia) {
            return false;
          }

          if (!texto) {
            return true;
          }

          const id =
            String(
              venta.id ||
                venta.documentoId ||
                ""
            ).toLowerCase();

          const cajero =
            String(
              venta.nombreUsuario ||
                ""
            ).toLowerCase();

          const numero =
            String(
              venta.numeroUsuario ||
                ""
            ).toLowerCase();

          const metodo =
            String(
              venta.metodoPago ||
                ""
            ).toLowerCase();

          const productos =
            Array.isArray(
              venta.productos
            )
              ? venta.productos
                  .map(
                    (producto) =>
                      producto.nombre ||
                      ""
                  )
                  .join(" ")
                  .toLowerCase()
              : "";

          return (
            id.includes(texto) ||
            cajero.includes(texto) ||
            numero.includes(texto) ||
            metodo.includes(texto) ||
            productos.includes(texto)
          );
        }
      );
    }, [
      ventas,
      busqueda,
      diaSeleccionado,
    ]);

  // =========================================================
  // TOTALES
  // =========================================================

  const totalHistorial =
    ventasFiltradas.reduce(
      (
        total,
        venta
      ) =>
        total +
        Number(
          venta.total ||
            0
        ),

      0
    );

  // =========================================================
  // Copia del comprobante: el token contiene datos de la venta y no es una firma digital.
  const crearEnlaceTicket = (venta) => {
    const datos = {
      folio: String(venta.id || venta.documentoId || ""),
      fechaHora: Number(venta.fechaHora || Date.now()),
      nombreUsuario: String(venta.nombreUsuario || "Usuario"),
      numeroUsuario: String(venta.numeroUsuario || ""),
      metodoPago: String(venta.metodoPago || ""),
      total: Number(venta.total || 0),
      recibido: Number(venta.recibido || 0),
      cambio: Number(venta.cambio || 0),
      productos: (Array.isArray(venta.productos) ? venta.productos : []).map(p => ({
        nombre: String(p.nombre || "Producto"),
        cantidad: Number(p.cantidad || 0),
        precio: Number(p.precio || 0),
        subtotal: Number(p.subtotal || 0),
      })),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(datos));
    let binario = "";
    for (const byte of bytes) binario += String.fromCharCode(byte);
    const token = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("ticket", token);
    url.hash = "";
    return url.toString();
  };

  const imprimirComprobante = (venta) => {
    const enlace = crearEnlaceTicket(venta);
    const ventana = window.open(enlace, "_blank", "noopener,noreferrer");
    if (!ventana) {
      window.alert("Permite las ventanas emergentes para abrir el ticket.");
    }
  };

  const descargarPDF = (venta) => {
    // El navegador permite elegir «Guardar como PDF» sin añadir dependencias.
    // Abrimos el comprobante para que el usuario elija Imprimir > Guardar como PDF.
    imprimirComprobante(venta);
  };

  // CARGANDO
  // =========================================================

  if (cargando) {
    return (
      <div className="historial-fondo">

        <section className="historial-modal">

          <h2>
            Historial de ventas
          </h2>

          <p>
            Cargando ventas...
          </p>

        </section>

      </div>
    );
  }

  // =========================================================
  // DETALLE DE VENTA
  // =========================================================

  if (
    ventaSeleccionada
  ) {
    const venta =
      ventaSeleccionada;

    return (
      <div className="historial-fondo">

        <section className="historial-modal historial-detalle">

          <div className="historial-encabezado">

            <div>

              <button
                type="button"
                className="historial-regresar"
                onClick={() =>
                  setVentaSeleccionada(
                    null
                  )
                }
              >
                ← Regresar
              </button>

              <h2>
                Detalle de venta
              </h2>

            </div>

            <button
              type="button"
              className="historial-cerrar"
              onClick={
                onCerrar
              }
            >
              ×
            </button>

          </div>

          <div className="ticket-datos">

            <div>
              <span>
                Folio
              </span>

              <strong>
                {venta.id ||
                  venta.documentoId}
              </strong>
            </div>

            <div>
              <span>
                Fecha
              </span>

              <strong>
                {fecha(
                  venta.fechaHora
                )}
              </strong>
            </div>

            <div>
              <span>
                Cajero
              </span>

              <strong>
                {venta.nombreUsuario ||
                  "Usuario"}{" "}
                ·{" "}
                {venta.numeroUsuario ||
                  ""}
              </strong>
            </div>

            <div>
              <span>
                Método
              </span>

              <strong>
                {metodoPagoTexto(
                  venta.metodoPago
                )}
              </strong>
            </div>

          </div>

          <div className="ticket-productos">

            <div className="ticket-productos-titulo">

              <span>
                Producto
              </span>

              <span>
                Subtotal
              </span>

            </div>

            {Array.isArray(
              venta.productos
            ) &&
              venta.productos.map(
                (
                  producto,
                  index
                ) => (
                  <div
                    className="ticket-producto"
                    key={`${producto.productoId}-${index}`}
                  >

                    <div>

                      <strong>
                        {producto.nombre ||
                          "Producto"}
                      </strong>

                      <span>
                        {producto.cantidad ||
                          0}{" "}
                        ×{" "}
                        {dinero(
                          producto.precio
                        )}
                      </span>

                    </div>

                    <strong>
                      {dinero(
                        producto.subtotal
                      )}
                    </strong>

                  </div>
                )
              )}

          </div>

          <div className="ticket-resumen">

            <div>

              <span>
                Total
              </span>

              <strong className="ticket-total">
                {dinero(
                  venta.total
                )}
              </strong>

            </div>

            {venta.metodoPago ===
              "efectivo" && (
              <>
                <div>

                  <span>
                    Recibido
                  </span>

                  <strong>
                    {dinero(
                      venta.recibido
                    )}
                  </strong>

                </div>

                <div>

                  <span>
                    Cambio
                  </span>

                  <strong>
                    {dinero(
                      venta.cambio
                    )}
                  </strong>

                </div>
              </>
            )}

          </div>

          <div className="historial-detalle-acciones">

            <button
              type="button"
              className="boton-imprimir-ticket"
              onClick={() => imprimirComprobante(venta)}
            >
              🖨️ Imprimir ticket
            </button>

            <button type="button" onClick={() => descargarPDF(venta)}
              style={{padding:"12px 16px",borderRadius:10,border:"1px solid #cbd5e1",background:"#fff",cursor:"pointer"}}>
              📄 Abrir para guardar como PDF
            </button>

          </div>

          <div style={{marginTop:18,padding:16,border:"1px solid #cbd5e1",borderRadius:14,background:"#f8fafc",display:"grid",justifyItems:"center",gap:10}}>
            <strong>📱 QR del comprobante</strong>
            <QRCodeSVG value={crearEnlaceTicket(venta)} size={192} includeMargin />
            <a href={crearEnlaceTicket(venta)} target="_blank" rel="noopener noreferrer"
              style={{wordBreak:"break-word",textAlign:"center"}}>Abrir ticket en otra pantalla</a>
            <small style={{color:"#64748b",textAlign:"center"}}>
              Este QR contiene una copia del ticket; no constituye una verificación criptográfica de la venta.
              Para descargar PDF, abre el ticket y elige Imprimir → Guardar como PDF.
            </small>
          </div>

        </section>

      </div>
    );
  }

  // =========================================================
  // HISTORIAL
  // =========================================================

  return (
    <div className="historial-fondo">

      <section className="historial-modal">

        <div className="historial-encabezado">

          <div>

            <h2>
              🧾 Historial de ventas
            </h2>

            <p>
              {usuario?.nombre ||
                "Usuario"}{" "}
              · Consulta las ventas
              registradas.
            </p>

          </div>

          <button
            type="button"
            className="historial-cerrar"
            onClick={
              onCerrar
            }
          >
            ×
          </button>

        </div>

        <div
          className="historial-herramientas"
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(220px, 1fr) minmax(180px, 240px)",
            gap: "12px",
            alignItems: "end",
          }}
        >

          <input
            type="search"
            placeholder="Buscar producto, cajero, método o folio..."
            value={
              busqueda
            }
            onChange={(e) =>
              setBusqueda(
                e.target.value
              )
            }
          />

          <label
            style={{
              display: "grid",
              gap: "5px",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Día a consultar

            <input
              type="date"
              value={
                diaSeleccionado
              }
              onChange={(e) => {
                setDiaSeleccionado(
                  e.target.value
                );

                setVentaSeleccionada(
                  null
                );
              }}
              style={{
                minHeight: "46px",
                border:
                  "1px solid #cfd8e3",
                borderRadius: "10px",
                padding: "0 12px",
                font: "inherit",
                background: "#fff",
              }}
            />

          </label>

        </div>

        {error && (
          <div className="ventas-error">
            {error}
          </div>
        )}

        <div className="historial-resumen">

          <div>

            <span>
              Ventas mostradas
            </span>

            <strong>
              {
                ventasFiltradas.length
              }
            </strong>

          </div>

          <div>

            <span>
              Total
            </span>

            <strong>
              {dinero(
                totalHistorial
              )}
            </strong>

          </div>

        </div>

        {ventasFiltradas.length ===
        0 ? (
          <div className="historial-vacio">

            <div>
              🧾
            </div>

            <strong>
              No hay ventas
            </strong>

            <p>
              No hay ventas registradas
              para el día seleccionado.
            </p>

          </div>
        ) : (
          <div className="historial-lista">

            {ventasFiltradas.map(
              (venta) => (
                <button
                  type="button"
                  className="historial-venta"
                  key={
                    venta.documentoId
                  }
                  onClick={() =>
                    setVentaSeleccionada(
                      venta
                    )
                  }
                >

                  <div className="historial-venta-principal">

                    <div>

                      <strong>
                        {fecha(
                          venta.fechaHora
                        )}
                      </strong>

                      <span>
                        {venta.nombreUsuario ||
                          "Usuario"}{" "}
                        ·{" "}
                        {venta.numeroUsuario ||
                          ""}
                      </span>

                    </div>

                    <strong className="historial-venta-total">
                      {dinero(
                        venta.total
                      )}
                    </strong>

                  </div>

                  <div className="historial-venta-secundario">

                    <span>
                      {venta.cantidadProductos ||
                        0}{" "}
                      {Number(
                        venta.cantidadProductos ||
                          0
                      ) === 1
                        ? "artículo"
                        : "artículos"}
                    </span>

                    <span>
                      {metodoPagoTexto(
                        venta.metodoPago
                      )}
                    </span>

                  </div>

                </button>
              )
            )}

          </div>
        )}

      </section>

    </div>
  );
}

export default HistorialVentas;
