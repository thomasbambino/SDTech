import type { User } from "@shared/schema";
import type { Client as FreshBooksClient } from '@freshbooks/api';

export class FreshbooksService {
  private client: FreshBooksClient | null = null;

  private async ensureClient() {
    if (this.client) return this.client;

    if (!process.env.FRESHBOOKS_CLIENT_ID || !process.env.FRESHBOOKS_CLIENT_SECRET) {
      throw new Error("Missing required Freshbooks environment variables");
    }

    try {
      console.log("Initializing Freshbooks client with config:", {
        clientId: process.env.FRESHBOOKS_CLIENT_ID,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI
      });

      const { Client: FreshBooks } = await import('@freshbooks/api');
      this.client = new FreshBooks({
        clientId: process.env.FRESHBOOKS_CLIENT_ID,
        clientSecret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      console.log("Freshbooks client initialized successfully");
      return this.client;
    } catch (error) {
      console.error("Error initializing Freshbooks client:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
      return null;
    }
  }

  async getAuthUrl(): Promise<string> {
    try {
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

      return client.authorizeUrl([
        "user:profile:read",
        "user:clients:read",
        "user:projects:read",
        "user:invoices:read",
      ]);
    } catch (error) {
      console.error("Error getting auth URL:", error);
      throw error;
    }
  }

  async handleCallback(code: string): Promise<any> {
    try {
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

      console.log("Exchanging auth code for tokens...");
      const tokenResponse = await client.token.exchange({
        code,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      if (!tokenResponse) {
        throw new Error("Failed to get access token from Freshbooks");
      }

      console.log("Successfully obtained access token");
      return {
        access_token: tokenResponse.accessToken,
        refresh_token: tokenResponse.refreshToken,
        expires_in: tokenResponse.expiresIn || 3600,
        token_type: "Bearer"
      };
    } catch (error) {
      console.error("Error getting Freshbooks access token:", error);
      throw error;
    }
  }

  async getClients(accessToken: string) {
    try {
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

      console.log("Setting access token for client fetch...");
      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const userResponse = await client.users.me();
      console.log("User response:", userResponse);

      if (!userResponse || !userResponse.id) {
        throw new Error("Could not fetch user details");
      }

      const accountId = userResponse.id;
      console.log(`Fetching clients for account ${accountId}...`);

      const clientsResponse = await client.clients.list({
        accountId,
        includes: ["email", "organization", "phone"],
      });
      console.log("Raw clients response:", clientsResponse);

      if (!clientsResponse || !clientsResponse.clients) {
        console.log("No clients found in response");
        return [];
      }

      return clientsResponse.clients.map(client => ({
        id: client.id,
        email: client.email,
        organization: client.organization,
        phoneNumber: client.phone,
        status: client.visState || 'active'
      }));
    } catch (error) {
      console.error("Error fetching Freshbooks clients:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
      return [];
    }
  }

  async syncProjects(accessToken: string) {
    try {
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const userResponse = await client.users.me();
      const accountId = userResponse.id;

      if (!accountId) {
        throw new Error("No Freshbooks account found");
      }

      console.log(`Fetching projects for account ${accountId}...`);
      const projectsResponse = await client.projects.list({
        accountId,
        includes: ["tasks", "team"],
      });

      return projectsResponse.projects || [];
    } catch (error) {
      console.error("Error syncing Freshbooks projects:", error);
      return [];
    }
  }

  async syncInvoices(accessToken: string) {
    try {
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const userResponse = await client.users.me();
      const accountId = userResponse.id;

      if (!accountId) {
        throw new Error("No Freshbooks account found");
      }

      console.log(`Fetching invoices for account ${accountId}...`);
      const invoicesResponse = await client.invoices.list({
        accountId,
        includes: ["lines", "payments"],
      });

      return invoicesResponse.invoices || [];
    } catch (error) {
      console.error("Error syncing Freshbooks invoices:", error);
      return [];
    }
  }
}

export const freshbooksService = new FreshbooksService();