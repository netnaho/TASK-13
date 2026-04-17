FROM mcr.microsoft.com/playwright:v1.40.0-jammy
WORKDIR /e2e
# Install npm dependencies (including Playwright) at image build time.
COPY package*.json ./
RUN npm ci
# Copy config and tests.
COPY . .
# Default URLs for reaching services inside the docker-compose network.
ENV FRONTEND_URL=http://frontend:3000
ENV BACKEND_URL=http://backend:3001
CMD ["npx", "playwright", "test"]
