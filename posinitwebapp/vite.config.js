import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const project = dirname(fileURLToPath(import.meta.url));
const firebaseHosting = process.env.VITE_DEPLOY_TARGET === 'firebase';

export default defineConfig({
  root: project,
  plugins: [react()],
  base: firebaseHosting ? '/' : '/Posinit/posinitwebapp/',
  build: {
    outDir: firebaseHosting ? resolve(project, 'dist') : resolve(project, '../dist/posinitwebapp'),
    emptyOutDir: true,
  },
});
