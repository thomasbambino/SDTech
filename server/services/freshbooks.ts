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
      console.log("Initializing Freshbooks client with environment variables:", {
        clientId: process.env.FRESHBOOKS_CLIENT_ID?.substring(0, 5) + '...',
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI
      });

      const { Client } = await import('@freshbooks/api');

      this.client = new Client({
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
      throw new Error("Failed to initialize Freshbooks client: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  async getAuthUrl(): Promise<string> {
    try {
      const client = await this.ensureClient();
      console.log("Getting authorization URL...");

      const scopes = [
        "user:profile:read",
        "user:clients:read",
        "user:projects:read",
        "user:invoices:read",
      ];
      console.log("Requesting scopes:", scopes);

      return client.authorizeUrl(scopes);
    } catch (error) {
      console.error("Error getting auth URL:", error);
      throw new Error("Failed to get authorization URL: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  async handleCallback(code: string): Promise<any> {
    try {
      const client = await this.ensureClient();
      console.log("Exchanging authorization code for tokens...");

      const tokenResponse = await client.token.exchange({
        code,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      console.log("Token exchange successful:", {
        hasAccessToken: !!tokenResponse.accessToken,
        hasRefreshToken: !!tokenResponse.refreshToken,
        expiresIn: tokenResponse.expiresIn,
      });

      return {
        access_token: tokenResponse.accessToken,
        refresh_token: tokenResponse.refreshToken,
        expires_in: tokenResponse.expiresIn || 3600,
        token_type: "Bearer"
      };
    } catch (error) {
      console.error("Error during token exchange:", error);
      throw new Error("Failed to exchange authorization code: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  async getClients(accessToken: string) {
    try {
      const client = await this.ensureClient();
      client.setAccessToken(accessToken);

      console.log("Getting current user identity...");
      const identity = await client.users.me();
      console.log("User identity response:", identity);

      if (!identity || !identity.accountId) {
        throw new Error("Could not fetch user identity");
      }

      const accountId = identity.accountId;
      console.log(`Fetching clients for account ${accountId}...`);

      const response = await client.clients.list({
        accountId: String(accountId),
        includes: ["email", "organization", "phone"]
      });

      if (!response || !response.clients) {
        console.log("No clients found in response:", response);
        return [];
      }

      return response.clients.map(client => ({
        id: client.id,
        email: client.email || '',
        organization: client.organization || '',
        phoneNumber: client.phone || '',
        status: client.visState || 'active'
      }));
    } catch (error) {
      console.error("Error fetching Freshbooks clients:", error);
      throw new Error("Failed to fetch clients: " + (error instanceof Error ? error.message : String(error)));
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