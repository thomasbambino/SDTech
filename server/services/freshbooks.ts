import type { User } from "@shared/schema";

export class FreshbooksService {
  private client: any | null = null;

  private async ensureClient() {
    if (this.client) return this.client;

    if (!process.env.FRESHBOOKS_CLIENT_ID || !process.env.FRESHBOOKS_CLIENT_SECRET) {
      throw new Error("Missing required Freshbooks environment variables");
    }

    try {
      console.log("Initializing Freshbooks client...");

      // Import Freshbooks SDK using dynamic import
      const FreshBooksModule = await import('@freshbooks/api');

      // Log the available exports to debug
      console.log("Available FreshBooks exports:", Object.keys(FreshBooksModule));

      this.client = new FreshBooksModule.Client({
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
        hasAccessToken: !!tokenResponse.accessToken,
        hasRefreshToken: !!tokenResponse.refreshToken,
        expiresIn: tokenResponse.expiresIn
      });

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
      client.setAccessToken(accessToken);

      console.log("Fetching user identity...");
      const identity = await client.users.me();

      if (!identity || !identity.id) {
        console.error("Invalid identity response:", identity);
        throw new Error("Could not fetch user details");
      }

      console.log("User identity:", identity);
      const accountId = identity.id;

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