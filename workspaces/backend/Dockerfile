# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files (for workspace resolution)
COPY package.json package-lock.json ./

# Copy backend workspace
COPY workspaces/backend ./workspaces/backend

# Install all dependencies (including workspace dependencies)
RUN npm ci

# Build TypeScript
RUN npm run build --workspace=backend

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy backend workspace package.json
COPY workspaces/backend/package.json ./workspaces/backend/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=backend

# Copy built code from builder
COPY --from=builder /app/workspaces/backend/dist ./workspaces/backend/dist

# Run as non-root user
USER node

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "workspaces/backend/dist/index.js"]
