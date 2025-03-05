import type { Express, Request, Response, NextFunction } from "express";
import type { Session } from 'express-session';
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProjectSchema, insertInvoiceSchema, insertDocumentSchema, insertInquirySchema } from "@shared/schema";
import { freshbooksService } from "./services/freshbooks";
import { emailService } from "./services/email";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import passport from "passport";
import type { User, InsertUser } from "@shared/schema";
import type { UploadedFile } from "express-fileupload";
import * as fs from "fs";
import * as path from "path";

// Type definitions
interface AuthenticatedRequest extends Request {
  user?: Express.User & User;
  session: Session & { 
    freshbooksTokens?: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    }
  } & Record<string, any>;
}

interface FreshbooksClientResponse {
  response: {
    result: {
      client: FreshbooksClient;
    }
  }
}

interface FreshbooksClient {
  id: number | string;
  fname: string;
  lname: string;
  email: string;
  home_phone?: string;
  organization?: string;
  p_street?: string;
  p_street2?: string;
  p_city?: string;
  p_province?: string;
  p_code?: string;
  p_country?: string;
  vis_state: number;
  signup_date?: string;
  updated?: string;
  created_at?: string;
}

interface CreateUserParams {
  username: string;
  password: string;
  email: string;
  role: 'pending' | 'customer' | 'admin';
  phoneNumber?: string | null;
  companyName?: string | null;
  isTemporaryPassword?: boolean;
  freshbooksId?: string | null;
  inquiryDetails?: string;
}

interface FreshbooksProject {
  id: number | string;
  title: string;
  description?: string;
  active: boolean;
  due_date?: string;
  budget?: number;
  fixed_price?: boolean;
  created_at?: string;
  client_id: number | string;
  billing_method?: string;
  project_type?: string;
  billed_amount?: number;
  billed_status?: string;
  completed?: boolean;
  complete?: boolean;
  progress?: number;
}

const scryptAsync = promisify(scrypt);

// Helper functions
function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || req.user?.role !== 'admin') {
    return res.status(403).send("Admin access required");
  }
  next();
}

function generateTemporaryPassword(): string {
  return randomBytes(8).toString('hex');
}

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
        freshbooksId: null
      });
      console.log('Initial admin user created successfully');
    }
  } catch (error) {
    console.error('Error creating initial admin user:', error);
    throw error;
  }
}

function validateId(id: string): number | null {
  const parsed = parseInt(id);
  return isNaN(parsed) ? null : parsed;
}

function getFreshbooksToken(req: AuthenticatedRequest): string | null {
  if (req.session.freshbooksTokens?.access_token) {
    return req.session.freshbooksTokens.access_token;
  }
  return process.env.FRESHBOOKS_ADMIN_TOKEN || null;
}

const formatDate = (dateString: string | null | undefined): string => {
  try {
    if (!dateString) return 'Date not available';

    let date: Date;
    if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
      date = new Date(dateString);
    } else if (!isNaN(Number(dateString))) {
      date = new Date(Number(dateString) * 1000);
    } else {
      return 'Invalid date';
    }

    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    return date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
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
  try {
    console.log('Setting up authentication...');
    setupAuth(app);
    console.log('Creating initial admin user...');
    await createInitialAdminUser();

    // Authentication routes
    app.post("/api/login", passport.authenticate("local"), async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const user = await storage.getUser(req.user.id);
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

    // User Management (Admin only)
    app.get("/api/users", requireAdmin, async (req: Request, res: Response) => {
      try {
        const users = await storage.getAllUsers();
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    // Freshbooks Integration
    app.get("/api/freshbooks/clients/:clientId/projects/:projectId", async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.isAuthenticated()) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { clientId, projectId } = req.params;
        console.log('Fetching project details from Freshbooks:', { clientId, projectId });

        const accessToken = getFreshbooksToken(req);
        if (!accessToken) {
          return res.status(401).json({ error: "Freshbooks authentication required" });
        }

        const meResponse = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!meResponse.ok) {
          throw new Error(`Failed to get account details: ${meResponse.status}`);
        }

        const meData = await meResponse.json();
        const accountId = meData.response?.business_memberships?.[0]?.business?.account_id;

        if (!accountId) {
          throw new Error("No account ID found in profile");
        }

        // Fetch project from Freshbooks
        const fbResponse = await fetch(
          `https://api.freshbooks.com/accounting/account/${accountId}/projects/projects/${projectId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!fbResponse.ok) {
          throw new Error(`Failed to fetch from Freshbooks: ${fbResponse.status}`);
        }

        const fbData = await fbResponse.json();
        if (!fbData.response?.result?.project) {
          return res.status(404).json({ error: "Project not found in Freshbooks" });
        }

        const fbProject = fbData.response.result.project;

        // Format project data
        const project = {
          id: fbProject.id.toString(),
          title: fbProject.title,
          description: fbProject.description || '',
          status: fbProject.complete ? 'Completed' : 'Active',
          createdAt: fbProject.created_at || new Date().toISOString(),
          clientId: fbProject.client_id?.toString() || '',
          budget: fbProject.budget,
          fixedPrice: fbProject.fixed_price ? 'Yes' : 'No',
          billingMethod: fbProject.billing_method,
          projectType: fbProject.project_type,
          billedAmount: fbProject.billed_amount,
          billedStatus: fbProject.billed_status,
          progress: fbProject.progress || 0
        };

        res.json(project);
      } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({
          error: "Failed to fetch project details",
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Return the configured server
    console.log('Routes registered successfully');
    return createServer(app);
  } catch (error) {
    console.error("Error in registerRoutes:", error);
    throw error;
  }
}