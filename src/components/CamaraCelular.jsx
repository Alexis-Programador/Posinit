import { useEffect, useRef, useState } from "react";

import { BrowserMultiFormatReader } from "@zxing/browser";

import {
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { createWorker } from "tesseract.js";

import { db } from "../firebase/firebaseConfig";

// =====================================================
// POS INIT - ESCÁNER INTELIGENTE
//
// 1. Lee códigos de barras.
// 2. Reconoce números impresos con OCR.
// 3. Utiliza el primer código válido.
// 4. Envía el resultado por WebRTC.
// 5. Inicia con zoom 2x cuando está disponible.
// =====================================================

const SERVIDORES = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "stun:stun1.l.google.com:19302",
    },
  ],
};

const FORMATOS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

const FORMATOS_NATIVOS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

// Tiempo mínimo entre envíos del mismo código.
const TIEMPO_ANTIDUPLICADO = 2500;

// Intervalo entre intentos de OCR.
const INTERVALO_OCR = 1400;

// =====================================================
// LIMPIAR CÓDIGOS
// =====================================================

function limpiarCodigo(valor) {
  return String(valor ?? "")
    .replace(/\s+/g, "")
    .trim();
}

// =====================================================
// VALIDAR DÍGITO DE CONTROL EAN / UPC
// =====================================================

function validarChecksum(codigo) {
  if (!/^\d+$/.test(codigo)) {
    return false;
  }

  const numeros = codigo.split("").map(Number);

  const digitoReal = numeros.pop();

  let suma = 0;

  for (
    let i = numeros.length - 1, posicion = 0;
    i >= 0;
    i--, posicion++
  ) {
    suma +=
      numeros[i] *
      (posicion % 2 === 0 ? 3 : 1);
  }

  const digitoEsperado =
    (10 - (suma % 10)) % 10;

  return digitoReal === digitoEsperado;
}

// =====================================================
// VALIDACIÓN PARA OCR
//
// El OCR solo acepta números con una estructura
// comprobable mediante dígito de control.
// =====================================================

function codigoNumericoValido(codigo) {
  if (!/^\d+$/.test(codigo)) {
    return false;
  }

  if (![8, 12, 13].includes(codigo.length)) {
    return false;
  }

  return validarChecksum(codigo);
}

// =====================================================
// VALIDACIÓN DEL ESCÁNER DE BARRAS
// =====================================================

function codigoBarrasValido(codigo, formato) {
  if (!codigo || codigo.length > 128) {
    return false;
  }

  const formatoTexto = String(formato ?? "")
    .toLowerCase();

  const esEAN13 =
    formato === BarcodeFormat.EAN_13 ||
    formatoTexto === "ean_13";

  const esEAN8 =
    formato === BarcodeFormat.EAN_8 ||
    formatoTexto === "ean_8";

  const esUPCA =
    formato === BarcodeFormat.UPC_A ||
    formatoTexto === "upc_a";

  if (esEAN13) {
    return (
      /^\d{13}$/.test(codigo) &&
      validarChecksum(codigo)
    );
  }

  if (esEAN8) {
    return (
      /^\d{8}$/.test(codigo) &&
      validarChecksum(codigo)
    );
  }

  if (esUPCA) {
    return (
      /^\d{12}$/.test(codigo) &&
      validarChecksum(codigo)
    );
  }

  return codigo.length >= 4;
}

// =====================================================
// EXTRAER NÚMEROS DEL TEXTO OCR
// =====================================================

