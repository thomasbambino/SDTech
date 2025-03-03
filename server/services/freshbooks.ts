import type { User } from "@shared/schema";

// Function to properly format client data from Freshbooks API response
function formatClientData(clients: any[]) {
  return clients.map(client => {
    // Handle name (could be in organization or first/last name fields)
    let name = '';
    if (client.fname || client.lname) {
      name = `${client.fname || ''} ${client.lname || ''}`.trim();
    }

    // Handle organization (use as fallback name if no fname/lname)
    let organization = client.organization || '';
    if (!name && organization) {
      name = organization;
      organization = ''; // Clear organization if we're using it as the name
    }

    // Handle phone (check all possible phone fields)
    let phone = '';
    if (client.home_phone) phone = `${client.home_phone} (Home)`;
    else if (client.bus_phone) phone = `${client.bus_phone} (Business)`;
    else if (client.mob_phone) phone = `${client.mob_phone} (Mobile)`;

    // Handle address
    let address = [];
    if (client.p_street) address.push(client.p_street);
    if (client.p_street2) address.push(client.p_street2);
    if (client.p_city) address.push(client.p_city);
    if (client.p_province) address.push(client.p_province);
    if (client.p_code) address.push(client.p_code);
    if (client.p_country) address.push(client.p_country);

    // Format dates
    const createdDate = client.signup_date ? new Date(client.signup_date).toLocaleDateString() : '';
    const updatedDate = client.updated ? new Date(client.updated).toLocaleDateString() : '';

    // Determine status
    const status = client.vis_state === 0 ? 'Active' : 'Inactive';

    return {
      id: client.id,
      name: name || 'Unnamed Client',
      organization,
      email: client.email || '',
      phone,
      address: address.join(', '),
      status,
      createdDate,
      updatedDate
    };
  });
}

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
        "user:clients:write",
        "user:projects:read",
        "user:projects:write",  // Added write permission for projects
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

      const data = await clientsResponse.json();
      return formatClientData(data.response.result.clients);
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

  // Add this method to the FreshbooksService class
  async createClient(accessToken: string, clientData: any) {
    try {
      const accountId = await this.getBusinessId(accessToken);
      console.log("Creating client for account:", accountId);

      const response = await fetch(
        `${this.baseUrl}/accounting/account/${accountId}/users/clients`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ client: clientData })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create client: ${response.status}`);
      }

      const data = await response.json();
      return formatClientData([data.response.result.client])[0];
    } catch (error) {
      console.error("Error creating client:", error);
      throw error;
    }
  }
  // Add this method to the FreshbooksService class
  async updateClient(accessToken: string, clientId: string, clientData: any) {
    try {
      const accountId = await this.getBusinessId(accessToken);
      console.log(`Updating client ${clientId} for account:`, accountId);

      const response = await fetch(
        `${this.baseUrl}/accounting/account/${accountId}/users/clients/${clientId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ client: clientData })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update client: ${response.status}`);
      }

      const data = await response.json();
      return formatClientData([data.response.result.client])[0];
    } catch (error) {
      console.error("Error updating client:", error);
      throw error;
    }
  }

}

export const freshbooksService = new FreshbooksService();