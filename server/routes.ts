import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProjectSchema, insertInvoiceSchema, insertDocumentSchema, insertInquirySchema } from "@shared/schema";
import { freshbooksService } from "./services/freshbooks";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { APIClient } from '@freshbooks/api';

const scryptAsync = promisify(scrypt);

// Middleware to ensure user is an admin
function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated() || req.user.role !== 'admin') {
    return res.status(403).send("Admin access required");
  }
  next();
}

// Helper function to generate a temporary password
function generateTemporaryPassword(): string {
  return randomBytes(8).toString('hex');
}

// Add this helper function at the top with the other imports and helpers
async function createInitialAdminUser() {
  try {
    const existingAdmin = await storage.getUserByUsername('admin@sdtechpros.com');
    if (!existingAdmin) {
      const hashedPassword = await storage.hashPassword('admin123');
      await storage.createUser({
        username: 'admin@sdtechpros.com',
        password: hashedPassword,
        email: 'admin@sdtechpros.com',
        role: 'admin',
        companyName: 'SD Tech Pros',
        isTemporaryPassword: false,
      });
      console.log('Initial admin user created successfully');
    }
  } catch (error) {
    console.error('Error creating initial admin user:', error);
    throw error;
  }
}

// Add parameter validation helper at the top with other helpers
function validateId(id: string): number | null {
  const parsed = parseInt(id);
  return isNaN(parsed) ? null : parsed;
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  await createInitialAdminUser(); // Add this line to create admin user on startup

  // Customer Inquiry Form
  app.post("/api/inquiries", async (req, res) => {
    try {
      const inquiryData = insertInquirySchema.parse(req.body);

      // Create user with temporary password
      const tempPassword = generateTemporaryPassword();
      const hashedPassword = await storage.hashPassword(tempPassword);

      const user = await storage.createUser({
        username: inquiryData.email, // Use email as username
        password: hashedPassword,
        email: inquiryData.email,
        phoneNumber: inquiryData.phoneNumber,
        companyName: inquiryData.companyName,
        address: inquiryData.address,
        role: "pending",
        isTemporaryPassword: true,
      });

      // TODO: Send email with temporary password
      // For now, return it in response (only in development)
      res.status(201).json({
        message: "Inquiry submitted successfully",
        tempPassword // Remove this in production
      });
    } catch (error) {
      console.error("Error creating inquiry:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // User Management (Admin only)
  app.get("/api/users", requireAdmin, async (req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.patch("/api/users/:id/role", requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!['pending', 'customer', 'admin'].includes(role)) {
      return res.status(400).send("Invalid role");
    }

    try {
      const user = await storage.updateUserRole(parseInt(req.params.id), role);
      res.json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/users/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const tempPassword = generateTemporaryPassword();
      const hashedPassword = await storage.hashPassword(tempPassword);

      await storage.updateUserPassword(parseInt(req.params.id), hashedPassword, true);

      // TODO: Send email with temporary password
      // For now, return it in response (only in development)
      res.json({
        message: "Password reset successful",
        tempPassword // Remove this in production
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Password Change (for users with temporary password)
  app.post("/api/change-password", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).send("Invalid password");
    }

    try {
      const hashedPassword = await storage.hashPassword(newPassword);
      await storage.updateUserPassword(req.user.id, hashedPassword, false);
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Freshbooks Integration (Admin only)
  app.get("/api/freshbooks/auth", requireAdmin, async (req, res) => {
    try {
      console.log("Starting Freshbooks auth URL generation");
      const authUrl = await freshbooksService.getAuthUrl();
      console.log("Generated Freshbooks auth URL:", authUrl);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error getting Freshbooks auth URL:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      res.status(500).json({
        error: "Failed to get Freshbooks authentication URL",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/freshbooks/callback", requireAdmin, async (req, res) => {
    try {
      console.log("Received Freshbooks callback");
      const code = req.query.code as string;
      if (!code) {
        throw new Error("No authorization code provided");
      }

      console.log("Exchanging authorization code for tokens");
      const tokens = await freshbooksService.handleCallback(code);
      console.log("Successfully received tokens from Freshbooks");

      // Store tokens in session
      req.session.freshbooksTokens = tokens;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Error saving session:", err);
            reject(err);
          } else {
            console.log("Session saved successfully");
            resolve(true);
          }
        });
      });

      res.redirect("/clients?freshbooks=connected");
    } catch (error) {
      console.error("Freshbooks auth callback error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      res.redirect("/clients?freshbooks=error");
    }
  });

  app.get("/api/freshbooks/clients", requireAdmin, async (req, res) => {
    try {
      console.log("Checking Freshbooks session tokens");
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        console.log("No Freshbooks tokens found in session");
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      console.log("Fetching Freshbooks clients with access token");
      const clients = await freshbooksService.getClients(tokens.access_token);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching Freshbooks clients:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      res.status(500).json({
        error: "Failed to fetch Freshbooks clients",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this endpoint with the other Freshbooks routes
  app.get("/api/projects/recent-invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all projects for the user
    const projects = await storage.getProjects(req.user.id);

    // Get invoices for each project
    const invoicesPromises = projects.map(project => storage.getInvoices(project.id));
    const invoicesByProject = await Promise.all(invoicesPromises);

    // Flatten and sort by due date
    const allInvoices = invoicesByProject
      .flat()
      .sort((a, b) => {
        if (!a.dueDate || !b.dueDate) return 0;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      })
      .slice(0, 5); // Get only the 5 most recent

    res.json(allInvoices);
  });


  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const projects = await storage.getProjects(req.user.id);
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const projectId = validateId(req.params.id);
    if (projectId === null) return res.status(400).send("Invalid project ID");

    const project = await storage.getProject(projectId);
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

    const projectId = validateId(req.params.projectId);
    if (projectId === null) return res.status(400).send("Invalid project ID");

    const project = await storage.getProject(projectId);
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    const invoices = await storage.getInvoices(project.id);
    res.json(invoices);
  });

  app.post("/api/projects/:projectId/invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const projectId = validateId(req.params.projectId);
    if (projectId === null) return res.status(400).send("Invalid project ID");

    const project = await storage.getProject(projectId);
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

    const projectId = validateId(req.params.projectId);
    if (projectId === null) return res.status(400).send("Invalid project ID");

    const project = await storage.getProject(projectId);
    if (!project || project.clientId !== req.user.id) return res.sendStatus(404);
    const documents = await storage.getDocuments(project.id);
    res.json(documents);
  });

  app.post("/api/projects/:projectId/documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const projectId = validateId(req.params.projectId);
    if (projectId === null) return res.status(400).send("Invalid project ID");

    const project = await storage.getProject(projectId);
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