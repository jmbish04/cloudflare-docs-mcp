# Task 1: Finalize D1 Schema and Create Data Access Layer (DAL)

## Objective
Solidify the D1 database schema based on all existing migrations and create a typed Data Access Layer (DAL) to provide a safe and consistent interface for all database interactions.

## Context
The project currently has several migration files (`migrations/*.sql`) that define the database structure. Direct D1 calls are scattered throughout the actors and routes. To improve maintainability, type safety, and testability, we need to centralize all database logic.

## Requirements

### 1. Consolidate and Finalize Schema
- Review all `.sql` files in the `migrations/` directory.
- Create a single, definitive `schema.sql` file in a new `db/` directory that represents the complete, final state of the database.
- Ensure all tables, columns, types, and indexes are correctly defined and consistent. Pay special attention to `feasibility_jobs`, `repository_analysis`, and `curated_knowledge`.

### 2. Create a Typed Data Access Layer (DAL)
- Create a new file: `src/data/dal.ts`.
- In this file, create a `DataAccessLayer` class that takes a D1 binding in its constructor.
- For **each table** in the schema, create corresponding TypeScript interfaces (e.g., `FeasibilityJob`, `RepositoryAnalysis`).
- Implement typed methods for all necessary CRUD (Create, Read, Update, Delete) operations.

### Example DAL Methods (`dal.ts`):

```typescript
// src/data/dal.ts

import type { D1Database } from '@cloudflare/workers-types';

// --- Interfaces (based on schema.sql) ---
export interface FeasibilityJob {
  id: number;
  uuid: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  // ... other fields
}

export interface RepositoryAnalysis {
  id: number;
  job_id: number;
  // ... other fields
}


// --- DataAccessLayer Class ---
export class DataAccessLayer {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // --- Feasibility Jobs Methods ---
  async createFeasibilityJob(prompt: string): Promise<FeasibilityJob> {
    // ... implementation
  }

  async getFeasibilityJob(id: string | number): Promise<FeasibilityJob | null> {
    // ... implementation
  }

  async updateJobStatus(id: number, status: FeasibilityJob['status']): Promise<void> {
    // ... implementation
  }

  // --- Repository Analysis Methods ---
  async createRepoAnalysis(analysis: Omit<RepositoryAnalysis, 'id'>): Promise<RepositoryAnalysis> {
    // ... implementation
  }

  // ... other methods for curated_knowledge, etc.
}
```

### 3. Refactor Existing Code
- Go through the existing codebase (especially `src/actors/*.ts` and `src/index.ts`).
- Replace all direct `c.env.DB.prepare(...)` calls with methods from your new `DataAccessLayer` class.
- Ensure the DAL is instantiated and used correctly within the actors and route handlers.

## Acceptance Criteria
- A `db/schema.sql` file exists and accurately reflects the complete database schema.
- `src/data/dal.ts` exists and provides a comprehensive, typed interface for all database tables.
- All direct D1 queries in the application have been replaced with calls to the DAL.
- The application builds and runs successfully after the refactor.
