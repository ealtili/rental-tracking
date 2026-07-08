# Stage 1: Build the Vite frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve backend and frontend
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy package requirements and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy build files from builder stage and backend files
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
COPY --from=builder /app/data ./data_seed/

# Create a data and uploads directory for persistent database storage and temp uploads, then set owner to node
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app/data /app/uploads

# Expose default API/Server port
EXPOSE 5000

# Set environment for database file location
ENV DATABASE_PATH=/app/data/db.json

# Run as non-privileged system user
USER node

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r => r.status === 200 ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server/server.js"]
