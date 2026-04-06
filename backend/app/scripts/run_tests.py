#!/usr/bin/env python3
"""
Test runner for Olympia Custom Backend
This script runs all tests in the test suite and provides a summary of results.
"""

import subprocess
import sys
import os
from pathlib import Path


def run_tests():
    """Run all tests in the test suite."""
    print("🔍 Running Olympia Custom Backend Tests")
    print("=" * 50)
    
    # Change to the backend app directory
    backend_app_dir = Path(__file__).parent / "app"
    os.chdir(backend_app_dir)
    
    # Install test dependencies if not already installed
    print("📦 Installing test dependencies...")
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "install", 
            "-r", "requirements.txt"
        ], check=True, capture_output=True)
        print("✅ Dependencies installed")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Failed to install dependencies: {e}")
        # Continue anyway, as they might already be installed
    
    # Run pytest with coverage
    print("\n🧪 Running tests with coverage...")
    try:
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "tests/",
            "-v",
            "--cov=.",
            "--cov-report=term-missing",
            "--cov-report=html:htmlcov",
            "-x"  # Stop on first failure
        ], check=True)
        
        print("\n✅ All tests passed!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Tests failed with exit code: {e.returncode}")
        return False


def run_unit_tests():
    """Run only unit tests (excluding integration/E2E tests)."""
    print("🔍 Running Unit Tests Only")
    print("=" * 50)
    
    backend_app_dir = Path(__file__).parent / "app"
    os.chdir(backend_app_dir)
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "tests/test_auth.py",
            "tests/test_user.py", 
            "tests/test_answer.py",
            "tests/test_question.py",
            "tests/test_match.py",
            "tests/test_record.py",
            "tests/test_otp.py",
            "-v",
            "--cov=core/",
            "--cov-report=term-missing"
        ], check=True)
        
        print("\n✅ Unit tests passed!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Unit tests failed with exit code: {e.returncode}")
        return False


def run_integration_tests():
    """Run integration tests."""
    print("🔍 Running Integration Tests")
    print("=" * 50)
    
    backend_app_dir = Path(__file__).parent / "app"
    os.chdir(backend_app_dir)
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "tests/test_routes.py",
            "-v",
            "-k", "not e2e"
        ], check=True)
        
        print("\n✅ Integration tests passed!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Integration tests failed with exit code: {e.returncode}")
        return False


def run_e2e_test():
    """Run the E2E test."""
    print("🔍 Running E2E Test")
    print("=" * 50)
    
    backend_app_dir = Path(__file__).parent / "app"
    os.chdir(backend_app_dir)
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "backend.app.tests.e2e_auth_flow"
        ], check=True)
        
        print("\n✅ E2E test passed!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ E2E test failed with exit code: {e.returncode}")
        return False


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test runner for Olympia Custom Backend")
    parser.add_argument(
        "--type", 
        choices=["all", "unit", "integration", "e2e"], 
        default="all",
        help="Type of tests to run (default: all)"
    )
    
    args = parser.parse_args()
    
    success = False
    
    if args.type == "all":
        success = run_tests()
    elif args.type == "unit":
        success = run_unit_tests()
    elif args.type == "integration":
        success = run_integration_tests()
    elif args.type == "e2e":
        success = run_e2e_test()
    
    sys.exit(0 if success else 1)