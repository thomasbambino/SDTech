import type { User } from "@shared/schema";

export class FreshbooksService {
  private client: any | null = null; // temporarily type as any while we debug

  private async ensureClient() {
    if (this.client) return this.client;

    if (!process.env.FRESHBOOKS_CLIENT_ID) {
      throw new Error("FRESHBOOKS_CLIENT_ID environment variable is not set");
    }

    try {
      console.log("Initializing Freshbooks client...");
      const FreshBooks = await import('@freshbooks/api');
      this.client = new FreshBooks.default(process.env.FRESHBOOKS_CLIENT_ID);
      console.log("Freshbooks client initialized successfully");
      return this.client;
    } catch (error) {
      console.error("Error initializing Freshbooks client:", error);
      throw error;
    }
  }

  async getAuthUrl(): Promise<string> {
    const client = await this.ensureClient();
    return client.getAuthRequestUrl([
      "user:profile:read",
      "user:projects:read",
      "user:invoices:read",
    ]);
  }

  async handleCallback(code: string, user: User) {
    if (!process.env.FRESHBOOKS_CLIENT_SECRET || !process.env.FRESHBOOKS_REDIRECT_URI) {
      throw new Error("Missing required Freshbooks environment variables");
    }

    try {
      console.log("Exchanging auth code for tokens...");
      const client = await this.ensureClient();
      const tokenResponse = await client.getAuthorizationToken({
        code,
        clientSecret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      if (!tokenResponse) {
        throw new Error("Failed to get access token from Freshbooks");
      }

      console.log("Successfully obtained access token");
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

  async syncProjects(accessToken: string) {
    try {
      console.log("Setting access token for project sync...");
      const client = await this.ensureClient();
      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const userResponse = await client.getCurrentUser();
      const accountId = userResponse.accountId;

      if (!accountId) {
        throw new Error("No Freshbooks account found");
      }

      console.log(`Fetching projects for account ${accountId}...`);
      const projectsResponse = await client.projects.list({
        accountId,
        include: ["tasks", "team"],
      });

      return projectsResponse.projects || [];
    } catch (error) {
      console.error("Error syncing Freshbooks projects:", error);
      throw error;
    }
  }

  async syncInvoices(accessToken: string) {
    try {
      console.log("Setting access token for invoice sync...");
      const client = await this.ensureClient();
      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const userResponse = await client.getCurrentUser();
      const accountId = userResponse.accountId;

      if (!accountId) {
        throw new Error("No Freshbooks account found");
      }

      console.log(`Fetching invoices for account ${accountId}...`);
      const invoicesResponse = await client.invoices.list({
        accountId,
        include: ["lines", "payments"],
      });

      return invoicesResponse.invoices || [];
    } catch (error) {
      console.error("Error syncing Freshbooks invoices:", error);
      throw error;
    }
  }
}

export const freshbooksService = new FreshbooksService();