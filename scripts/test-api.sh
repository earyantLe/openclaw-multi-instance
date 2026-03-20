#!/bin/bash

# OpenClaw Enterprise API Test Suite
# Usage: ./scripts/test-api.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8080}"
AUTH_URL="${2:-http://localhost:3001}"
INSTANCE_URL="${3:-http://localhost:3002}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
test_result() {
    local name="$1"
    local status="$2"

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $name"
        ((TESTS_FAILED++))
    fi
}

# Make HTTP request and check status
http_get() {
    local url="$1"
    local expected_status="${2:-200}"

    local status=$(curl -s -o /dev/null -w "%{http_code}" "$url")

    if [ "$status" = "$expected_status" ]; then
        return 0
    else
        return 1
    fi
}

http_post() {
    local url="$1"
    local data="$2"
    local expected_status="${3:-200}"

    local status=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url")

    if [ "$status" = "$expected_status" ]; then
        return 0
    else
        return 1
    fi
}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   OpenClaw Enterprise API Test Suite              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Base URL: $BASE_URL"
echo "Auth URL: $AUTH_URL"
echo "Instance URL: $INSTANCE_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ===========================
# Health Check Tests
# ===========================
echo -e "${YELLOW}[1] Health Check Tests${NC}"

# Auth Service Health
if http_get "$AUTH_URL/health" 200; then
    test_result "Auth Service Health Check" "PASS"
else
    test_result "Auth Service Health Check" "FAIL"
fi

# Instance Service Health
if http_get "$INSTANCE_URL/health" 200; then
    test_result "Instance Service Health Check" "PASS"
else
    test_result "Instance Service Health Check" "FAIL"
fi

# NGINX Proxy Health
if http_get "$BASE_URL/health" 200; then
    test_result "NGINX Proxy Health Check" "PASS"
else
    test_result "NGINX Proxy Health Check" "FAIL"
fi

echo ""

# ===========================
# Authentication Tests
# ===========================
echo -e "${YELLOW}[2] Authentication Tests${NC}"

# Test login with invalid credentials (should fail)
if ! http_post "$AUTH_URL/api/auth/login" '{"email":"invalid","password":"invalid","tenantId":"00000000-0000-0000-0000-000000000000"}' 401; then
    test_result "Login with invalid credentials (expect 401)" "PASS"
else
    test_result "Login with invalid credentials (expect 401)" "FAIL"
fi

# Test registration with invalid email (should fail)
if ! http_post "$AUTH_URL/api/auth/register" '{"email":"invalid","password":"123456","tenantId":"00000000-0000-0000-0000-000000000000"}' 400; then
    test_result "Registration with invalid email (expect 400)" "PASS"
else
    test_result "Registration with invalid email (expect 400)" "FAIL"
fi

echo ""

# ===========================
# Instance API Tests (Unauthenticated)
# ===========================
echo -e "${YELLOW}[3] Instance API Tests (Unauthenticated)${NC}"

# Test instance list without auth (should fail)
if ! http_get "$INSTANCE_URL/api/instances" 401; then
    test_result "Instance list without auth (expect 401)" "PASS"
else
    test_result "Instance list without auth (expect 401)" "FAIL"
fi

echo ""

# ===========================
# Resource API Tests
# ===========================
echo -e "${YELLOW}[4] Resource API Tests${NC}"

# Test resource stats without auth (should fail)
if ! http_get "$INSTANCE_URL/api/resources/stats" 401; then
    test_result "Resource stats without auth (expect 401)" "PASS"
else
    test_result "Resource stats without auth (expect 401)" "FAIL"
fi

echo ""

# ===========================
# Summary
# ===========================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}Test Summary:${NC}"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo ""

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
