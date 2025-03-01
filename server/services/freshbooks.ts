import type { User } from "@shared/schema";
import { Client } from '@freshbooks/api';

export class FreshbooksService {
  private client: Client | null = null;

  private async ensureClient() {
    if (this.client) return this.client;

    if (!process.env.FRESHBOOKS_CLIENT_ID || !process.env.FRESHBOOKS_CLIENT_SECRET) {
      throw new Error("Missing required Freshbooks environment variables");
    }

    try {
      console.log("Initializing Freshbooks client...");
      // Import using CommonJS require since the package seems to have issues with ESM
      const FreshBooks = require('@freshbooks/api').Client;

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
        console.error("Stack trace:", error.stack);
      }
      throw error;
    }
  }

  async getAuthUrl(): Promise<string> {
    try {
      const client = await this.ensureClient();
      console.log("Getting authorization URL...");

      // Initialize the OAuth2 flow
      const authUrl = client.getAuthorizationUrl([
        "user:profile:read",
        "user:clients:read",
        "user:projects:read",
        "user:invoices:read",
      ]);

      console.log("Generated authorization URL:", authUrl);
      return authUrl;
    } catch (error) {
      console.error("Error getting auth URL:", error);
      throw error;
    }
  }

  async handleCallback(code: string): Promise<any> {
    try {
      const client = await this.ensureClient();
      console.log("Exchanging auth code for tokens...");

      const tokenResponse = await client.getAccessToken({
        code,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      console.log("Token exchange response:", {
        hasAccessToken: !!tokenResponse.access_token,
        hasRefreshToken: !!tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in
      });

      if (!tokenResponse.access_token) {
        throw new Error("Failed to get access token from Freshbooks");
      }

      return {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_in: tokenResponse.expires_in || 3600,
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
      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const identity = await client.getCurrentUser();
      console.log("User response:", identity);

      if (!identity || !identity.accountId) {
        throw new Error("Could not fetch user details");
      }

      const accountId = identity.accountId;
      console.log(`Fetching clients for account ${accountId}...`);

      const clientsResponse = await client.clients.list({
        accountId: String(accountId),
        include: ["email", "organization", "phone"]
      });

      console.log("Raw clients response:", clientsResponse);

      if (!clientsResponse || !clientsResponse.clients) {
        console.log("No clients found in response");
        return [];
      }

      return clientsResponse.clients.map(client => ({
        id: client.id,
        email: client.email || '',
        organization: client.organization || '',
        phoneNumber: client.phone || '',
        status: client.visState || 'active'
      }));
    } catch (error) {
      console.error("Error fetching Freshbooks clients:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      throw error;
    }
  }

  async syncProjects(accessToken: string) {
    try {
      const client = await this.ensureClient();
      client.setAccessToken(accessToken);

      const identity = await client.users.me();
      const accountId = identity.response.result.id;

      if (!accountId) {
        throw new Error("No Freshbooks account found");
      }

      console.log(`Fetching projects for account ${accountId}...`);
      const { response } = await client.projects.list({
        accountId: String(accountId),
        include: ["tasks", "team"]
      });

      return response.result.projects || [];
    } catch (error) {
      console.error("Error syncing Freshbooks projects:", error);
      return [];
    }
  }

  async syncInvoices(accessToken: string) {
    try {
      const client = await this.ensureClient();
      client.setAccessToken(accessToken);

      const identity = await client.users.me();
      const accountId = identity.response.result.id;

      if (!accountId) {
        throw new Error("No Freshbooks account found");
      }

      console.log(`Fetching invoices for account ${accountId}...`);
      const { response } = await client.invoices.list({
        accountId: String(accountId),
        include: ["lines", "payments"]
      });

      return response.result.invoices || [];
    } catch (error) {
      console.error("Error syncing Freshbooks invoices:", error);
      return [];
    }
  }
}

export const freshbooksService = new FreshbooksService();