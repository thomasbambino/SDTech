import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProjectSchema, insertInvoiceSchema, insertDocumentSchema } from "@shared/schema";
import { freshbooksService } from "./services/freshbooks";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Freshbooks Integration
  app.get("/api/freshbooks/auth", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const authUrl = await freshbooksService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error("Error getting Freshbooks auth URL:", error);
      res.status(500).send("Failed to get Freshbooks authentication URL");
    }
  });

  app.get("/api/freshbooks/callback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const code = req.query.code as string;
      if (!code) {
        throw new Error("No authorization code provided");
      }

      const tokens = await freshbooksService.handleCallback(code, req.user);
      req.session.freshbooksTokens = tokens;
      res.redirect("/dashboard?freshbooks=connected");
    } catch (error) {
      console.error("Freshbooks auth error:", error);
      res.redirect("/dashboard?freshbooks=error");
    }
  });

  app.post("/api/freshbooks/sync", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const tokens = req.session.freshbooksTokens;
    if (!tokens) return res.status(401).send("Freshbooks not connected");

    try {
      const [projects, invoices] = await Promise.all([
        freshbooksService.syncProjects(tokens.access_token),
        freshbooksService.syncInvoices(tokens.access_token),
      ]);
      res.json({ projects, invoices });
    } catch (error) {
      console.error("Freshbooks sync error:", error);
      res.status(500).send("Failed to sync with Freshbooks");
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const projects = await storage.getProjects(req.user.id);
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const project = await storage.getProject(parseInt(req.params.id));
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const data = insertProjectSchema.parse(req.body);
    const project = await storage.createProject({
      ...data,
      clientId: req.user.id,
    });
    res.status(201).json(project);
  });

  // Invoices
  app.get("/api/projects/:projectId/invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const project = await storage.getProject(parseInt(req.params.projectId));
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    const invoices = await storage.getInvoices(project.id);
    res.json(invoices);
  });

  app.post("/api/projects/:projectId/invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const project = await storage.getProject(parseInt(req.params.projectId));
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    const data = insertInvoiceSchema.parse(req.body);
    const invoice = await storage.createInvoice({
      ...data,
      projectId: project.id,
    });
    res.status(201).json(invoice);
  });

  // Documents
  app.get("/api/projects/:projectId/documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const project = await storage.getProject(parseInt(req.params.projectId));
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    const documents = await storage.getDocuments(project.id);
    res.json(documents);
  });

  app.post("/api/projects/:projectId/documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const project = await storage.getProject(parseInt(req.params.projectId));
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    const data = insertDocumentSchema.parse(req.body);
    const document = await storage.createDocument({
      ...data,
      projectId: project.id,
    });
    res.status(201).json(document);
  });

  const httpServer = createServer(app);
  return httpServer;
}