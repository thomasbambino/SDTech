import 'express-session';

declare module 'express-session' {
  interface SessionData {
    freshbooksTokens?: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };
  }
}
