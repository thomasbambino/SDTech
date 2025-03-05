import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import pg from 'pg';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import fileUpload from 'express-fileupload';

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

// Create a router for API endpoints
const apiRouter = express.Router();

// Essential middleware for API routes
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({ extended: false }));

// Configure file upload middleware with proper error handling
apiRouter.use(fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  },
  abortOnLimit: true,
  responseOnLimit: "File size limit reached (10MB)",
  useTempFiles: false, // Store files in memory
  debug: true, // Enable debug mode for better error logging
  safeFileNames: true, // Remove special characters from filenames
  preserveExtension: true // Keep file extensions
}));

// Add request logging middleware for API routes
apiRouter.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Set proper content type for API responses
  res.setHeader('Content-Type', 'application/json');

  res.on("finish", () => {
    const duration = Date.now() - start;
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (capturedJsonResponse) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    }

    if (logLine.length > 80) {
      logLine = logLine.slice(0, 79) + "…";
    }

    log(logLine);
  });

  next();
});

// Add healthcheck endpoint
apiRouter.get("/healthcheck", async (req, res) => {
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    await pool.query('SELECT 1');
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

// Global error handler for API routes
apiRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  log('Unhandled API error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

// Mount API router before other middleware
app.use('/api', apiRouter);

// Global error handler (remains unchanged)
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

    // Register API routes first
    const server = await registerRoutes(app);

    // Add Vite/static middleware after API routes
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