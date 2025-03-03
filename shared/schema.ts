import { pgTable, text, serial, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Keep existing enums
export const userRoleEnum = pgEnum("user_role", ["pending", "customer", "admin"]);

// Update users table to include freshbooksId
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").default("pending").notNull(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phoneNumber: text("phone_number"),
  companyName: text("company_name"),
  address: text("address"),
  isTemporaryPassword: boolean("is_temporary_password").default(false),
  lastPasswordChange: timestamp("last_password_change"),
  createdAt: timestamp("created_at").defaultNow(),
  inquiryDetails: text("inquiry_details"),
  freshbooksId: text("freshbooks_id").unique(), // Add freshbooksId field
});

// Update projects table to include progress tracking
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  clientId: integer("client_id").references(() => users.id),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  progress: integer("progress").default(0), // Add progress field (0-100)
  freshbooksId: text("freshbooks_id").unique(), // Link to Freshbooks project
});

// Add project notes table
export const projectNotes = pgTable("project_notes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  createdBy: integer("created_by").references(() => users.id),
});

// Update documents table with additional fields
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  fileSize: integer("file_size"), // Add file size tracking
  fileType: text("file_type"), // Add file type tracking
  uploadedBy: integer("uploaded_by").references(() => users.id),
});

// Keep existing invoice table
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  freshbooksId: text("freshbooks_id").unique(),
});

// Add insert schemas for new tables
export const insertProjectNoteSchema = createInsertSchema(projectNotes).pick({
  projectId: true,
  content: true,
  createdBy: true,
});

// Update existing insert schemas
export const insertProjectSchema = createInsertSchema(projects).pick({
  title: true,
  description: true,
  clientId: true,
  status: true,
  progress: true,
  freshbooksId: true,
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  projectId: true,
  name: true,
  content: true,
  fileSize: true,
  fileType: true,
  uploadedBy: true,
});

// Keep other existing schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  companyName: true,
  phoneNumber: true,
  role: true,
  isTemporaryPassword: true,
  freshbooksId: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).pick({
  projectId: true,
  amount: true,
  status: true,
  dueDate: true,
  freshbooksId: true,
});

// Update the inquiry schema to match Freshbooks fields
export const insertInquirySchema = createInsertSchema(users).pick({
  email: true,
  phoneNumber: true,
  companyName: true,
}).extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phoneNumber: z.string().optional(),
  companyName: z.string().optional(),
  details: z.string().min(1, "Please provide details about your inquiry"),
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertProjectNote = z.infer<typeof insertProjectNoteSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInquiry = z.infer<typeof insertInquirySchema>;

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectNote = typeof projectNotes.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;