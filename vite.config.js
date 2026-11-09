import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

// Vite only serves admin/index.html at /admin/; send /admin there like the static host does
const toAdminSlash = (req, res, next) => {
  if (req.url === "/admin" || req.url.startsWith("/admin?")) {
    res.statusCode = 301;
    res.setHeader("Location", "/admin/" + req.url.slice("/admin".length));
    res.end();
    return;
  }
  next();
};

// Two pages: the landing page (/) and the registration admin (/admin)
export default defineConfig({
  appType: "mpa", // no SPA fallback: unknown paths 404 instead of silently serving the landing page
  plugins: [{
    name: "admin-trailing-slash",
    configureServer: server => { server.middlewares.use(toAdminSlash); },
    configurePreviewServer: server => { server.middlewares.use(toAdminSlash); }
  }],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        admin: resolve(root, "admin/index.html")
      }
    }
  }
});
