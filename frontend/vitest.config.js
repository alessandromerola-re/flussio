import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test-dom/**/*.test.jsx'],
    setupFiles: ['./test-dom/setup.js'],
  },
});
