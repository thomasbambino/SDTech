import { Client } from "@freshbooks/api";
import type { User } from "@shared/schema";

export class FreshbooksService {
  private client: Client;

  constructor() {
    if (!process.env.FRESHBOOKS_CLIENT_ID) {
      throw new Error("FRESHBOOKS_CLIENT_ID environment variable is not set");
    }
    this.client = new Client(process.env.FRESHBOOKS_CLIENT_ID);
  }

  getAuthUrl(): string {
    return this.client.getAuthRequestUrl([
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
      const tokenResponse = await this.client.exchangeCodeForToken({
        code,
        clientSecret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      if (!tokenResponse) {
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

  async syncProjects(accessToken: string) {
    try {
      this.client.setAccessToken(accessToken);

      const response = await this.client.users.projects.list();
      return response.result?.projects || [];
    } catch (error) {
      console.error("Error syncing Freshbooks projects:", error);
      throw error;
    }
  }

  async syncInvoices(accessToken: string) {
    try {
      this.client.setAccessToken(accessToken);

      const response = await this.client.users.invoices.list();
      return response.result?.invoices || [];
    } catch (error) {
      console.error("Error syncing Freshbooks invoices:", error);
      throw error;
    }
  }
}

export const freshbooksService = new FreshbooksService();