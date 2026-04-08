import type { Express, Request, Response } from "express";

export function registerOAuthRoutes(app: Express) {
  // OAuth routes disabled - using JWT auth instead
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    res.redirect(302, "/");
  });
}
