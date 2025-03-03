import type { User } from "@shared/schema";

export class FreshbooksService {
  private baseUrl = 'https://api.freshbooks.com';
  private authUrl = 'https://auth.freshbooks.com/oauth/authorize/';

  async getAuthUrl(): Promise<string> {
    try {
      if (!process.env.FRESHBOOKS_CLIENT_ID || !process.env.FRESHBOOKS_CLIENT_SECRET || !process.env.FRESHBOOKS_REDIRECT_URI) {
        console.error("Missing required Freshbooks environment variables");
        throw new Error("Missing required Freshbooks configuration");
      }

      console.log("Starting authorization URL generation with environment variables:", {
        clientId: process.env.FRESHBOOKS_CLIENT_ID?.substring(0, 5) + '...',
        redirectUri: process.env.FRESHBOOKS_REDIRECT_URI,
      });

      const scopes = [
        "user:profile:read",
        "user:clients:read",
        "user:projects:read",
        "user:invoices:read",
      ];

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.FRESHBOOKS_CLIENT_ID!,
        redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI!,
        scope: scopes.join(' ')
      });

      const authUrl = `${this.authUrl}?${params.toString()}`;
      console.log("Generated authorization URL:", authUrl);
      return authUrl;
    } catch (error) {
      console.error("Error generating auth URL:", error);
      throw new Error("Failed to generate authorization URL");
    }
  }

  async handleCallback(code: string): Promise<any> {
    try {
      console.log("Exchanging authorization code for tokens...");

      const response = await fetch(`${this.baseUrl}/auth/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: process.env.FRESHBOOKS_CLIENT_ID,
          client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
          code: code,
          redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Token exchange failed:", error);
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const tokenData = await response.json();
      console.log("Token exchange successful:", {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in
      });

      return tokenData;
    } catch (error) {
      console.error("Error during token exchange:", error);
      throw new Error("Failed to exchange authorization code");
    }
  }

  private async getBusinessId(accessToken: string) {
    const meResponse = await fetch(`${this.baseUrl}/auth/api/v1/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!meResponse.ok) {
      throw new Error(`Failed to get user details: ${meResponse.status}`);
    }

    const meData = await meResponse.json();

    // Log the entire response to see its structure
    console.log("User profile response:", JSON.stringify(meData, null, 2));

    // Extract the account_id (this is the key part)
    const accountId = meData.response?.business_memberships?.[0]?.business?.account_id;

    if (!accountId) {
      console.error("Could not find account_id in response:", meData);
      throw new Error("No account ID found in user profile");
    }

    console.log("Found account ID:", accountId);
    return accountId;
  }

  async getClients(accessToken: string) {
    try {
      const accountId = await this.getBusinessId(accessToken);
      console.log("Fetching clients for account:", accountId);

      const clientsResponse = await fetch(
        `${this.baseUrl}/accounting/account/${accountId}/users/clients`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!clientsResponse.ok) {
        throw new Error(`Failed to fetch clients: ${clientsResponse.status}`);
      }

      const clientsData = await clientsResponse.json();
      return clientsData.response.result.clients.map((client: any) => ({
        id: client.id,
        email: client.email || '',
        organization: client.organization || '',
        phoneNumber: client.bus_phone || client.mob_phone || '',
        status: client.vis_state === 0 ? 'active' : 'inactive'
      }));
    } catch (error) {
      console.error("Error fetching clients:", error);
      throw error;
    }
  }

  async syncProjects(accessToken: string) {
    try {
      const accountId = await this.getBusinessId(accessToken);
      console.log(`Fetching projects for account ${accountId}...`);
      const projectsResponse = await fetch(
        `${this.baseUrl}/accounting/account/${accountId}/projects/projects`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!projectsResponse.ok) {
        throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
      }

      const projectsData = await projectsResponse.json();
      return projectsData.response.result.projects || [];
    } catch (error) {
      console.error("Error syncing Freshbooks projects:", error);
      return [];
    }
  }

  async syncInvoices(accessToken: string) {
    try {
      const accountId = await this.getBusinessId(accessToken);
      console.log(`Fetching invoices for account ${accountId}...`);
      const invoicesResponse = await fetch(
        `${this.baseUrl}/accounting/account/${accountId}/invoices/invoices`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!invoicesResponse.ok) {
        throw new Error(`Failed to fetch invoices: ${invoicesResponse.status}`);
      }

      const invoicesData = await invoicesResponse.json();
      return invoicesData.response.result.invoices || [];
    } catch (error) {
      console.error("Error syncing Freshbooks invoices:", error);
      return [];
    }
  }
}

export const freshbooksService = new FreshbooksService();