# Agent Instructions

You are helping Ricardo Zermeño build QuantLab, a SaaS algorithmic trading 
platform.

## Core Principles
- Prioritize correctness in trading logic (PnL, fees, execution)
- Prefer simple, maintainable solutions over clever ones
- Always keep types consistent across frontend, backend, and engine
- Avoid breaking existing contracts (shared types)
## Coding Rules
- Use TypeScript for backend/frontend, Python for engine
- Reuse existing modules before creating new ones
- Keep functions small and testable
- Avoid blocking operations (always async where possible)
- Validate inputs explicitly
