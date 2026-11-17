import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

// Vite only serves admin/index.html at /admin/; send /admin (and /lich) there like the static host does
const toPageSlash = (req, res, next) => {
  const m = /^\/(admin|lich)(\?.*)?$/.exec(req.url);
  if (m) {
    res.statusCode = 301;
    res.setHeader("Location", `/${m[1]}/${m[2] || ""}`);
    res.end();
    return;
  }
  next();
};

// Three pages: the landing page (/), the admin (/admin) and schedule registration for students (/lich)
export default defineConfig({
  appType: "mpa", // no SPA fallback: unknown paths 404 instead of silently serving the landing page
  plugins: [{
    name: "page-trailing-slash",
    configureServer: server => { server.middlewares.use(toPageSlash); },
    configurePreviewServer: server => { server.middlewares.use(toPageSlash); }
  }],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        admin: resolve(root, "admin/index.html"),
        lich: resolve(root, "lich/index.html")
      }
    }
  }
});
