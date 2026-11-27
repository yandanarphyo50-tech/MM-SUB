import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({command}) => {
  const buildVersion =
    command === 'build'
      ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      : 'dev';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(buildVersion),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ and writes dist/version.json so existing users
      // and PWAs automatically detect new production builds and upgrade cleanly.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          if (fs.existsSync(distDir)) {
            fs.writeFileSync(
              path.join(distDir, 'version.json'),
              JSON.stringify(
                {
                  version: buildVersion,
                  builtAt: new Date().toISOString(),
                },
                null,
                2
              ),
              'utf8'
            );
          }
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.join(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          const bundledFontsDir = path.resolve(__dirname, 'fonts');
          const distFontsDir = path.join(distDir, 'studio-fonts');
          if (fs.existsSync(distDir) && fs.existsSync(bundledFontsDir)) {
            fs.mkdirSync(distFontsDir, {recursive: true});
            for (const entry of fs.readdirSync(bundledFontsDir)) {
              if (/\.(ttf|otf|woff2?)$/i.test(entry)) {
                fs.copyFileSync(
                  path.join(bundledFontsDir, entry),
                  path.join(distFontsDir, entry)
                );
              }
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
