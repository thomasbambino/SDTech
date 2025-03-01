import type { User } from "@shared/schema";

export class FreshbooksService {
  private client: any = null;

  private async ensureClient() {
    if (this.client) return this.client;

    if (!process.env.FRESHBOOKS_CLIENT_ID || !process.env.FRESHBOOKS_CLIENT_SECRET) {
      throw new Error("Missing required Freshbooks environment variables");
    }

    try {
      console.log("Starting Freshbooks client initialization...");

      // Import the default export from @freshbooks/api
      const FreshbooksAPI = await import('@freshbooks/api');
      console.log("Freshbooks API imported successfully");

      this.client = new FreshbooksAPI.default({
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
      console.log("Generating authorization URL...");

      const scopes = [
        "user:profile:read",
        "user:clients:read",
        "user:projects:read",
        "user:invoices:read",
      ];

      const authUrl = client.getAuthorizationUrl(scopes);
      console.log("Generated authorization URL:", authUrl);
      return authUrl;
    } catch (error) {
      console.error("Error generating auth URL:", error);
      throw error;
    }
  }

  async handleCallback(code: string): Promise<any> {
    try {
      const client = await this.ensureClient();
      console.log("Starting token exchange with code:", code.substring(0, 10) + "...");

      const tokenResponse = await client.getAccessToken(code);
      console.log("Token exchange response received");

      return {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_in: tokenResponse.expires_in || 3600,
        token_type: "Bearer"
      };
    } catch (error) {
      console.error("Token exchange error:", error);
      throw error;
    }
  }

  async getClients(accessToken: string) {
    try {
      const client = await this.ensureClient();
      console.log("Setting access token for client request...");
      client.setAccessToken(accessToken);

      const me = await client.users.me();
      console.log("Current user:", me);

      const businessId = me.business_memberships?.[0]?.business.id;
      if (!businessId) {
        throw new Error("No business ID found");
      }

      console.log("Fetching clients for business:", businessId);
      const response = await client.clients.list({
        businessId: String(businessId)
      });

      if (!response?.result?.clients) {
        console.log("No clients found in response");
        return [];
      }

      return response.result.clients.map(client => ({
        id: client.id,
        email: client.email || '',
        organization: client.organization || '',
        phoneNumber: client.phone || '',
        status: client.vis_state || 'active'
      }));
    } catch (error) {
      console.error("Error fetching clients:", error);
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