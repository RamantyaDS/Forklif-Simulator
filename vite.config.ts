import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /Forklif-Simulator/
export default defineConfig({
  base: '/Forklif-Simulator/',
  plugins: [react()],
});
