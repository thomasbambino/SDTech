import type { User } from "@shared/schema";

export class FreshbooksService {
  private client: any | null = null;

  private async ensureClient() {
    if (this.client) return this.client;

    if (!process.env.FRESHBOOKS_CLIENT_ID) {
      throw new Error("FRESHBOOKS_CLIENT_ID environment variable is not set");
    }

    try {
      console.log("Initializing Freshbooks client...");
      // Import Freshbooks SDK correctly
      const FreshBooksApi = await import('@freshbooks/api');
      const FreshBooks = FreshBooksApi.default;

      this.client = new FreshBooks(process.env.FRESHBOOKS_CLIENT_ID);
      console.log("Freshbooks client initialized successfully");
      return this.client;
    } catch (error) {
      console.error("Error initializing Freshbooks client:", error);
      return null;
    }
  }

  async getAuthUrl(): Promise<string> {
    const client = await this.ensureClient();
    if (!client) {
      throw new Error("Failed to initialize Freshbooks client");
    }

    return client.getAuthRequestUrl([
      "user:profile:read",
      "user:clients:read",
      "user:projects:read",
      "user:invoices:read",
    ]);
  }

  async handleCallback(code: string): Promise<any> {
    if (!process.env.FRESHBOOKS_CLIENT_SECRET || !process.env.FRESHBOOKS_REDIRECT_URI) {
      throw new Error("Missing required Freshbooks environment variables");
    }

    try {
      console.log("Exchanging auth code for tokens...");
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

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
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

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
      return [];
    }
  }

  async syncInvoices(accessToken: string) {
    try {
      console.log("Setting access token for invoice sync...");
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

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
      return [];
    }
  }

  async getClients(accessToken: string) {
    try {
      console.log("Setting access token for client sync...");
      const client = await this.ensureClient();
      if (!client) {
        throw new Error("Failed to initialize Freshbooks client");
      }

      client.setAccessToken(accessToken);

      console.log("Fetching user details...");
      const userResponse = await client.getCurrentUser();
      if (!userResponse || !userResponse.accountId) {
        throw new Error("No Freshbooks account found");
      }

      const accountId = userResponse.accountId;
      console.log(`Fetching clients for account ${accountId}...`);

      const clientsResponse = await client.clients.list({
        accountId,
        include: ["email", "organization", "phone"],
      });

      console.log("Clients response:", clientsResponse);

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
      return [];
    }
  }
}

export const freshbooksService = new FreshbooksService();