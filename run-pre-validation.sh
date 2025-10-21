#!/bin/bash
# Pre-Validation Test Suite for Task 016 (Mix-Minus Testing)
# Runs all automated tests to verify system readiness before manual 6-person test

set -e  # Exit on first failure

echo "================================================================================"
echo "OpenStudio Pre-Validation Test Suite"
echo "================================================================================"
echo ""
echo "This script validates that OpenStudio is ready for manual mix-minus testing."
echo "All automated tests must pass before gathering 6 participants."
echo ""
echo "Tests to run:"
echo "  1. test-webrtc.mjs          - Basic WebRTC connection (2 peers)"
echo "  2. test-audio-graph.mjs     - Web Audio foundation"
echo "  3. test-gain-controls.mjs   - Per-participant gain controls"
echo "  4. test-program-bus.mjs     - Program bus mixing"
echo "  5. test-mix-minus.mjs       - Mix-minus calculation (3 peers)"
echo "  6. test-return-feed.mjs     - Return feed routing (2 peers)"
echo ""
echo "================================================================================"
echo ""

# Track pass/fail counts
PASSED=0
FAILED=0
TESTS=()

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local timeout_seconds=${3:-60}

    echo "--- Running: $test_name ---"
    echo "File: $test_file"
    echo "Timeout: ${timeout_seconds}s"
    echo ""

    if timeout ${timeout_seconds} node "$test_file"; then
        echo ""
        echo "✅ PASSED: $test_name"
        echo ""
        PASSED=$((PASSED + 1))
        TESTS+=("✅ $test_name")
    else
        local exit_code=$?
        echo ""
        echo "❌ FAILED: $test_name (exit code: $exit_code)"
        echo ""
        FAILED=$((FAILED + 1))
        TESTS+=("❌ $test_name")

        # Don't exit on failure, continue with other tests
        return 0
    fi
}

# Run all tests
run_test "WebRTC Connection" "tests/test-webrtc.mjs" 60
run_test "Audio Graph Foundation" "tests/test-audio-graph.mjs" 60
run_test "Gain Controls" "tests/test-gain-controls.mjs" 60
run_test "Program Bus Mixing" "tests/test-program-bus.mjs" 60
run_test "Mix-Minus Calculation" "tests/test-mix-minus.mjs" 60
run_test "Return Feed Routing" "tests/test-return-feed.mjs" 60

# Summary
echo "================================================================================"
echo "Pre-Validation Test Summary"
echo "================================================================================"
echo ""

for test in "${TESTS[@]}"; do
    echo "$test"
done

echo ""
echo "Results: $PASSED passed, $FAILED failed (out of 6 total)"
echo ""

# Decision
if [ $FAILED -eq 0 ]; then
    echo "================================================================================"
    echo "✅ ALL TESTS PASSED - SYSTEM READY FOR MANUAL TESTING"
    echo "================================================================================"
    echo ""
    echo "Next steps:"
    echo "  1. Read: docs/testing/mix-minus-test-protocol.md"
    echo "  2. Gather 6 participants with headphones"
    echo "  3. Start web server: cd web && python3 -m http.server 8086"
    echo "  4. Verify infrastructure:"
    echo "     - Signaling server: curl http://localhost:6736/health"
    echo "     - Web client: curl http://localhost:8086"
    echo "  5. Begin manual testing session"
    echo ""
    exit 0
else
    echo "================================================================================"
    echo "❌ TESTS FAILED - FIX ISSUES BEFORE MANUAL TESTING"
    echo "================================================================================"
    echo ""
    echo "Do NOT proceed with manual testing until all automated tests pass."
    echo ""
    echo "Debugging steps:"
    echo "  1. Review failed test output above"
    echo "  2. Check browser console for errors (if Playwright tests failed)"
    echo "  3. Verify infrastructure is running:"
    echo "     - Signaling server: sudo docker compose ps"
    echo "     - Web server: ps aux | grep http.server"
    echo "  4. Re-run individual failed tests for more details"
    echo "  5. Fix identified issues"
    echo "  6. Re-run this script"
    echo ""
    echo "Common issues:"
    echo "  - Web server not running (cd web && python3 -m http.server 8086)"
    echo "  - Signaling server not running (sudo docker compose up -d)"
    echo "  - Port conflicts (check ports 6736, 8086, 6737, 3478)"
    echo "  - Chromium not installed for Playwright (npx playwright install chromium)"
    echo ""
    exit 1
fi
