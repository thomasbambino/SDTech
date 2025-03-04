import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProjectSchema, insertInvoiceSchema, insertDocumentSchema, insertInquirySchema } from "@shared/schema";
import { freshbooksService } from "./services/freshbooks";
import { emailService } from "./services/email";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { APIClient } from '@freshbooks/api';
import passport from "passport";
import type { User } from "@shared/schema";
import type { UploadedFile } from "express-fileupload";

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

const formatDate = (dateString: string | null | undefined, timezone: string = 'America/Los_Angeles') => {
    try {
      if (!dateString) return 'Date not available';

      let date: Date;

      // Check if it's a string representation of a date
      if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
        date = new Date(dateString);
      }
      // If it's a numeric timestamp (seconds since epoch)
      else if (!isNaN(Number(dateString))) {
        const timestamp = Number(dateString);
        date = new Date(timestamp * 1000);
      } else {
        return 'Invalid date';
      }

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      // Format the date in the specified timezone
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZoneName: 'short'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Date formatting error';
    }
};

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  await createInitialAdminUser();

  // Update login route to include password status
  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
    try {
      // Type assertion since we know req.user exists after authentication
      const authenticatedUser = req.user as Express.User;
      const user = await storage.getUser(authenticatedUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        ...user,
        requiresPasswordChange: user.isTemporaryPassword
      });
    } catch (error) {
      console.error("Error in login:", error);
      res.status(500).json({
        error: "Failed to process login",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

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
        // Create client using the accountId
        const clientsResponse = await fetch(
          `https://api.freshbooks.com/accounting/account/${accountId}/users/clients`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${req.session.freshbooksTokens.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ client: freshbooksClientData })
          }
        );

        if (!clientsResponse.ok) {
          throw new Error(`Failed to create client: ${clientsResponse.status}`);
        }

        const freshbooksClient = await clientsResponse.json();

        // Create initial project from inquiry details
        if (user.inquiryDetails) {
          try {
            console.log("Creating initial project from inquiry details");
            const project = await storage.createProject({
              title: "Initial Inquiry Project",
              description: user.inquiryDetails,
              clientId: user.id,
              status: "pending"
            });
            console.log("Created project:", project);
          } catch (projectError) {
            console.error("Failed to create project:", projectError);
            throw new Error("Failed to create project from inquiry");
          }
        }

        // Update user role to customer
        await storage.updateUserRole(userId, "customer");

        res.json({ 
          message: "Inquiry approved and client created successfully",
          details: "Created Freshbooks client and initial project from inquiry details"
        });
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

      const user = await storage.getUser(parseInt(req.params.id));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.updateUserPassword(user.id, hashedPassword, true);

      // Send password reset email
      await emailService.sendPasswordResetEmail(user.email, tempPassword);

      res.json({
        message: "Password reset successful and email sent",
        tempPassword // Only included in development
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Failed to reset password",
        details: error instanceof Error ? error.message : String(error)
      });
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
      const authenticatedUser = req.user as Express.User;
      const hashedPassword = await storage.hashPassword(newPassword);
      await storage.updateUserPassword(authenticatedUser.id, hashedPassword, false);
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Freshbooks Integration (Admin only)
  app.get("/api/freshbooks/connection-status", requireAdmin, async (req, res) => {
    try {
      console.log("Checking Freshbooks session tokens:", {
        hasTokens: !!req.session.freshbooksTokens,
        hasAccessToken: req.session.freshbooksTokens?.access_token ? 'yes' : 'no'
      });
      
      const tokens = req.session.freshbooksTokens;

      if (!tokens || !tokens.access_token) {
        console.log("No valid tokens found in session");
        return res.json({ connected: false });
      }

      // Verify the connection by making a test API call
      try {
        console.log("Making test API call to verify Freshbooks connection");
        const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!meResponse.ok) {
          console.log("Failed to verify Freshbooks connection:", {
            status: meResponse.status,
            statusText: meResponse.statusText
          });
          return res.json({ connected: false });
        }

        const meData = await meResponse.json();
        console.log("Received Freshbooks user data:", {
          hasResponse: !!meData.response,
          hasBusinessMemberships: !!meData.response?.business_memberships,
          businessCount: meData.response?.business_memberships?.length
        });

        const accountId = meData.response?.business_memberships?.[0]?.business?.account_id;

        if (!accountId) {
          console.log("No account ID found in Freshbooks response");
          return res.json({ connected: false });
        }

        console.log("Freshbooks connection verified successfully:", {
          accountId,
          timestamp: new Date().toISOString()
        });
        
        return res.json({ 
          connected: true,
          accountId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error verifying Freshbooks connection:", {
          error,
          stack: error instanceof Error ? error.stack : undefined
        });
        return res.json({ connected: false });
      }
    } catch (error) {
      console.error("Error checking Freshbooks connection status:", {
        error,
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        error: "Failed to check connection status",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

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

  app.get("/api/freshbooks/clients", async (req, res) => {
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

      // Get user profile first to get timezone
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      // Handle new client creation in both Freshbooks and local DB
      app.post("/api/freshbooks/clients", requireAdmin, async (req, res) => {
        try {
          const tokens = req.session.freshbooksTokens;
          if (!tokens) {
            return res.status(401).json({
              error: "Freshbooks not connected",
              details: "Please connect your Freshbooks account first"
            });
          }

          // Create client in Freshbooks
          const client = await freshbooksService.createClient(tokens.access_token, req.body.client);

          // Generate a temporary password for the new client
          const tempPassword = generateTemporaryPassword();
          const hashedPassword = await storage.hashPassword(tempPassword);

          // Create a user account for the client in our database
          const user = await storage.createUser({
            username: client.email,
            password: hashedPassword,
            email: client.email,
            firstName: client.fname,
            lastName: client.lname,
            phoneNumber: client.home_phone,
            companyName: client.organization,
            address: [client.p_street, client.p_city, client.p_province].filter(Boolean).join(', '),
            role: 'customer',
            isTemporaryPassword: true,
            freshbooksId: client.id.toString()
          });

          // Return both the Freshbooks client and the temporary password
          res.status(201).json({
            client,
            tempPassword // Only included in development
          });
        } catch (error) {
          console.error("Error creating client:", error);
          res.status(500).json({
            error: "Failed to create client",
            details: error instanceof Error ? error.message : String(error)
          });
        }
      });

      // Handle password reset for existing clients
      app.post("/api/freshbooks/clients/:id/reset-password", requireAdmin, async (req, res) => {
        try {
          // Generate a temporary password
          const tempPassword = generateTemporaryPassword();
          const hashedPassword = await storage.hashPassword(tempPassword);

          // Get the client's user account
          const user = await storage.getUserByFreshbooksId(req.params.id);
          if (!user) {
            // If no user exists yet, create one using Freshbooks data
            const tokens = req.session.freshbooksTokens;
            if (!tokens) {
              return res.status(401).json({ error: "Freshbooks authentication required" });
            }

            // Get client details from Freshbooks
            const accountId = await freshbooksService.getBusinessId(tokens.access_token);
            const clientResponse = await fetch(
              `${freshbooksService.baseUrl}/accounting/account/${accountId}/users/clients/${req.params.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json'
                }
              }
            );

            if (!clientResponse.ok) {
              throw new Error(`Failed to fetch client from Freshbooks: ${clientResponse.status}`);
            }

            const clientData = await clientResponse.json();
            const client = clientData.response.result.client;

            // Create new user account
            const newUser = await storage.createUser({
              username: client.email,
              password: hashedPassword,
              email: client.email,
              firstName: client.fname,
              lastName: client.lname,
              phoneNumber: client.home_phone,
              companyName: client.organization,
              address: [client.p_street, client.p_city, client.p_province].filter(Boolean).join(', '),
              role: 'customer',
              isTemporaryPassword: true,
              freshbooksId: req.params.id
            });

            res.json({
              message: "New user account created with temporary password",
              tempPassword // Only included in development
            });
          } else {
            // Update existing user's password
            await storage.updateUserPassword(user.id, hashedPassword, true);
            res.json({
              message: "Password reset successful",
              tempPassword // Only included in development
            });
          }
        } catch (error) {
          console.error("Error resetting client password:", error);
          res.status(500).json({
            error: "Failed to reset password",
            details: error instanceof Error ? error.message : String(error)
          });
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const accountId = meData.response?.business_memberships?.[0]?.business?.account_id;
      const timezone = meData.response?.timezone || 'America/Los_Angeles';

      if (!accountId) {
        throw new Error("No account ID found in user profile");
      }

      console.log("Fetching Freshbooks clients with access token");
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
      const formattedClients = rawData.response.result.clients.map(client => ({
        id: client.id.toString(),
        name: `${client.fname} ${client.lname}`.trim(),
        organization: client.organization || '',
        email: client.email || '',
        phone: client.home_phone || '',
        address: [
          client.p_street,
          client.p_street2,
          client.p_city,
          client.p_province,
          client.p_code,
          client.p_country
        ].filter(Boolean).join(", "),
        status: client.vis_state === 0 ? "Active" : "Inactive",
        createdDate: formatDate(client.signup_date, timezone) || 
                    formatDate(client.updated, timezone) || 
                    formatDate(client.created_at, timezone) || 
                    'Date not available'
      }));

      res.json(formattedClients);
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

  // Handle new client creation in both Freshbooks and local DB
  app.post("/api/freshbooks/clients", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Create client in Freshbooks
      const fbClient = await freshbooksService.createClient(tokens.access_token, req.body.client);
      console.log("Created Freshbooks client:", fbClient);

      if (!fbClient.email) {
        throw new Error("Client must have an email address");
      }

      // Generate a temporary password for the new client
      const tempPassword = generateTemporaryPassword();
      const hashedPassword = await storage.hashPassword(tempPassword);

      // Create a user account for the client in our database
      const user = await storage.createUser({
        username: fbClient.email,
        password: hashedPassword,
        email: fbClient.email,
        companyName: fbClient.organization || '',
        phoneNumber: fbClient.phone || '',
        role: 'customer',
        isTemporaryPassword: true,
        freshbooksId: fbClient.id.toString()
      });

      console.log("Created local user:", {
        id: user.id,
        email: user.email,
        freshbooksId: user.freshbooksId
      });

      res.status(201).json({
        client: fbClient,
        tempPassword // Only included in development
      });
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

  app.get("/api/freshbooks/clients/:id", async (req, res) => {
    try {
      console.log("Fetching client details for ID:", req.params.id);
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the account ID and timezone
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
      const timezone = meData.response?.timezone || 'America/Los_Angeles';

      if (!accountId) {
        throw new Error("No account ID found in user profile");
      }

      // Fetch single client with the account ID
      const clientResponse = await fetch(
        `https://api.freshbooks.com/accounting/account/${accountId}/users/clients/${req.params.id}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!clientResponse.ok) {
        throw new Error(`Failed to fetch client: ${clientResponse.status}`);
      }

      const rawData = await clientResponse.json();
      const clientData = rawData.response.result.client;

      // Debug logging for date fields
      console.log("Date fields from API:", {
        signup_date: clientData.signup_date,
        updated: clientData.updated,
        created_at: clientData.created_at
      });

      const formattedClient = {
        id: clientData.id.toString(),
        name: `${clientData.fname} ${clientData.lname}`.trim(),
        organization: clientData.organization || '',
        email: clientData.email || '',
        phone: clientData.home_phone || '',
        address: [
          clientData.p_street,
          clientData.p_street2,
          clientData.p_city,
          clientData.p_province,
          clientData.p_code,
          clientData.p_country
        ].filter(Boolean).join(", "),
        status: clientData.vis_state === 0 ? "Active" : "Inactive",
        createdDate: formatDate(clientData.signup_date, timezone) || 
                    formatDate(clientData.updated, timezone) || 
                    formatDate(clientData.created_at, timezone) || 
                    'Date not available'
      };

      console.log("Formatted client data:", formattedClient);
      res.json(formattedClient);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({
        error: "Failed to fetch client",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer" 
    const users = await storage.getUsersByRole("customer");
    res.json(users);
  });

  // Add endpoint for customers to access their own projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const authenticatedUser = req.user as Express.User;
      
      // For customers, only return their own projects
      if (authenticatedUser.role === 'customer' && authenticatedUser.freshbooksId) {
        // Get the account ID from Freshbooks API
        const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${req.session.freshbooksTokens?.access_token}`,
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

        const response = await fetch(
          `https://api.freshbooks.com/accounting/account/${accountId}/users/clients/${authenticatedUser.freshbooksId}/projects`,
          {
            headers: {
              'Authorization': `Bearer ${req.session.freshbooksTokens?.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }

        const data = await response.json();
        const formattedProjects = data.response.result.projects.map(project => ({
          id: project.id.toString(),
          title: project.title,
          description: project.description,
          status: project.active ? 'Active' : 'Inactive',
          dueDate: project.due_date,
          budget: project.budget,
          fixedPrice: project.fixed_price,
          createdAt: project.created_at,
          clientId: project.client_id.toString(),
          billingMethod: project.billing_method,
          projectType: project.project_type,
          billedAmount: project.billed_amount,
          billedStatus: project.billed_status
        }));

        return res.json(formattedProjects);
      }

      // For other roles or cases where freshbooksId is not available
      return res.status(403).json({ 
        error: "Access denied. Insufficient permissions or missing client ID." 
      });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });



  // Handle password reset for existing clients
  app.post("/api/freshbooks/clients/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      console.log("Attempting to reset password for Freshbooks client:", req.params.id);
      
      // Get the client's user account
      const user = await storage.getUserByFreshbooksId(req.params.id);
      console.log("Found user by Freshbooks ID:", user);

      // Generate a temporary password
      const tempPassword = generateTemporaryPassword();
      const hashedPassword = await storage.hashPassword(tempPassword);

      if (!user) {
        // If no user exists yet, create one using Freshbooks data
        const tokens = req.session.freshbooksTokens;
        if (!tokens) {
          return res.status(401).json({ error: "Freshbooks authentication required" });
        }

        // Get client details from Freshbooks
        const accountId = await freshbooksService.getBusinessId(tokens.access_token);
        const clientResponse = await fetch(
          `${freshbooksService.baseUrl}/accounting/account/${accountId}/users/clients/${req.params.id}`,
          {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!clientResponse.ok) {
          throw new Error(`Failed to fetch client from Freshbooks: ${clientResponse.status}`);
        }

        const clientData = await clientResponse.json();
        const client = clientData.response.result.client;
        console.log("Retrieved Freshbooks client data:", client);

        // Create new user account
        const newUser = await storage.createUser({
          username: client.email,
          password: hashedPassword,
          email: client.email,
          companyName: client.organization || '',
          phoneNumber: client.home_phone || '',
          role: 'customer',
          isTemporaryPassword: true,
          freshbooksId: req.params.id
        });

        console.log("Created new user account:", {
          id: newUser.id,
          email: newUser.email,
          freshbooksId: newUser.freshbooksId
        });

        // Try to send email, but don't fail if it doesn't work
        try {
          const emailSent = await emailService.sendPasswordResetEmail(newUser.email, tempPassword);
          if (!emailSent) {
            console.warn("Failed to send password reset email, but user was created");
          }
        } catch (emailError) {
          console.error("Error sending password reset email:", emailError);
        }

        res.json({
          message: "New user account created with temporary password",
          tempPassword // Always include in development
        });
      } else {
        // Update existing user's password
        await storage.updateUserPassword(user.id, hashedPassword, true);
        console.log("Reset password for existing user:", {
          id: user.id,
          email: user.email,
          freshbooksId: user.freshbooksId
        });

        // Try to send email, but don't fail if it doesn't work
        try {
          const emailSent = await emailService.sendPasswordResetEmail(user.email, tempPassword);
          if (!emailSent) {
            console.warn("Failed to send password reset email");
          }
        } catch (emailError) {
          console.error("Error sending password reset email:", emailError);
        }

        res.json({
          message: "Password reset successful",
          tempPassword // Always include in development
        });
      }
    } catch (error) {
      console.error("Error resetting client password:", error);
      res.status(500).json({
        error: "Failed to reset password", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add endpoint to check if user needs to change password
  app.get("/api/user/password-status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const authenticatedUser = req.user as Express.User;
      const user = await storage.getUser(authenticatedUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        requiresChange: user.isTemporaryPassword,
        lastChanged: user.lastPasswordChange
      });
    } catch (error) {
      console.error("Error checking password status:", error);
      res.status(500).json({
        error: "Failed to check password status",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });



  // Add this new endpoint before the other project-related routes
  app.get("/api/freshbooks/projects", async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Fetch all projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const projectsData = await projectsResponse.json();

      if (!projectsData.projects) {
        return res.json([]);
      }

      // Sync projects with local database
      const syncedProjects = await Promise.all(projectsData.projects.map(async (fbProject) => {
        // Check if project exists locally
        let localProject = await storage.getProjectByFreshbooksId(fbProject.id.toString());

        // If not, create it
        if (!localProject) {
          localProject = await storage.createProject({
            title: fbProject.title?.trim() || 'Untitled Project',
            description: fbProject.description || '',
            clientId: req.user.id,
            status: fbProject.complete ? 'Completed' : 'Active',
            progress: fbProject.progress || 0,
            freshbooksId: fbProject.id.toString()
          });
        }

        return {
          ...localProject,
          createdAt: localProject.createdAt?.toISOString(),
          updatedAt: localProject.updatedAt?.toISOString(),
          dueDate: fbProject.due_date,
          budget: fbProject.budget,
          fixedPrice: fbProject.fixed_price
        };
      }));

      res.json(syncedProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add these new endpoints before the existing project routes
  // Add these endpoints to handle client-specific projects
  app.get("/api/clients/:clientId/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const projects = await storage.getProjectsByClientId(req.params.clientId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/clients/:clientId/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const data = {
        ...req.body,
        clientId: req.params.clientId,
        status: req.body.status || 'Active',
        createdAt: new Date().toISOString()
      };

      // Convert createdAt to proper date string format
      data.createdAt = data.createdAt.split('.')[0].replace('T', ' ');

      const project = await storage.createProject(data);
      res.status(201).json(project);
    } catch(error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Project Notes 
  app.get("/api/projects/:id/notes", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // First try to get project by ID from local database
      let project;
      const projectId = validateId(req.params.id);
      
      if (projectId !== null) {
        project = await storage.getProject(projectId);
      }

      // If not found locally, try to get by Freshbooks ID
      if (!project) {
        project = await storage.getProjectByFreshbooksId(req.params.id);
      }

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const notes = await storage.getProjectNotes(project.id);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching project notes:", error);
      res.status(500).json({ error: "Failed to fetch project notes" });
    }
  });

  app.post("/api/projects/:id/notes", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // First try to get project by ID from local database
      let project;
      const projectId = validateId(req.params.id);
      
      if (projectId !== null) {
        project = await storage.getProject(projectId);
      }

      // If not found locally, try to get by Freshbooks ID
      if (!project) {
        project = await storage.getProjectByFreshbooksId(req.params.id);
      }

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const authenticatedUser = req.user as Express.User;
      const note = await storage.createProjectNote({
        projectId: project.id,
        content: req.body.content,
        createdBy: authenticatedUser.id
      });
      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating project note:", error);
      res.status(500).json({ error: "Failed to create project note" });
    }
  });

  // Add new endpoint for editing notes
  app.patch("/api/projects/:id/notes/:noteId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const projectId = validateId(req.params.id);
      const noteId = validateId(req.params.noteId);
      
      if (projectId === null || noteId === null) {
        return res.status(400).json({ error: "Invalid project or note ID" });
      }

      // Get the project
      let project = await storage.getProject(projectId);
      if (!project) {
        project = await storage.getProjectByFreshbooksId(req.params.id);
      }

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get the note and verify ownership
      const notes = await storage.getProjectNotes(project.id);
      const note = notes.find(n => n.id === noteId);

      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }

      if (note.createdBy !== req.user.id) {
        return res.status(403).json({ error: "You can only edit your own notes" });
      }

      // Update the note
      const updatedNote = await storage.updateProjectNote(noteId, {
        content: req.body.content,
        updatedAt: new Date()
      });

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Project Progress Update
  app.patch("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // First try to get project by ID from local database
      let project;
      const projectId = validateId(req.params.id);
      
      if (projectId !== null) {
        project = await storage.getProject(projectId);
      }

      // If not found locally, try to get by Freshbooks ID
      if (!project) {
        project = await storage.getProjectByFreshbooksId(req.params.id);
      }

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { progress } = req.body;
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return res.status(400).json({ error: "Progress must be a number between 0 and 100" });
      }

      const updatedProject = await storage.updateProjectProgress(project.id, progress);
      res.json(updatedProject);
    } catch (error) {
      console.error("Error updating project progress:", error);
      res.status(500).json({ error: "Failed to update project progress" });
    }
  });

  // File Upload
  app.post("/api/projects/:id/documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // First try to get project by ID from local database
      let project;
      const projectId = validateId(req.params.id);
      
      if (projectId !== null) {
        project = await storage.getProject(projectId);
      }

      // If not found locally, try to get by Freshbooks ID
      if (!project) {
        project = await storage.getProjectByFreshbooksId(req.params.id);
      }

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (!req.files || !req.files.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.files.file as UploadedFile;
      const authenticatedUser = req.user as Express.User;

      const document = await storage.createDocument({
        projectId: project.id,
        name: file.name,
        content: file.data.toString('base64'),
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: authenticatedUser.id
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
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

  // Update the projects endpoint to properly transform the data
  app.get("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      console.log("Fetching projects for client ID:", req.params.id);
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Fetch projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects?client_id=${req.params.id}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        // If no projects found, return empty array instead of error
        if (projectsResponse.status === 404) {
          return res.json([]);
        }
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const projectsData = await projectsResponse.json();
      console.log("Raw projects data:", projectsData);

      // Format the projects data according to Freshbooks structure
      const formattedProjects = projectsData.projects.map(project => ({
        id: project.id.toString(),
        title: project.title?.trim() || 'Untitled Project',
        description: project.description || '',
        status: project.complete ? 'Completed' : (project.active ? 'Active' : 'Inactive'),
        dueDate: project.due_date,
        budget: project.budget,
        fixedPrice: project.fixed_price,
        createdAt: project.created_at,
        clientId: project.client_id.toString(),
        billingMethod: project.billing_method,
        projectType: project.project_type,
        billedAmount: project.billed_amount,
        billedStatus: project.billed_status,
        services: project.services || []
      }));

      console.log("Formatted projects:", formattedProjects);
      res.json(formattedProjects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch client projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint for updating projects
  app.put("/api/freshbooks/projects/:id", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Update project using the correct endpoint
      const updateResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project/${req.params.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: req.body.project
          })
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Project update error response:", errorText);
        throw new Error(`Failed to update project: ${updateResponse.status}`);
      }

      const updatedProject = await updateResponse.json();

      // Format the response
      const formattedProject = {
        id: updatedProject.project.id.toString(),
        title: updatedProject.project.title,
        description: updatedProject.project.description || '',
        status: updatedProject.project.complete ? 'Completed' : 'Active',
        dueDate: updatedProject.project.due_date,
        budget: updatedProject.project.budget,
        fixedPrice: updatedProject.project.fixed_price,
        createdAt: updatedProject.project.created_at,
        clientId: updatedProject.project.client_id.toString()
      };

      res.json(formattedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({
        error: "Failed to update project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.post("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Create project using the correct endpoint
      const createProjectResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: {
              title: req.body.title,
              description: req.body.description,
              client_id: req.params.id,
              project_type: "fixed_price", // or hourly_rate based on your needs
              due_date: req.body.dueDate,
              fixed_price: req.body.budget || 0
            }
          })
        }
      );

      if (!createProjectResponse.ok) {
        const errorData = await createProjectResponse.json();
        throw new Error(errorData.message || `Failed to create project: ${createProjectResponse.status}`);
      }

      const projectData = await createProjectResponse.json();
      const project = projectData.response.result.project;

      // Format the response
      const formattedProject = {
        id: project.id.toString(),
        title: project.title,
        description: project.description || '',
        status: project.complete ? 'Completed' : 'Active',
        createdAt: new Date(project.created_at * 1000).toISOString()
      };

      res.status(201).json(formattedProject);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer"
    const users = await storage.getUsersByRole("customer");
    res.json(users);
  });

  // Add this debug endpoint with the other Freshbooks routes
  app.get("/api/freshbooks/debug/projects", requireAdmin, async (req, res) => {
    try {
      console.log("Fetching raw Freshbooks project data for debugging");
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      console.log("Using business ID:", businessId);

      // Fetch all projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        const errorText = await projectsResponse.text();
        console.error("Projects API error response:", errorText);
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const rawData = await projectsResponse.json();
      console.log("Raw projects response:", JSON.stringify(rawData, null, 2));
      res.json(rawData);
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({
        error: "Failed to fetch debug data",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/projects/recent-invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all projects for the user
    const projects = await storage.getProjects(req.user.id);

    //    // Get invoices for each project
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


  // Add these new endpoints before the existing project routes

  // Add these endpoints to handle client-specific projects
  app.get("/api/clients/:clientId/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const projects = await storage.getProjectsByClientId(req.params.clientId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/clients/:clientId/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const data = {
        ...req.body,
        clientId: req.params.clientId,
        status: req.body.status || 'Active',
        createdAt: new Date().toISOString()
      };

      // Convert createdAt to proper date string format
      data.createdAt = data.createdAt.split('.')[0].replace('T', ' ');

      const project = await storage.createProject(data);
      res.status(201).json(project);
    } catch(error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer"
    const users = await storage.getUsersByRole("customer");
    res.json(users);
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

  // Update the projects endpoint to properly transform the data
  app.get("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      console.log("Fetching projects for client ID:", req.params.id);
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Fetch projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects?client_id=${req.params.id}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        // If no projects found, return empty array instead of error
        if (projectsResponse.status === 404) {
          return res.json([]);
        }
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const projectsData = await projectsResponse.json();
      console.log("Raw projects data:", projectsData);

      // Format the projects data according to Freshbooks structure
      const formattedProjects = projectsData.projects.map(project => ({
        id: project.id.toString(),
        title: project.title?.trim() || 'Untitled Project',
        description: project.description || '',
        status: project.complete ? 'Completed' : (project.active ? 'Active' : 'Inactive'),
        dueDate: project.due_date,
        budget: project.budget,
        fixedPrice: project.fixed_price,
        createdAt: project.created_at,
        clientId: project.client_id.toString(),
        billingMethod: project.billing_method,
        projectType: project.project_type,
        billedAmount: project.billed_amount,
        billedStatus: project.billed_status,
        services: project.services || []
      }));

      console.log("Formatted projects:", formattedProjects);
      res.json(formattedProjects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch client projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint for updating projects
  app.put("/api/freshbooks/projects/:id", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Update project using the correct endpoint
      const updateResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project/${req.params.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: req.body.project
          })
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Project update error response:", errorText);
        throw new Error(`Failed to update project: ${updateResponse.status}`);
      }

      const updatedProject = await updateResponse.json();

      // Format the response
      const formattedProject = {
        id: updatedProject.project.id.toString(),
        title: updatedProject.project.title,
        description: updatedProject.project.description || '',
        status: updatedProject.project.complete ? 'Completed' : 'Active',
        dueDate: updatedProject.project.due_date,
        budget: updatedProject.project.budget,
        fixedPrice: updatedProject.project.fixed_price,
        createdAt: updatedProject.project.created_at,
        clientId: updatedProject.project.client_id.toString()
      };

      res.json(formattedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({
        error: "Failed to update project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.post("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Create project using the correct endpoint
      const createProjectResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: {
              title: req.body.title,
              description: req.body.description,
              client_id: req.params.id,
              project_type: "fixed_price", // or hourly_rate based on your needs
              due_date: req.body.dueDate,
              fixed_price: req.body.budget || 0
            }
          })
        }
      );

      if (!createProjectResponse.ok) {
        const errorData = await createProjectResponse.json();
        throw new Error(errorData.message || `Failed to create project: ${createProjectResponse.status}`);
      }

      const projectData = await createProjectResponse.json();
      const project = projectData.response.result.project;

      // Format the response
      const formattedProject = {
        id: project.id.toString(),
        title: project.title,
        description: project.description || '',
        status: project.complete ? 'Completed' : 'Active',
        createdAt: new Date(project.created_at * 1000).toISOString()
      };

      res.status(201).json(formattedProject);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer"
    const users = await storage.getUsersByRole("customer");
    res.json(users);
  });

  // Add this debug endpoint with the other Freshbooks routes
  app.get("/api/freshbooks/debug/projects", requireAdmin, async (req, res) => {
    try {
      console.log("Fetching raw Freshbooks project data for debugging");
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      console.log("Using business ID:", businessId);

      // Fetch all projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        const errorText = await projectsResponse.text();
        console.error("Projects API error response:", errorText);
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const rawData = await projectsResponse.json();
      console.log("Raw projects response:", JSON.stringify(rawData, null, 2));
      res.json(rawData);
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({
        error: "Failed to fetch debug data",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update the existing project fetch to handle both local and Freshbooks IDs
  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      let project;

      // First try to get project by ID from local database
      const projectId = validateId(req.params.id);
      if (projectId !== null) {
        project = await storage.getProject(projectId);
      }

      // If not found locally, try to get by Freshbooks ID
      if (!project) {
        project = await storage.getProjectByFreshbooksId(req.params.id);
      }

      // If still not found and we have Freshbooks tokens, try to fetch from Freshbooks
      if (!project && req.session.freshbooksTokens) {
        // Get the business ID from user profile
        const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${req.session.freshbooksTokens.access_token}`
          }
        });

        if (!meResponse.ok) {
          throw new Error(`Failed to get user details: ${meResponse.status}`);
        }

        const meData = await meResponse.json();
        const businessId = meData.response?.business_memberships?.[0]?.business?.id;

        if (businessId) {
          // Fetch project from Freshbooks
          const fbProjectResponse = await fetch(
            `https://api.freshbooks.com/projects/business/${businessId}/projects/${req.params.id}`,
            {
              headers: {
                'Authorization': `Bearer ${req.session.freshbooksTokens.access_token}`
              }
            }
          );

          if (fbProjectResponse.ok) {
            const fbData = await fbProjectResponse.json();
            const fbProject = fbData.project;

            // Create project in local database
            project = await storage.createProject({
              title: fbProject.title || 'Untitled Project',
              description: fbProject.description || '',
              clientId: req.user.id, // Associate with current user
              status: fbProject.complete ? 'Completed' : 'Active',
              progress: fbProject.progress || 0,
              freshbooksId: fbProject.id.toString()
            });
          }
        }
      }

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Format dates in ISO string format
      const formattedProject = {
        ...project,
        createdAt: project.createdAt?.toISOString(),
        updatedAt: project.updatedAt?.toISOString()
      };

      res.json(formattedProject);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const projects = await storage.getProjects(req.user.id);
    res.json(projects);
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

  // Update the projects endpoint to properly transform the data
  app.get("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      console.log("Fetching projects for client ID:", req.params.id);
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Fetch projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects?client_id=${req.params.id}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        // If no projects found, return empty array instead of error
        if (projectsResponse.status === 404) {
          return res.json([]);
        }
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const projectsData = await projectsResponse.json();
      console.log("Raw projects data:", projectsData);

      // Format the projects data according to Freshbooks structure
      const formattedProjects = projectsData.projects.map(project => ({
        id: project.id.toString(),
        title: project.title?.trim() || 'Untitled Project',
        description: project.description || '',
        status: project.complete ? 'Completed' : (project.active ? 'Active' : 'Inactive'),
        dueDate: project.due_date,
        budget: project.budget,
        fixedPrice: project.fixed_price,
        createdAt: project.created_at,
        clientId: project.client_id.toString(),
        billingMethod: project.billing_method,
        projectType: project.project_type,
        billedAmount: project.billed_amount,
        billedStatus: project.billed_status,
        services: project.services || []
      }));

      console.log("Formatted projects:", formattedProjects);
      res.json(formattedProjects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch client projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint for updating projects
  app.put("/api/freshbooks/projects/:id", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Update project using the correct endpoint
      const updateResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project/${req.params.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: req.body.project
          })
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Project update error response:", errorText);
        throw new Error(`Failed to update project: ${updateResponse.status}`);
      }

      const updatedProject = await updateResponse.json();

      // Format the response
      const formattedProject = {
        id: updatedProject.project.id.toString(),
        title: updatedProject.project.title,
        description: updatedProject.project.description || '',
        status: updatedProject.project.complete ? 'Completed' : 'Active',
        dueDate: updatedProject.project.due_date,
        budget: updatedProject.project.budget,
        fixedPrice: updatedProject.project.fixed_price,
        createdAt: updatedProject.project.created_at,
        clientId: updatedProject.project.client_id.toString()
      };

      res.json(formattedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({
        error: "Failed to update project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.post("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Create project using the correct endpoint
      const createProjectResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: {
              title: req.body.title,
              description: req.body.description,
              client_id: req.params.id,
              project_type: "fixed_price", // or hourly_rate based on your needs
              due_date: req.body.dueDate,
              fixed_price: req.body.budget || 0
            }
          })
        }
      );

      if (!createProjectResponse.ok) {
        const errorData = await createProjectResponse.json();
        throw new Error(errorData.message || `Failed to create project: ${createProjectResponse.status}`);
      }

      const projectData = await createProjectResponse.json();
      const project = projectData.response.result.project;

      // Format the response
      const formattedProject = {
        id: project.id.toString(),
        title: project.title,
        description: project.description || '',
        status: project.complete ? 'Completed' : 'Active',
        createdAt: new Date(project.created_at * 1000).toISOString()
      };

      res.status(201).json(formattedProject);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer"
    const users = await storage.getUsersByRole("customer");
    res.json(users);
  });

  // Add this debug endpoint with the other Freshbooks routes
  app.get("/api/freshbooks/debug/projects", requireAdmin, async (req, res) => {
    try {
      console.log("Fetching raw Freshbooks project data for debugging");
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      console.log("Using business ID:", businessId);

      // Fetch all projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        const errorText = await projectsResponse.text();
        console.error("Projects API error response:", errorText);
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const rawData = await projectsResponse.json();
      console.log("Raw projects response:", JSON.stringify(rawData, null, 2));
      res.json(rawData);
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({
        error: "Failed to fetch debug data",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/projects/recent-invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all projects for the user
    const projects = await storage.getProjects(req.user.id);

    //    // Get invoices for each project
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


  // Add these new endpoints before the existing project routes

  // Add these endpoints to handle client-specific projects
  app.get("/api/clients/:clientId/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const projects = await storage.getProjectsByClientId(req.params.clientId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/clients/:clientId/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const data = {
        ...req.body,
        clientId: req.params.clientId,
        status: req.body.status || 'Active',
        createdAt: new Date().toISOString()
      };

      // Convert createdAt to proper date string format
      data.createdAt = data.createdAt.split('.')[0].replace('T', ' ');

      const project = await storage.createProject(data);
      res.status(201).json(project);
    } catch(error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer"
    const users = await storage.getUsersByRole("customer");
    res.json(users);
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

  // Update the projects endpoint to properly transform the data
  app.get("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      console.log("Fetching projects for client ID:", req.params.id);
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Fetch projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects?client_id=${req.params.id}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        // If no projects found, return empty array instead of error
        if (projectsResponse.status === 404) {
          return res.json([]);
        }
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const projectsData = await projectsResponse.json();
      console.log("Raw projects data:", projectsData);

      // Format the projects data according to Freshbooks structure
      const formattedProjects = projectsData.projects.map(project => ({
        id: project.id.toString(),
        title: project.title?.trim() || 'Untitled Project',
        description: project.description || '',
        status: project.complete ? 'Completed' : (project.active ? 'Active' : 'Inactive'),
        dueDate: project.due_date,
        budget: project.budget,
        fixedPrice: project.fixed_price,
        createdAt: project.created_at,
        clientId: project.client_id.toString(),
        billingMethod: project.billing_method,
        projectType: project.project_type,
        billedAmount: project.billed_amount,
        billedStatus: project.billed_status,
        services: project.services || []
      }));

      console.log("Formatted projects:", formattedProjects);
      res.json(formattedProjects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({
        error: "Failed to fetch client projects",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint for updating projects
  app.put("/api/freshbooks/projects/:id", requireAdmin, async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Update project using the correct endpoint
      const updateResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project/${req.params.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: req.body.project
          })
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Project update error response:", errorText);
        throw new Error(`Failed to update project: ${updateResponse.status}`);
      }

      const updatedProject = await updateResponse.json();

      // Format the response
      const formattedProject = {
        id: updatedProject.project.id.toString(),
        title: updatedProject.project.title,
        description: updatedProject.project.description || '',
        status: updatedProject.project.complete ? 'Completed' : 'Active',
        dueDate: updatedProject.project.due_date,
        budget: updatedProject.project.budget,
        fixedPrice: updatedProject.project.fixed_price,
        createdAt: updatedProject.project.created_at,
        clientId: updatedProject.project.client_id.toString()
      };

      res.json(formattedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({
        error: "Failed to update project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.post("/api/freshbooks/clients/:id/projects", async (req, res) => {
    try {
      const tokens = req.session.freshbooksTokens;
      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      // Create project using the correct endpoint
      const createProjectResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/project`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: {
              title: req.body.title,
              description: req.body.description,
              client_id: req.params.id,
              project_type: "fixed_price", // or hourly_rate based on your needs
              due_date: req.body.dueDate,
              fixed_price: req.body.budget || 0
            }
          })
        }
      );

      if (!createProjectResponse.ok) {
        const errorData = await createProjectResponse.json();
        throw new Error(errorData.message || `Failed to create project: ${createProjectResponse.status}`);
      }

      const projectData = await createProjectResponse.json();
      const project = projectData.response.result.project;

      // Format the response
      const formattedProject = {
        id: project.id.toString(),
        title: project.title,
        description: project.description || '',
        status: project.complete ? 'Completed' : 'Active',
        createdAt: new Date(project.created_at * 1000).toISOString()
      };

      res.status(201).json(formattedProject);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(400).json({
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this new endpoint before the projects routes
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Get all users with role "customer"
    const users = await storage.getUsersByRole("customer");
    res.json(users);
  });

  // Add this debug endpoint with the other Freshbooks routes
  app.get("/api/freshbooks/debug/projects", requireAdmin, async (req, res) => {
    try {
      console.log("Fetching raw Freshbooks project data for debugging");
      const tokens = req.session.freshbooksTokens;

      if (!tokens) {
        return res.status(401).json({
          error: "Freshbooks not connected",
          details: "Please connect your Freshbooks account first"
        });
      }

      // Get the business ID from user profile
      const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!meResponse.ok) {
        throw new Error(`Failed to get user details: ${meResponse.status}`);
      }

      const meData = await meResponse.json();
      const businessId = meData.response?.business_memberships?.[0]?.business?.id;

      if (!businessId) {
        throw new Error("No business ID found in user profile");
      }

      console.log("Using business ID:", businessId);

      // Fetch all projects using the correct endpoint
      const projectsResponse = await fetch(
        `https://api.freshbooks.com/projects/business/${businessId}/projects`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      if (!projectsResponse.ok) {
        const errorText = await projectsResponse.text();
        console.error("Projects API error response:", errorText);
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const rawData = await projectsResponse.json();
      console.log("Raw projects response:", JSON.stringify(rawData, null, 2));
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