import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import session from "express-session";
import connectPg from "connect-pg-simple";
import { users, projects, invoices, documents, projectNotes } from "@shared/schema";
import type { User, Project, Invoice, Document, InsertUser, InsertProject, InsertInvoice, InsertDocument, ProjectNote, InsertProjectNote } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersByRole(role: 'pending' | 'customer' | 'admin'): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserRole(id: number, role: 'pending' | 'customer' | 'admin'): Promise<User>;
  updateUserPassword(id: number, password: string, isTemporary?: boolean): Promise<User>;
  hashPassword(password: string): Promise<string>;

  // Projects
  getProjects(clientId: number): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProjectProgress(id: number, progress: number): Promise<Project>;
  getProjectByFreshbooksId(freshbooksId: string): Promise<Project | undefined>;

  // Project Notes
  getProjectNotes(projectId: number): Promise<ProjectNote[]>;
  createProjectNote(note: InsertProjectNote): Promise<ProjectNote>;
  updateProjectNote(id: number, note: Partial<ProjectNote>): Promise<ProjectNote>;
  deleteProjectNote(id: number): Promise<void>;

  // Invoices
  getInvoices(projectId: number): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;

  // Documents
  getDocuments(projectId: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  }

  async getUser(id: number): Promise<User | undefined> {
    const results = await db.select().from(users).where(eq(users.id, id));
    return results[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const results = await db.select().from(users).where(eq(users.username, username));
    return results[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUsersByRole(role: 'pending' | 'customer' | 'admin'): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserRole(id: number, role: 'pending' | 'customer' | 'admin'): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPassword(id: number, password: string, isTemporary: boolean = false): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        password,
        isTemporaryPassword: isTemporary,
        lastPasswordChange: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getProjects(clientId: number): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.clientId, clientId));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const results = await db.select().from(projects).where(eq(projects.id, id));
    return results[0];
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProjectProgress(id: number, progress: number): Promise<Project> {
    const [project] = await db
      .update(projects)
      .set({ progress })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async getProjectByFreshbooksId(freshbooksId: string): Promise<Project | undefined> {
    const results = await db
      .select()
      .from(projects)
      .where(eq(projects.freshbooksId, freshbooksId));
    return results[0];
  }

  async getProjectNotes(projectId: number): Promise<ProjectNote[]> {
    return await db
      .select()
      .from(projectNotes)
      .where(eq(projectNotes.projectId, projectId))
      .orderBy(projectNotes.createdAt);
  }

  async createProjectNote(note: InsertProjectNote): Promise<ProjectNote> {
    const [newNote] = await db
      .insert(projectNotes)
      .values({
        ...note,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newNote;
  }

  async updateProjectNote(id: number, note: Partial<ProjectNote>): Promise<ProjectNote> {
    const [updatedNote] = await db.update(projectNotes).set(note).where(eq(projectNotes.id, id)).returning();
    return updatedNote;
  }

  async deleteProjectNote(id: number): Promise<void> {
    await db.delete(projectNotes).where(eq(projectNotes.id, id));
  }


  async getInvoices(projectId: number): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.projectId, projectId));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const results = await db.select().from(invoices).where(eq(invoices.id, id));
    return results[0];
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values(invoice).returning();
    return newInvoice;
  }

  async getDocuments(projectId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.projectId, projectId));
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db
      .insert(documents)
      .values({
        ...document,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newDocument;
  }
}

export const storage = new DatabaseStorage();