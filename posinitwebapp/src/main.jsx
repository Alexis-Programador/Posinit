import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// En caso de un error de ejecución se muestra el diagnóstico en lugar de una página en blanco.
class PanelErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('POSInitWebApp: error de interfaz', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#eef3ff', color: '#17345c', fontFamily: 'system-ui' }}>
      <section role="alert" style={{ maxWidth: 550, padding: 30, borderRadius: 18, background: 'white', boxShadow: '0 10px 30px #102d5e22' }}>
        <h1>POS Init WebApp</h1>
        <h2>No se pudo cargar el panel</h2>
        <p>Actualiza la página con Ctrl + F5. Si continúa el problema, revisa la consola del navegador (F12) y comparte el mensaje.</p>
        <code style={{ display: 'block', overflowWrap: 'anywhere', padding: 12, background: '#f3f5fa' }}>{String(this.state.error?.message || 'Error inesperado')}</code>
        <p><a href="/Posinit/">Regresar al punto de venta</a></p>
      </section>
    </main>;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><PanelErrorBoundary><App /></PanelErrorBoundary></React.StrictMode>
);
