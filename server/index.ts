import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import pg from 'pg';
import session from 'express-session';
import connectPg from 'connect-pg-simple';

const PostgresSessionStore = connectPg(session);

// Verify environment variables are set
function checkEnvironmentVariables() {
  const requiredVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'FRESHBOOKS_CLIENT_ID',
    'FRESHBOOKS_CLIENT_SECRET',
    'FRESHBOOKS_REDIRECT_URI'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  log('All required environment variables are set');
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure session middleware first
const sessionConfig = {
  store: new PostgresSessionStore({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

app.set('trust proxy', 1);
app.use(session(sessionConfig));

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Add test endpoint
app.get("/api/healthcheck", async (req, res) => {
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    // Test database connection
    await pool.query('SELECT 1');
    // If we get here, both the server and database are running
    res.json({ 
      status: "ok", 
      message: "Server is running",
      database: "connected" 
    });
  } catch (error) {
    log('Health check failed:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ 
      status: "error", 
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  log('Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

(async () => {
  try {
    log('Starting server...');
    checkEnvironmentVariables();

    const server = await registerRoutes(app);

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server is running on port ${port}`);
    });
  } catch (error) {
    log('Failed to start server:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();