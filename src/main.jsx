/**
 * Aether Throne — application entry point.
 *
 * Boots the React UI overlay into #ui-root. The Three.js game engine is NOT
 * created here; it is lazily bootstrapped by src/GameBootstrap.js when the
 * lobby transitions the app into the LOADING screen (see src/ui/App.jsx).
 *
 * NOTE: We deliberately do not wrap in <React.StrictMode>. StrictMode
 * double-invokes effects in dev, which would double-bootstrap the engine
 * (Rapier wasm init + WebGL context) — guarding that is noisier than the
 * value StrictMode adds to this codebase.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import './ui/styles/ui.css';

createRoot(document.getElementById('ui-root')).render(<App />);
