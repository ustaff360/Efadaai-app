#!/bin/bash
set -e

# Asterisk Smart Agent Routing System — Setup Script
# Usage: ./setup.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "============================================="
echo "  Asterisk Smart Agent Routing System"
echo "  One-Command Setup"
echo "============================================="
echo -e "${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}ERROR: Docker Compose not found. Please install Docker Compose.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker found${NC}"

# Create .env if not exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp .env.example .env

    # Generate random passwords
    DB_PASS=$(openssl rand -base64 24 | tr -d '=/+' | head -c 24)
    SECRET=$(openssl rand -base64 32 | tr -d '=/+')

    sed -i "s/your_secure_password_here/$DB_PASS/" .env
    sed -i "s/your-secret-key-change-this-in-production/$SECRET/" .env

    echo -e "${GREEN}✓ .env created with auto-generated passwords${NC}"
    echo -e "${YELLOW}  Review .env and update SMTP settings if needed${NC}"
else
    echo -e "${GREEN}✓ .env already exists${NC}"
fi

# Build and start
echo -e "${YELLOW}Building containers...${NC}"
docker compose build

echo -e "${YELLOW}Starting services...${NC}"
docker compose up -d

# Wait for services
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Health check
echo -e "${YELLOW}Running health checks...${NC}"
HEALTH=$(curl -s http://localhost:8000/api/v1/health 2>/dev/null || echo "failed")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
else
    echo -e "${RED}⚠ Backend health check failed. Check logs: docker compose logs backend${NC}"
fi

echo ""
echo -e "${GREEN}============================================="
echo "  Setup Complete!"
echo "=============================================${NC}"
echo ""
echo "  Dashboard:  http://localhost"
echo "  API Docs:   http://localhost:8000/docs"
echo "  Health:     http://localhost:8000/api/v1/health"
echo ""
echo "  Commands:"
echo "    View logs:    docker compose logs -f"
echo "    Stop:         docker compose down"
echo "    Restart:      docker compose restart"
echo "    Full reset:   docker compose down -v && docker compose up -d"
echo ""
