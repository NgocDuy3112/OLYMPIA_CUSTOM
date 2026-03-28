# Olympia Custom Backend - Test Suite

This directory contains the comprehensive test suite for the Olympia Custom 3 backend application.

## Test Structure

```
tests/
├── conftest.py                 # Test configuration and fixtures
├── e2e_auth_flow.py           # End-to-end authentication flow test
├── test_auth.py               # Authentication core functions
├── test_user.py               # User model and functions
├── test_answer.py             # Answer core functions
├── test_question.py           # Question core functions
├── test_match.py              # Match core functions
├── test_record.py             # Record core functions
├── test_otp.py                # OTP (One-Time Password) functions
├── test_routes.py             # API route tests
└── run_tests.py               # Test runner script
```

## Test Categories

### 1. Unit Tests
- Test individual functions in isolation
- Cover core business logic in `core/` modules
- Fast execution with mocked dependencies

### 2. Integration Tests
- Test API endpoints and their integration
- Verify database operations work correctly
- Test with real database connections

### 3. End-to-End Tests
- Test complete user workflows
- Verify system behavior from end to end
- Currently includes authentication flow test

## Running Tests

### Prerequisites
Make sure you have the development dependencies installed:

```bash
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-mock pytest-cov
```

### Running All Tests
```bash
# Run all tests with coverage
python run_tests.py

# Or run directly with pytest
python -m pytest tests/ -v --cov=.
```

### Running Specific Test Types
```bash
# Run only unit tests
python run_tests.py --type unit

# Run only integration tests
python run_tests.py --type integration

# Run E2E test
python run_tests.py --type e2e
```

### Running Individual Test Files
```bash
# Run specific test file
python -m pytest tests/test_auth.py -v

# Run with coverage for specific module
python -m pytest tests/test_auth.py --cov=core.auth
```

## Test Coverage

The test suite aims for:
- 100% coverage of authentication functions
- 90%+ coverage of core business logic
- Comprehensive API endpoint testing
- Edge case and error condition testing

## Test Philosophy

### 1. Async Testing
All tests are written to handle async functions properly using `pytest-asyncio`:
```python
@pytest.mark.asyncio
async def test_my_async_function():
    # Test code here
    pass
```

### 2. Database Testing
Tests use in-memory SQLite databases for fast execution:
- Each test gets a fresh database state
- No external database dependencies
- Fast and reliable test execution

### 3. Mocking External Dependencies
External services like email and Valkey are mocked:
- Prevents network calls during testing
- Makes tests deterministic
- Faster execution

### 4. Test Fixtures
Common test data and setup are provided via fixtures in `conftest.py`:
- `db_session`: Database session for each test
- `sample_user`: Pre-created user for testing
- `mock_valkey`: Mocked Valkey instance
- `mock_email_utils`: Mocked email utilities

## Adding New Tests

When adding new functionality, follow these guidelines:

1. **Unit Tests**: Add to the appropriate test file in the `tests/` directory
2. **Integration Tests**: Add to `test_routes.py` or create a new route test file
3. **Fixtures**: Add reusable test data/setup to `conftest.py`
4. **Coverage**: Aim for 100% coverage of new code

Example test structure:
```python
@pytest.mark.asyncio
async def test_function_name(db_session, sample_user):
    # Arrange
    # Setup test data
    
    # Act
    # Call the function being tested
    
    # Assert
    # Verify expected behavior
```

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:
- Fast execution with in-memory databases
- Comprehensive coverage reporting
- Fail-fast on errors
- Detailed test reports