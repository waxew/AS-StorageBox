import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset URLs allow the same production bundle to run at a custom
// domain, a Render static site, or a GitHub Pages project subdirectory.
export default defineConfig({
  plugins:[react()],
  base:'./',
  build:{outDir:'dist',emptyOutDir:true}
});
