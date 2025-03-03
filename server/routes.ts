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

// Update the createInitialAdminUser function to add freshbooksToken
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
        freshbooksToken: process.env.FRESHBOOKS_ADMIN_TOKEN
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
  await createInitialAdminUser();

  // Customer Inquiry Form
  app.post("/api/inquiries", async (req, res) => {
    try {
      const inquiryData = insertInquirySchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(inquiryData.email);
      if (existingUser) {
        return res.status(400).json({ 
          error: "An account with this email already exists. Please login or use a different email." 
        });
      }

      // Create user with temporary password and pending status
      const tempPassword = generateTemporaryPassword();
      const hashedPassword = await storage.hashPassword(tempPassword);

      const user = await storage.createUser({
        username: inquiryData.email,
        password: hashedPassword,
        email: inquiryData.email,
        phoneNumber: inquiryData.phoneNumber,
        companyName: inquiryData.companyName,
        role: "pending",
        isTemporaryPassword: true,
        inquiryDetails: inquiryData.details
      });

      // Return temporary password in response (only in development)
      res.status(201).json({
        message: "Inquiry submitted successfully",
        tempPassword
      });
    } catch (error) {
      console.error("Error creating inquiry:", error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Failed to create inquiry" 
      });
    }
  });

  // Add endpoint for admins to get pending inquiries
  app.get("/api/admin/inquiries", requireAdmin, async (req, res) => {
    try {
      const pendingUsers = await storage.getUsersByRole("pending");
      res.json(pendingUsers);
    } catch (error) {
      console.error("Error fetching pending inquiries:", error);
      res.status(500).json({
        error: "Failed to fetch pending inquiries",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update the project creation when approving inquiry
  app.post("/api/admin/inquiries/:id/approve", requireAdmin, async (req, res) => {
    try {
      // Check if Freshbooks is connected
      if (!req.session.freshbooksTokens) {
        return res.status(400).json({
          error: "Freshbooks is not connected. Please connect your Freshbooks account first."
        });
      }

      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get the account ID
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${req.session.freshbooksTokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const accountId = meData.response?.business_memberships?.[0]?.business?.account_id;

      if (!accountId) {
        throw new Error("No account ID found in user profile");
      }

      // Create client in Freshbooks
      const freshbooksClientData = {
        fname: user.firstName || user.username.split('@')[0],
        lname: user.lastName || "",
        organization: user.companyName,
        email: user.email,
        home_phone: user.phoneNumber,
        currency_code: "USD",
        language: "en"
      };

      try {
        const freshbooksClient = await freshbooksService.createClient(req.session.freshbooksTokens.access_token, {
          client: freshbooksClientData
        });

        // Create initial project from inquiry details
        if (user.inquiryDetails) {
          const project = await storage.createProject({
            title: "Initial Inquiry Project",
            description: user.inquiryDetails,
            clientId: user.id,
            status: "pending"
          });
        }

        // Update user role to customer
        await storage.updateUserRole(userId, "customer");

        res.json({ message: "Inquiry approved and client created successfully" });
      } catch (freshbooksError) {
        console.error("Freshbooks error details:", freshbooksError);
        throw new Error("Failed to create Freshbooks client. Please try again later.");
      }
    } catch (error) {
      console.error("Error approving inquiry:", error);
      res.status(500).json({
        error: "Failed to approve inquiry",
        details: error instanceof Error ? error.message : String(error)
      });
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
        tempPassword
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

  // Update the callback route to match Freshbooks configuration
  app.get("/auth/callback", requireAdmin, async (req, res) => {
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

      res.redirect("/admin/settings?freshbooks=connected");
    } catch (error) {
      console.error("Freshbooks auth callback error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      res.redirect("/admin/settings?freshbooks=error");
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
  app.post("/api/freshbooks/clients", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      const client = await freshbooksService.createClient(tokens.access_token, req.body.client);
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({
        error: "Failed to create client",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this endpoint with the other Freshbooks routes
  app.put("/api/freshbooks/clients/:id", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      const clientId = req.params.id;
      const updatedClient = await freshbooksService.updateClient(tokens.access_token, clientId, req.body.client);
      res.json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({
        error: "Failed to update client",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/freshbooks/connection-status", requireAdmin, async (req, res) => {
    try {
      const isConnected = !!req.session.freshbooksTokens?.access_token;
      res.json({ isConnected });
    } catch (error) {
      console.error("Error checking Freshbooks connection status:", error);
      res.status(500).json({
        error: "Failed to check connection status",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/freshbooks/disconnect", requireAdmin, async (req, res) => {
    try {
      // If we have tokens, try to revoke them with Freshbooks
      if (req.session.freshbooksTokens) {
        const response = await fetch('https://api.freshbooks.com/auth/oauth/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: process.env.FRESHBOOKS_CLIENT_ID,
            client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
            token: req.session.freshbooksTokens.access_token
          })
        });

        if (!response.ok) {
          console.error("Failed to revoke token:", await response.text());
        }
      }

      // Clear tokens from session regardless of revoke success
      delete req.session.freshbooksTokens;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      res.json({ message: "Disconnected successfully" });
    } catch (error) {
      console.error("Error disconnecting from Freshbooks:", error);
      res.status(500).json({
        error: "Failed to disconnect",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

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
      .slice(0, 5);

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

  // Add this debug endpoint with the other Freshbooks routes
  app.get("/api/freshbooks/debug/clients", requireAdmin, async (req, res) => {
    try {
      console.log("Fetching raw Freshbooks client data for debugging");
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the account ID
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const accountId = meData.response?.business_memberships?.[0]?.business?.account_id;

      if (!accountId) {
        throw new Error("No account ID found in user profile");
      }

      // Fetch clients with the account ID
      const clientsResponse = await fetch(
        `https://api.freshbooks.com/accounting/account/${accountId}/users/clients`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!clientsResponse.ok) {
        throw new Error(`Failed to fetch clients: ${clientsResponse.status}`);
      }

      const rawData = await clientsResponse.json();
      res.json(rawData);
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({
        error: "Failed to fetch debug data",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}