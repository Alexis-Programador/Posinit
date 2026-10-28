
import { useEffect, useState } from "react";

export default function ClimaUbicacion() {
  const [datos, setDatos] = useState(null);
  const [hora, setHora] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!datos?.zona) return;

    const actualizarHora = () => {
      setHora(
        new Intl.DateTimeFormat("es-MX", {
          timeZone: datos.zona,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(new Date())
      );
    };

    actualizarHora();
    const intervalo = setInterval(actualizarHora, 1000);
    return () => clearInterval(intervalo);
  }, [datos?.zona]);

  const obtenerClima = () => {
    if (!navigator.geolocation) {
      setError("Este navegador no admite geolocalización.");
      return;
    }

    setError("");

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { latitude, longitude } = coords;

          const url = new URL(
            "https://api.open-meteo.com/v1/forecast"
          );

          url.searchParams.set("latitude", latitude);
          url.searchParams.set("longitude", longitude);
          url.searchParams.set(
            "current",
            "temperature_2m,weather_code"
          );
          url.searchParams.set("timezone", "auto");

          const respuesta = await fetch(url);

          if (!respuesta.ok) {
            throw new Error("No se pudo consultar el clima.");
          }

          const clima = await respuesta.json();

          setDatos({
            temperatura: clima.current.temperature_2m,
            zona: clima.timezone,
            ciudad: clima.timezone
              .split("/")
              .pop()
              .replaceAll("_", " "),
          });
        } catch (err) {
          setError(err.message);
        }
      },
      () => {
        setError("Activa el permiso de ubicación.");
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 300000,
      }
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: "white",
        fontSize: 13,
        flexWrap: "wrap",
      }}
    >
      {datos ? (
        <>
          <strong>🌤️ {datos.temperatura} °C</strong>
          <span>📍 {datos.ciudad}</span>
          <span>🕒 {hora}</span>
        </>
      ) : (
        <button type="button" onClick={obtenerClima}>
          📍 Activar clima
        </button>
      )}

      {error && <small>{error}</small>}
    </div>
  );
}
