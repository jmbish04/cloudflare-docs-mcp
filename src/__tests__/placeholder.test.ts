import { describe, it, expect } from 'vitest';

describe('Basic Architecture Tests', () => {
  describe('Module Exports', () => {
    it('should export ChatSessionActor', async () => {
      const { ChatSessionActor } = await import('../actors/ChatSessionActor');
      expect(ChatSessionActor).toBeDefined();
      expect(typeof ChatSessionActor).toBe('function');
    });

    it('should export CodeIngestionActor', async () => {
      const { CodeIngestionActor } = await import('../actors/CodeIngestionActor');
      expect(CodeIngestionActor).toBeDefined();
      expect(typeof CodeIngestionActor).toBe('function');
    });

    it('should export FeasibilityAgentActor', async () => {
      const { FeasibilityAgentActor } = await import('../actors/FeasibilityAgentActor');
      expect(FeasibilityAgentActor).toBeDefined();
      expect(typeof FeasibilityAgentActor).toBe('function');
    });

    it('should export ResearchWorkflow', async () => {
      const { ResearchWorkflow } = await import('../workflows/ResearchWorkflow');
      expect(ResearchWorkflow).toBeDefined();
      expect(typeof ResearchWorkflow).toBe('function');
    });
  });

  describe('Data Access Layer', () => {
    it('should export DataAccessLayer', async () => {
      const { DataAccessLayer } = await import('../data/dal');
      expect(DataAccessLayer).toBeDefined();
      expect(typeof DataAccessLayer).toBe('function');
    });
  });

  describe('VectorizeService', () => {
    it('should export VectorizeService', async () => {
      const { VectorizeService } = await import('../data/vectorize_service');
      expect(VectorizeService).toBeDefined();
      expect(typeof VectorizeService).toBe('function');
    });
  });
});
