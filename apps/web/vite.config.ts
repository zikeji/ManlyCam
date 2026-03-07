import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export const config = defineConfig({
  plugins: [vue()],
})

// Tool configs require export default to function
export default config
