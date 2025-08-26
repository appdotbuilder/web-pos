import { z } from 'zod';

// User roles enum
export const userRoleSchema = z.enum(['admin', 'kasir']);
export type UserRole = z.infer<typeof userRoleSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  role: userRoleSchema,
  full_name: z.string(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

// User input schemas
export const createUserInputSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  role: userRoleSchema,
  full_name: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: userRoleSchema.optional(),
  full_name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const loginInputSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Category schema
export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Category = z.infer<typeof categorySchema>;

// Category input schemas
export const createCategoryInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

// Product schema
export const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  barcode: z.string().nullable(),
  category_id: z.number(),
  purchase_price: z.number(),
  selling_price: z.number(),
  stock_quantity: z.number().int(),
  min_stock: z.number().int(),
  image_url: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Product = z.infer<typeof productSchema>;

// Product input schemas
export const createProductInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  barcode: z.string().nullable(),
  category_id: z.number(),
  purchase_price: z.number().positive(),
  selling_price: z.number().positive(),
  stock_quantity: z.number().int().nonnegative(),
  min_stock: z.number().int().nonnegative(),
  image_url: z.string().nullable(),
});

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  category_id: z.number().optional(),
  purchase_price: z.number().positive().optional(),
  selling_price: z.number().positive().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  min_stock: z.number().int().nonnegative().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

// Transaction status enum
export const transactionStatusSchema = z.enum(['pending', 'completed', 'cancelled']);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

// Payment method enum
export const paymentMethodSchema = z.enum(['cash', 'card', 'bank_transfer', 'e_wallet']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// Transaction schema
export const transactionSchema = z.object({
  id: z.number(),
  transaction_number: z.string(),
  user_id: z.number(),
  customer_name: z.string().nullable(),
  subtotal: z.number(),
  discount_percentage: z.number(),
  discount_amount: z.number(),
  tax_percentage: z.number(),
  tax_amount: z.number(),
  total_amount: z.number(),
  payment_method: paymentMethodSchema,
  payment_amount: z.number(),
  change_amount: z.number(),
  status: transactionStatusSchema,
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Transaction = z.infer<typeof transactionSchema>;

// Transaction item schema
export const transactionItemSchema = z.object({
  id: z.number(),
  transaction_id: z.number(),
  product_id: z.number(),
  product_name: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number(),
  total_price: z.number(),
  created_at: z.coerce.date(),
});

export type TransactionItem = z.infer<typeof transactionItemSchema>;

// Transaction input schemas
export const transactionItemInputSchema = z.object({
  product_id: z.number(),
  quantity: z.number().int().positive(),
});

export type TransactionItemInput = z.infer<typeof transactionItemInputSchema>;

export const createTransactionInputSchema = z.object({
  customer_name: z.string().nullable(),
  items: z.array(transactionItemInputSchema).min(1),
  discount_percentage: z.number().min(0).max(100),
  payment_method: paymentMethodSchema,
  payment_amount: z.number().positive(),
  notes: z.string().nullable(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

// Search and filter schemas
export const productSearchInputSchema = z.object({
  query: z.string().optional(),
  category_id: z.number().optional(),
  barcode: z.string().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;

export const transactionSearchInputSchema = z.object({
  transaction_number: z.string().optional(),
  user_id: z.number().optional(),
  status: transactionStatusSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export type TransactionSearchInput = z.infer<typeof transactionSearchInputSchema>;

// Receipt generation schema
export const generateReceiptInputSchema = z.object({
  transaction_id: z.number(),
  format: z.enum(['pdf', 'thermal']).optional(),
});

export type GenerateReceiptInput = z.infer<typeof generateReceiptInputSchema>;

// Response schemas for paginated results
export const paginatedProductsSchema = z.object({
  products: z.array(productSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  total_pages: z.number(),
});

export type PaginatedProducts = z.infer<typeof paginatedProductsSchema>;

export const paginatedTransactionsSchema = z.object({
  transactions: z.array(transactionSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  total_pages: z.number(),
});

export type PaginatedTransactions = z.infer<typeof paginatedTransactionsSchema>;

// Dashboard summary schema
export const dashboardSummarySchema = z.object({
  total_sales_today: z.number(),
  total_transactions_today: z.number(),
  low_stock_products: z.number(),
  total_revenue_month: z.number(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;