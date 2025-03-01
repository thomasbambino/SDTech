import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import pg from 'pg'; // Added import for pg library

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
    log('Health check failed:', error);
    res.status(500).json({ 
      status: "error", 
      message: error.message 
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

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server is running on port ${port}`);
    });
  } catch (error) {
    log('Failed to start server:', error);
    process.exit(1);
  }
})();