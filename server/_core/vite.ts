import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { htmlComMeta } from "../seoRotas";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await htmlComMeta(await vite.transformIndexHtml(url, template), url);
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Cache-busting for API responses: never cache
  app.use("/api/", (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // index: false → "/" também passa pelas meta tags; redirect: false → /bom-jardims não vira /bom-jardims/ (pasta de imagens)
  app.use(express.static(distPath, { index: false, redirect: false, setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return;
    }
    // JS/CSS do build têm hash no nome: podem ficar no cache para sempre (Core Web Vitals na 2.ª visita)
    if (/[\\/]assets[\\/]/.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // Fotos, ícones e vídeo do site: 1 semana (o nome não muda quando a imagem muda, então nada de "immutable")
    else if (/\.(webp|png|jpe?g|svg|ico|mp4|woff2?)$/i.test(path)) res.setHeader('Cache-Control', 'public, max-age=604800');
  }}));

  // fall through to index.html if the file doesn't exist (skip API routes)
  let indexHtml: string | null = null;
  app.use("*", async (_req, res) => {
    // Don't serve index.html for API routes
    // Montado em "*": aqui req.path é sempre "/", então confere o endereço original
    if (_req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not Found' });
    }
    try {
      indexHtml ??= await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // O HTML aponta para os arquivos com hash da versão atual: sempre revalida
      res.setHeader('Cache-Control', 'no-cache');
      res.send(await htmlComMeta(indexHtml, _req.originalUrl));
    } catch {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
