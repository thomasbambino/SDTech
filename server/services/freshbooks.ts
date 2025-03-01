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

      // Import and inspect the Freshbooks API module
      const FreshbooksAPI = await import('@freshbooks/api');
      console.log("Freshbooks API module structure:", {
        availableExports: Object.keys(FreshbooksAPI),
        hasDefaultExport: 'default' in FreshbooksAPI,
        exportTypes: Object.entries(FreshbooksAPI).map(([key, value]) => 
          `${key}: ${typeof value}`
        )
      });

      // Stop here to inspect the module structure
      throw new Error("Debugging Freshbooks API module structure");

    } catch (error) {
      console.error("Error initializing Freshbooks client:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      throw new Error("Failed to initialize Freshbooks client: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  // Keep other methods unchanged for now
  async getAuthUrl(): Promise<string> {
    throw new Error("Method not implemented - debugging initialization first");
  }

  async handleCallback(code: string): Promise<any> {
    throw new Error("Method not implemented - debugging initialization first");
  }

  async getClients(accessToken: string) {
    throw new Error("Method not implemented - debugging initialization first");
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