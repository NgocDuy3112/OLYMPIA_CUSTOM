import path from "path";
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@shared": path.resolve(__dirname, "./shared"),
        },
    },
    server: {
        port: 5174,
        proxy: {
            "/portal": { target: "http://localhost:3000", changeOrigin: false },
        },
    },
});
