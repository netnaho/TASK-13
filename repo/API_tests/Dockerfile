FROM alpine:3
# Install curl, jq, and bash at image build time — no runtime installs needed.
RUN apk add --no-cache curl jq bash
WORKDIR /tests
COPY . .
# Default to the backend service name used inside the docker-compose network.
ENV API_BASE_URL=http://backend:3001/api
CMD ["bash", "run_api_tests.sh"]
