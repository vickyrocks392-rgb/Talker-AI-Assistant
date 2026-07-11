import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const hmrPort = process.env.HMR_PORT ? Number(process.env.HMR_PORT) : undefined;
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled in constrained runtimes via DISABLE_HMR.
      hmr: process.env.DISABLE_HMR === 'true' ? false : hmrPort ? {port: hmrPort} : true,
      // Disable file watching when DISABLE_HMR is true to save CPU.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Proxy API requests to the Express server (needed when running vite separately)
      proxy: {
        '/api': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
          secure: false,
        },
        '/ready': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
          secure: false,
        },
        '/version': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
