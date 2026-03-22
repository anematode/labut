import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'labut',
      formats: ['es', 'cjs'],
      fileName: (format) => `labut.${format}.js`,
    },
    rollupOptions: {
      external: [], 
      output: {
        globals: { /* idk */ },
      },
    },
  },
  plugins: [dts({
    tsconfigPath: "./tsconfig.json",
    exclude: ["src/native/**", "src/__tests__/**"],
  })],
});