function extraerCodigosOCR(texto) {
  const contenido = String(texto ?? "");

  const encontrados = new Set();

  // Caso 1: números completos sin espacios.
  const directos = contenido.match(/\d{8,13}/g) || [];

  for (const codigo of directos) {
    if (codigoNumericoValido(codigo)) {
      encontrados.add(codigo);
    }
  }

  // Caso 2: números separados por espacios,
  // como "7 702111 828827".
  const lineas = contenido.split(/\r?\n/);

  for (const linea of lineas) {
    const fragmentos = linea.match(/\d+/g) || [];

    // No unir números que estén en líneas distintas.
    const unido = fragmentos.join("");

    if (codigoNumericoValido(unido)) {
      encontrados.add(unido);
    }
  }

  return [...encontrados];
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function CamaraCelular() {
  const videoRef = useRef(null);

  const canvasOCRRef = useRef(null);

  const streamRef = useRef(null);

  const conexionRef = useRef(null);

  const canalRef = useRef(null);

  const controlesRef = useRef(null);

  const detectorRef = useRef(null);

  const workerOCRRef = useRef(null);

  const temporizadorBarrasRef = useRef(null);

  const temporizadorOCRRef = useRef(null);

  const iniciandoRef = useRef(false);

  const montadoRef = useRef(true);

  const sesionActivaRef = useRef(0);

  const ultimoEnviadoRef = useRef({
    codigo: "",
    fecha: 0,
  });

  const candidatoOCRRef = useRef({
    codigo: "",
    repeticiones: 0,
  });

  const ocupadoOCRRef = useRef(false);

  // ===================================================
  // ESTADOS
  // ===================================================

  const [estado, setEstado] = useState(
    "Cámara lista"
  );

  const [conectado, setConectado] = useState(false);

  const [iniciando, setIniciando] = useState(false);

  const [zoom, setZoom] = useState(1);

  const [zoomMin, setZoomMin] = useState(1);

  const [zoomMax, setZoomMax] = useState(1);

  const [zoomDisponible, setZoomDisponible] =
    useState(false);

  const [ultimoCodigo, setUltimoCodigo] =
    useState("");

  const [metodoLectura, setMetodoLectura] =
    useState("");

  const [confirmacion, setConfirmacion] =
    useState(false);

  const [ocrDisponible, setOcrDisponible] =
    useState(false);

  // ===================================================
  // PARÁMETROS DEL ENLACE
  // ===================================================

  const parametros = new URLSearchParams(
    window.location.search
  );

  const sesionId = parametros.get(
    "camaraCelular"
  );

  const ownerUid = parametros.get("owner");

  // ===================================================
  // OBTENER PISTA DE VIDEO
  // ===================================================

  function obtenerPista() {
    return (
      streamRef.current
        ?.getVideoTracks?.()[0] || null
    );
  }

  // ===================================================
  // LIMPIAR TEMPORIZADORES
  // ===================================================

  function limpiarTemporizadores() {
    if (temporizadorBarrasRef.current) {
      clearTimeout(
        temporizadorBarrasRef.current
      );

      temporizadorBarrasRef.current = null;
    }

    if (temporizadorOCRRef.current) {
      clearTimeout(
        temporizadorOCRRef.current
      );

      temporizadorOCRRef.current = null;
    }
  }

  // ===================================================
  // DETENER LECTORES
  // ===================================================

  function detenerLectores() {
    limpiarTemporizadores();

    detectorRef.current = null;

    try {
      controlesRef.current?.stop();
    } catch {
      // El lector ya puede estar detenido.
    }

    controlesRef.current = null;

    const worker = workerOCRRef.current;

    workerOCRRef.current = null;

    if (worker) {
      Promise.resolve(
        worker.terminate()
      ).catch(() => {});
    }

    ocupadoOCRRef.current = false;

    candidatoOCRRef.current = {
      codigo: "",
      repeticiones: 0,
    };
  }

  // ===================================================
  // LIMPIAR CONEXIÓN
  // ===================================================

  function limpiarConexion() {
    sesionActivaRef.current += 1;

    detenerLectores();

    try {
      canalRef.current?.close();
    } catch {
      // Canal cerrado.
    }

    canalRef.current = null;

    try {
      conexionRef.current?.close();
    } catch {
      // Conexión cerrada.
    }

    conexionRef.current = null;

    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // ===================================================
  // DETENER CÁMARA
  // ===================================================

  function detener() {
    limpiarConexion();

    setConectado(false);
    setIniciando(false);
    setOcrDisponible(false);

    setZoom(1);
    setZoomDisponible(false);

    setConfirmacion(false);
    setUltimoCodigo("");
    setMetodoLectura("");

    setEstado("Cámara detenida");
  }

  // ===================================================
  // LIMPIEZA AL SALIR
  // ===================================================

  useEffect(() => {
    montadoRef.current = true;

    return () => {
      montadoRef.current = false;

      limpiarConexion();
    };
  }, []);

  // ===================================================
  // CONFIRMACIÓN DE LECTURA
  // ===================================================

  function confirmarLectura(codigo, metodo) {
    if (!montadoRef.current) {
      return;
    }

    setUltimoCodigo(codigo);

    setMetodoLectura(metodo);

    setConfirmacion(true);

    navigator.vibrate?.(80);

    window.setTimeout(() => {
      if (montadoRef.current) {
        setConfirmacion(false);
      }
    }, 900);
  }

  // ===================================================
  // ENVIAR CÓDIGO A POS INIT
  // ===================================================

  function enviarCodigo(codigoOriginal, metodo) {
    const codigo = limpiarCodigo(
      codigoOriginal
    );

    if (!codigo) {
      return false;
    }

    const canal = canalRef.current;

    if (
      !canal ||
      canal.readyState !== "open"
    ) {
      return false;
    }

    const ahora = Date.now();

    const ultimo = ultimoEnviadoRef.current;

    if (
      ultimo.codigo === codigo &&
      ahora - ultimo.fecha <
        TIEMPO_ANTIDUPLICADO
    ) {
      return false;
    }

    try {
      canal.send(
        JSON.stringify({
          tipo: "codigo",
          codigo,
          metodo,
        })
      );

      ultimoEnviadoRef.current = {
        codigo,
        fecha: ahora,
      };

      confirmarLectura(codigo, metodo);

      return true;
    } catch (error) {
      console.warn(
        "POS Init - Error enviando código:",
        error
      );

      return false;
    }
  }

  // ===================================================
  // ZOOM
  // ===================================================

  async function aplicarZoom(valor) {
    const pista = obtenerPista();

    if (!pista) {
      return false;
    }

    const capacidades =
      pista.getCapabilities?.() || {};

    if (!capacidades.zoom) {
      return false;
    }

    const minimo =
      capacidades.zoom.min ?? 1;

    const maximo =
      capacidades.zoom.max ?? 1;

    const nuevoZoom = Math.max(
      minimo,
      Math.min(
        maximo,
        Number(valor)
      )
    );

    try {
      await pista.applyConstraints({
        advanced: [
          {
            zoom: nuevoZoom,
          },
        ],
      });

      if (montadoRef.current) {
        setZoom(nuevoZoom);
      }

      return true;
    } catch {
      return false;
    }
  }

  // ===================================================
  // AJUSTES AUTOMÁTICOS DE CÁMARA
  // ===================================================

  async function configurarCamara() {
    const pista = obtenerPista();

    if (!pista) {
      return;
    }

    const capacidades =
      pista.getCapabilities?.() || {};

    const ajustes = [];

    // Enfoque continuo.
    if (
      capacidades.focusMode?.includes(
        "continuous"
      )
    ) {
      ajustes.push({
        focusMode: "continuous",
      });
    }

    // Exposición automática.
    if (
      capacidades.exposureMode?.includes(
        "continuous"
      )
    ) {
      ajustes.push({
        exposureMode: "continuous",
      });
    }

    // Balance de blancos automático.
    if (
      capacidades.whiteBalanceMode?.includes(
        "continuous"
      )
    ) {
      ajustes.push({
        whiteBalanceMode: "continuous",
      });
    }

    // Aplicar ajustes individualmente.
    for (const ajuste of ajustes) {
      try {
        await pista.applyConstraints({
          advanced: [ajuste],
        });
      } catch {
        // Continuar si no es compatible.
      }
    }

    // Zoom inicial 2x.
    if (capacidades.zoom) {
      const minimo =
        capacidades.zoom.min ?? 1;

      const maximo =
        capacidades.zoom.max ?? 1;

      setZoomMin(minimo);
      setZoomMax(maximo);

      setZoomDisponible(true);

      const inicial = Math.max(
        minimo,
        Math.min(maximo, 2)
      );

      await aplicarZoom(inicial);
    } else {
      setZoomDisponible(false);
      setZoom(1);
    }
  }

  // ===================================================
  // ESCÁNER NATIVO DE BARRAS
  // ===================================================

  async function iniciarDetectorNativo(
    video,
    pc,
    sesion
  ) {
    if (!("BarcodeDetector" in window)) {
      return false;
    }

    try {
      const disponibles =
        await window.BarcodeDetector
          .getSupportedFormats();

      const formatos =
        FORMATOS_NATIVOS.filter(
          (formato) =>
            disponibles.includes(formato)
        );

      if (!formatos.length) {
        return false;
      }

      const detector =
        new window.BarcodeDetector({
          formats: formatos,
        });

      detectorRef.current = detector;

      async function detectar() {
        if (
          sesion !== sesionActivaRef.current ||
          conexionRef.current !== pc ||
          detectorRef.current !== detector
        ) {
          return;
        }

        try {
          if (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            const resultados =
              await detector.detect(video);

            for (const resultado of resultados) {
              const codigo = limpiarCodigo(
                resultado.rawValue
              );

              if (
                codigoBarrasValido(
                  codigo,
                  resultado.format
                )
              ) {
                if (
                  enviarCodigo(
                    codigo,
                    "barras"
                  )
                ) {
                  break;
                }
              }
            }
          }
        } catch {
          // No mostrar intentos fallidos.
        }

        if (
          sesion === sesionActivaRef.current &&
          conexionRef.current === pc &&
          detectorRef.current === detector
        ) {
          temporizadorBarrasRef.current =
            window.setTimeout(
              detectar,
              170
            );
        }
      }

      detectar();

      return true;
    } catch {
      return false;
    }
  }

  // ===================================================
  // ESCÁNER ZXING
  // ===================================================

  async function iniciarZXing(
    video,
    pc,
    sesion
  ) {
    const hints = new Map();

    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      FORMATOS
    );

    hints.set(
      DecodeHintType.TRY_HARDER,
      true
    );

    const lector =
      new BrowserMultiFormatReader(
        hints,
        {
          delayBetweenScanAttempts: 160,
          delayBetweenScanSuccess: 650,
        }
      );

    const controles =
      await lector.decodeFromVideoElement(
        video,
        (resultado) => {
          if (
            !resultado ||
            conexionRef.current !== pc ||
            sesion !== sesionActivaRef.current
          ) {
            return;
          }

          const codigo = limpiarCodigo(
            resultado.getText()
          );

          const formato =
            resultado.getBarcodeFormat();

          if (
            codigoBarrasValido(
              codigo,
              formato
            )
          ) {
            enviarCodigo(
              codigo,
              "barras"
            );
          }
        }
      );

    if (
      sesion === sesionActivaRef.current &&
      conexionRef.current === pc
    ) {
      controlesRef.current = controles;
    } else {
      controles.stop();
    }
  }

  // ===================================================
  // INICIAR LECTOR DE BARRAS
  // ===================================================

  async function iniciarLectorBarras(
    video,
    pc,
    sesion
  ) {
    const nativo =
      await iniciarDetectorNativo(
        video,
        pc,
        sesion
      );

    if (!nativo) {
      await iniciarZXing(
        video,
        pc,
        sesion
      );
    }
  }

  // ===================================================
  // PREPARAR IMAGEN PARA OCR
  //
  // Se toma la parte central de la cámara,
  // donde normalmente están las barras y números.
  // ===================================================

  function capturarImagenOCR(video) {
    const canvas = canvasOCRRef.current;

    if (
      !canvas ||
      !video ||
      video.readyState < 2
    ) {
      return null;
    }

    const ancho = video.videoWidth;
    const alto = video.videoHeight;

    if (!ancho || !alto) {
      return null;
    }

    const contexto =
      canvas.getContext("2d", {
        willReadFrequently: true,
      });

    if (!contexto) {
      return null;
    }

    // Región central ampliada para OCR.
    const origenX = Math.floor(
      ancho * 0.06
    );

    const origenY = Math.floor(
      alto * 0.20
    );

    const recorteAncho = Math.floor(
      ancho * 0.88
    );

    const recorteAlto = Math.floor(
      alto * 0.60
    );

    const escala = Math.min(
      2,
      1600 / recorteAncho
    );

    canvas.width = Math.round(
      recorteAncho * escala
    );

    canvas.height = Math.round(
      recorteAlto * escala
    );

    contexto.drawImage(
      video,
      origenX,
      origenY,
      recorteAncho,
      recorteAlto,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Mejorar contraste de la imagen.
    const imagen = contexto.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const datos = imagen.data;

    for (
      let i = 0;
      i < datos.length;
      i += 4
    ) {
      const gris =
        datos[i] * 0.299 +
        datos[i + 1] * 0.587 +
        datos[i + 2] * 0.114;

      // Contraste moderado.
      const ajustado = Math.max(
        0,
        Math.min(
          255,
          (gris - 128) * 1.35 + 128
        )
      );

      datos[i] = ajustado;
      datos[i + 1] = ajustado;
      datos[i + 2] = ajustado;
    }

    contexto.putImageData(
      imagen,
      0,
      0
    );

    return canvas;
  }

  // ===================================================
  // RECONOCIMIENTO DE NÚMEROS CON OCR
  // ===================================================

  async function iniciarOCR(
    video,
    pc,
    sesion
  ) {
    try {
      const worker =
        await createWorker("eng");

      if (
        sesion !== sesionActivaRef.current ||
        conexionRef.current !== pc
      ) {
        await worker.terminate();
        return;
      }

      workerOCRRef.current = worker;

      await worker.setParameters({
        tessedit_char_whitelist:
          "0123456789",

        preserve_interword_spaces: "1",

        tessedit_pageseg_mode: "6",
      });

      if (
        sesion !== sesionActivaRef.current ||
        conexionRef.current !== pc
      ) {
        return;
      }

      setOcrDisponible(true);

      async function reconocerNumeros() {
        if (
          sesion !== sesionActivaRef.current ||
          conexionRef.current !== pc ||
          workerOCRRef.current !== worker
        ) {
          return;
        }

        if (ocupadoOCRRef.current) {
          return;
        }

        ocupadoOCRRef.current = true;

        try {
          const imagen =
            capturarImagenOCR(video);

          if (imagen) {
            const resultado =
              await worker.recognize(
                imagen
              );

            if (
              sesion !== sesionActivaRef.current ||
              conexionRef.current !== pc
            ) {
              return;
            }

            const texto =
              resultado?.data?.text || "";

            const candidatos =
              extraerCodigosOCR(texto);

            // Solo procesar si hay un único
            // código numérico válido en la imagen.
            if (candidatos.length === 1) {
              const codigo = candidatos[0];

              const anterior =
                candidatoOCRRef.current;

              if (
                anterior.codigo === codigo
              ) {
                candidatoOCRRef.current = {
                  codigo,
                  repeticiones:
                    anterior.repeticiones + 1,
                };
              } else {
                candidatoOCRRef.current = {
                  codigo,
                  repeticiones: 1,
                };
              }

              // Exigir dos lecturas consecutivas
              // del mismo número.
              if (
                candidatoOCRRef.current
                  .repeticiones >= 2
              ) {
                enviarCodigo(
                  codigo,
                  "numeros"
                );
              }
            } else {
              candidatoOCRRef.current = {
                codigo: "",
                repeticiones: 0,
              };
            }
          }
        } catch (error) {
          // El OCR puede fallar en algunos
          // fotogramas. No interrumpir la cámara.
          console.debug(
            "POS Init - OCR:",
            error
          );
        } finally {
          ocupadoOCRRef.current = false;

          if (
            sesion === sesionActivaRef.current &&
            conexionRef.current === pc &&
            workerOCRRef.current === worker
          ) {
            temporizadorOCRRef.current =
              window.setTimeout(
                reconocerNumeros,
                INTERVALO_OCR
              );
          }
        }
      }

      reconocerNumeros();
    } catch (error) {
      console.warn(
        "POS Init - OCR no disponible:",
        error
      );

      setOcrDisponible(false);

      // El lector de barras sigue funcionando.
    }
  }

  // ===================================================
  // ESPERAR RECOLECCIÓN ICE
  // ===================================================

  async function esperarICE(pc) {
    if (
      pc.iceGatheringState === "complete"
    ) {
      return;
    }

    await new Promise((resolver) => {
      const timeout = setTimeout(
        finalizar,
        8000
      );

      function finalizar() {
        clearTimeout(timeout);

        pc.removeEventListener(
          "icegatheringstatechange",
          verificar
        );

        resolver();
      }

      function verificar() {
        if (
          pc.iceGatheringState === "complete"
        ) {
          finalizar();
        }
      }

      pc.addEventListener(
        "icegatheringstatechange",
        verificar
      );
    });
  }

  // ===================================================
  // INICIAR CÁMARA
  // ===================================================

  async function iniciar() {
    if (
      iniciandoRef.current ||
      conectado
    ) {
      return;
    }

    if (!ownerUid || !sesionId) {
      setEstado(
        "Enlace de conexión inválido"
      );

      return;
    }

    if (
      !navigator.mediaDevices
        ?.getUserMedia ||
      !window.RTCPeerConnection
    ) {
      setEstado(
        "Este navegador no admite cámara o WebRTC"
      );

      return;
    }

    iniciandoRef.current = true;

    setIniciando(true);

    try {
      limpiarConexion();

      const sesion =
        sesionActivaRef.current;

      setEstado(
        "Preparando cámara..."
      );

      setUltimoCodigo("");
      setMetodoLectura("");
      setConfirmacion(false);
      setOcrDisponible(false);

      // ===============================================
      // CONSULTAR SESIÓN FIRESTORE
      // ===============================================

      const referencia = doc(
        db,
        "usuarios",
        ownerUid,
        "sesionesCamara",
        sesionId
      );

      const snapshot =
        await getDoc(referencia);

      if (!snapshot.exists()) {
        throw new Error(
          "La sesión no existe"
        );
      }

      const datos = snapshot.data();

      if (
        !datos.oferta ||
        Date.now() >
          Number(datos.venceEn || 0)
      ) {
        throw new Error(
          "La sesión expiró. Genera otro QR"
        );
      }

      // ===============================================
      // ABRIR CÁMARA TRASERA
      // ===============================================

      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: false,

            video: {
              facingMode: {
                ideal: "environment",
              },

              width: {
                ideal: 1920,
              },

              height: {
                ideal: 1080,
              },

              frameRate: {
                ideal: 30,
              },
            },
          });

      if (
        sesion !== sesionActivaRef.current
      ) {
        stream.getTracks().forEach(
          (track) => track.stop()
        );

        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;

      video.srcObject = stream;

      await video.play();

      // ===============================================
      // ZOOM 2X Y AJUSTES AUTOMÁTICOS
      // ===============================================

      await configurarCamara();

      // ===============================================
      // WEBRTC
      // ===============================================

      const pc =
        new RTCPeerConnection(
          SERVIDORES
        );

      conexionRef.current = pc;

      stream.getTracks().forEach(
        (track) => {
          pc.addTrack(track, stream);
        }
      );

      pc.ondatachannel = (evento) => {
        if (
          evento.channel.label ===
          "pos-init-codigos"
        ) {
          canalRef.current =
            evento.channel;
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          conexionRef.current !== pc
        ) {
          return;
        }

        if (
          pc.connectionState ===
          "connected"
        ) {
          setConectado(true);

          setEstado(
            "Escáner listo"
          );
        }

        if (
          pc.connectionState ===
            "failed" ||
          pc.connectionState ===
            "disconnected"
        ) {
          setConectado(false);

          setEstado(
            "Conexión interrumpida"
          );
        }
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription(
          datos.oferta
        )
      );

      const respuesta =
        await pc.createAnswer();

      await pc.setLocalDescription(
        respuesta
      );

      await esperarICE(pc);

      if (
        sesion !== sesionActivaRef.current
      ) {
        return;
      }

      await updateDoc(
        referencia,
        {
          respuesta: {
            type:
              pc.localDescription.type,

            sdp:
              pc.localDescription.sdp,
          },

          estado: "conectando",
        }
      );

      // ===============================================
      // INICIAR AMBOS MÉTODOS
      //
      // Barras y OCR trabajan sobre
      // el mismo video.
      // ===============================================

      const tareas = [
        iniciarLectorBarras(
          video,
          pc,
          sesion
        ),

        iniciarOCR(
          video,
          pc,
          sesion
        ),
      ];

      const resultados =
        await Promise.allSettled(
          tareas
        );

      if (
        resultados[0].status ===
        "rejected"
      ) {
        console.warn(
          "POS Init - Lector de barras:",
          resultados[0].reason
        );
      }

      if (
        sesion === sesionActivaRef.current
      ) {
        setEstado(
          "Esperando conexión..."
        );
      }
    } catch (error) {
      limpiarConexion();

      setConectado(false);

      setEstado(
        `Error: ${error.message}`
      );
    } finally {
      iniciandoRef.current = false;

      setIniciando(false);
    }
  }

  // ===================================================
  // ESTILOS
  // ===================================================

  const boton = {
    minHeight: 60,

    padding: "14px 12px",

    borderRadius: 16,

    border: "1px solid #475569",

    color: "#ffffff",

    fontSize: 19,

    fontWeight: 900,

    cursor: "pointer",

    background: "#1e293b",

    touchAction: "manipulation",
  };

  // ===================================================
  // INTERFAZ
  // ===================================================

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,

        width: "100vw",
        height: "100dvh",

        background: "#020617",

        color: "#ffffff",

        fontFamily:
          "Arial, sans-serif",

        overflow: "hidden",

        zIndex: 99999,
      }}
    >
      {/* ===========================================
          VIDEO DE CÁMARA
      =========================================== */}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",

          inset: 0,

          width: "100%",
          height: "100%",

          objectFit: "cover",

          background: "#000000",
        }}
      />

      {/* Canvas invisible para OCR */}

      <canvas
        ref={canvasOCRRef}
        style={{
          display: "none",
        }}
      />

      {/* ===========================================
          ENCABEZADO
      =========================================== */}

      <header
        style={{
          position: "absolute",

          top:
            "max(12px, env(safe-area-inset-top))",

          left: 12,
          right: 12,

          display: "flex",

          alignItems: "center",

          justifyContent:
            "space-between",

          gap: 10,

          padding: "12px 14px",

          borderRadius: 18,

          background:
            "rgba(2, 6, 23, 0.82)",

          backdropFilter:
            "blur(10px)",
        }}
      >
        <div>
          <strong
            style={{
              fontSize: 22,
            }}
          >
            📱 POS Init
          </strong>

          <div
            style={{
              fontSize: 12,

              color: "#cbd5e1",

              marginTop: 3,
            }}
          >
            Escáner inteligente
          </div>
        </div>

        <span
          style={{
            background: conectado
              ? "#166534"
              : "#475569",

            padding: "10px 12px",

            borderRadius: 20,

            fontSize: 12,

            fontWeight: 800,

            whiteSpace: "nowrap",
          }}
        >
          {conectado
            ? "● CONECTADO"
            : "○ SIN CONEXIÓN"}
        </span>
      </header>

      {/* ===========================================
          ÁREA DE LECTURA
      =========================================== */}

      <div
        style={{
          position: "absolute",

          top: "40%",

          left: "6%",

          width: "88%",

          height: 125,

          transform:
            "translateY(-50%)",

          border: confirmacion
            ? "3px solid #22c55e"
            : "3px solid #22d3ee",

          borderRadius: 18,

          boxShadow: confirmacion
            ? "0 0 25px rgba(34,197,94,.65)"
            : "0 0 18px rgba(34,211,238,.3)",

          pointerEvents: "none",

          transition:
            "border-color .15s, box-shadow .15s",
        }}
      >
        <div
          style={{
            position: "absolute",

            left: "5%",
            right: "5%",

            top: "50%",

            height: 2,

            background: confirmacion
              ? "#22c55e"
              : "#22d3ee",
          }}
        />
      </div>

      {/* ===========================================
          CONFIRMACIÓN
      =========================================== */}

      {confirmacion && (
        <div
          style={{
            position: "absolute",

            top: "calc(40% + 85px)",

            left: "50%",

            transform:
              "translateX(-50%)",

            padding: "12px 20px",

            borderRadius: 30,

            background: "#166534",

            fontSize: 17,

            fontWeight: 900,

            whiteSpace: "nowrap",

            boxShadow:
              "0 5px 25px #0008",
          }}
        >
          ✓ Código detectado
        </div>
      )}

      {/* ===========================================
          CONTROLES INFERIORES
      =========================================== */}

      <footer
        style={{
          position: "absolute",

          bottom: 0,

          left: 0,
          right: 0,

          padding:
            "16px 14px max(20px, env(safe-area-inset-bottom))",

          background:
            "rgba(2, 6, 23, 0.92)",

          borderTop:
            "1px solid #334155",

          backdropFilter:
            "blur(12px)",
        }}
      >
        {/* Estado */}

        <div
          role="status"
          style={{
            textAlign: "center",

            marginBottom: 12,

            fontSize: 14,

            fontWeight: 700,

            color: conectado
              ? "#86efac"
              : "#cbd5e1",
          }}
        >
          {estado}
        </div>

        {/* =======================================
            ÚLTIMO CÓDIGO VÁLIDO
        ======================================= */}

        {ultimoCodigo && (
          <div
            style={{
              padding: 12,

              marginBottom: 12,

              borderRadius: 14,

              background:
                "#064e3b",

              border:
                "1px solid #059669",

              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,

                color: "#a7f3d0",

                marginBottom: 4,
              }}
            >
              {metodoLectura === "numeros"
                ? "🔢 Detectado por números"
                : "📊 Detectado por barras"}
            </div>

            <strong
              style={{
                fontSize: 23,

                letterSpacing: 1,

                overflowWrap:
                  "anywhere",
              }}
            >
              {ultimoCodigo}
            </strong>
          </div>
        )}

        {/* =======================================
            ZOOM 1X, 2X, 3X, 4X
        ======================================= */}

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",

            gap: 8,

            marginBottom: 10,
          }}
        >
          {[1, 2, 3, 4].map(
            (valor) => {
              const disponible =
                conectado &&
                zoomDisponible &&
                valor >= zoomMin &&
                valor <= zoomMax;

              const seleccionado =
                Math.abs(
                  zoom - valor
                ) < 0.1;

              return (
                <button
                  key={valor}
                  type="button"

                  disabled={
                    !disponible
                  }

                  onClick={() =>
                    aplicarZoom(valor)
                  }

                  style={{
                    ...boton,

                    background:
                      seleccionado
                        ? "#0369a1"
                        : "#1e293b",

                    border:
                      seleccionado
                        ? "2px solid #67e8f9"
                        : "1px solid #475569",

                    opacity:
                      disponible
                        ? 1
                        : 0.4,
                  }}
                >
                  {valor}×
                </button>
              );
            }
          )}
        </div>

        {/* =======================================
            ZOOM PRECISO
        ======================================= */}

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "1fr 1fr",

            gap: 10,

            marginBottom: 12,
          }}
        >
          <button
            type="button"

            disabled={
              !conectado ||
              !zoomDisponible
            }

            onClick={() =>
              aplicarZoom(
                zoom - 0.5
              )
            }

            style={{
              ...boton,

              opacity:
                conectado &&
                zoomDisponible
                  ? 1
                  : 0.4,
            }}
          >
            ➖ Zoom
          </button>

          <button
            type="button"

            disabled={
              !conectado ||
              !zoomDisponible
            }

            onClick={() =>
              aplicarZoom(
                zoom + 0.5
              )
            }

            style={{
              ...boton,

              opacity:
                conectado &&
                zoomDisponible
                  ? 1
                  : 0.4,
            }}
          >
            ➕ Zoom
          </button>
        </div>

        {/* =======================================
            INICIAR / DETENER
        ======================================= */}

        {!conectado ? (
          <button
            type="button"

            onClick={iniciar}

            disabled={iniciando}

            style={{
              ...boton,

              width: "100%",

              background:
                "#2563eb",

              opacity:
                iniciando
                  ? 0.6
                  : 1,
            }}
          >
            {iniciando
              ? "⏳ Preparando cámara..."
              : "📷 Iniciar cámara"}
          </button>
        ) : (
          <button
            type="button"

            onClick={detener}

            style={{
              ...boton,

              width: "100%",

              background:
                "#b91c1c",
            }}
          >
            ⏹ Desconectar cámara
          </button>
        )}

        {/* Indicador discreto del OCR */}

        {conectado && (
          <div
            style={{
              marginTop: 10,

              textAlign: "center",

              fontSize: 11,

              color: "#94a3b8",
            }}
          >
            📊 Barras
            {" · "}
            🔢 Números
            {" · "}
            {ocrDisponible
              ? "OCR activo"
              : "OCR no disponible"}
          </div>
        )}
      </footer>
    </main>
  );
}