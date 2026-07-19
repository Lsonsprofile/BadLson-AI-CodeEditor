# test-auth.ps1 - No external dependencies required
$baseUrl = "http://localhost:5002/api"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BadLson AI Code Editor - Auth Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if server is running
try {
    $healthCheck = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET -ErrorAction Stop
    Write-Host "✅ Server is running!" -ForegroundColor Green
} catch {
    Write-Host "❌ Server is not running. Please start it with: npm run dev:server" -ForegroundColor Red
    exit 1
}

# 1. Register a new user
Write-Host "`n📝 Registering user..." -ForegroundColor Yellow
$registerBody = @{
    email = "test@example.com"
    password = "testpassword123"
    name = "Test User"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$baseUrl/auth/register" `
        -Method POST `
        -ContentType "application/json" `
        -Body $registerBody
    
    Write-Host "✅ Registration successful!" -ForegroundColor Green
    Write-Host "   User: $($registerResponse.user.email)" -ForegroundColor Gray
    Write-Host "   Name: $($registerResponse.user.name)" -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "ℹ️ User already exists. Continuing with login..." -ForegroundColor Yellow
    } else {
        Write-Host "❌ Registration failed: $($_.Exception.Message)" -ForegroundColor Red
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Error: $($errorDetails.message)" -ForegroundColor Red
        exit 1
    }
}

# 2. Login
Write-Host "`n🔐 Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "test@example.com"
    password = "testpassword123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "   User: $($loginResponse.user.email)" -ForegroundColor Gray
    Write-Host "   Role: $($loginResponse.user.role)" -ForegroundColor Gray
    
    $token = $loginResponse.token
    Write-Host "`n📋 JWT Token:" -ForegroundColor Cyan
    Write-Host "   $token" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "   Error: $($errorDetails.message)" -ForegroundColor Red
    exit 1
}

# 3. Test protected endpoint with the token
Write-Host "`n🔒 Testing protected endpoint (GET /api/health)..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $healthResponse = Invoke-RestMethod -Uri "$baseUrl/health" `
        -Method GET `
        -Headers $headers
    
    Write-Host "✅ Protected endpoint accessible!" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor Gray
    Write-Host "   Environment: $($healthResponse.environment)" -ForegroundColor Gray
    Write-Host "   Uptime: $($healthResponse.uptime) seconds" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Protected endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 4. Test getting current user profile
Write-Host "`n👤 Getting current user profile..." -ForegroundColor Yellow
try {
    $profileResponse = Invoke-RestMethod -Uri "$baseUrl/auth/me" `
        -Method GET `
        -Headers $headers
    
    Write-Host "✅ Profile retrieved!" -ForegroundColor Green
    Write-Host "   ID: $($profileResponse.user.id)" -ForegroundColor Gray
    Write-Host "   Email: $($profileResponse.user.email)" -ForegroundColor Gray
    Write-Host "   Name: $($profileResponse.user.name)" -ForegroundColor Gray
    Write-Host "   Role: $($profileResponse.user.role)" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Failed to get profile: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test with invalid token (should fail)
Write-Host "`n🧪 Testing with invalid token (should fail)..." -ForegroundColor Yellow
$invalidHeaders = @{
    "Authorization" = "Bearer invalid.token.here"
}

try {
    $invalidResponse = Invoke-RestMethod -Uri "$baseUrl/health" `
        -Method GET `
        -Headers $invalidHeaders
    Write-Host "⚠️  Protected endpoint should have failed but succeeded!" -ForegroundColor Red
} catch {
    Write-Host "✅ Protected endpoint correctly rejected invalid token!" -ForegroundColor Green
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   Status: 401 Unauthorized" -ForegroundColor Gray
    }
}

# 6. Test without token (should fail)
Write-Host "`n🧪 Testing without token (should fail)..." -ForegroundColor Yellow
try {
    $noTokenResponse = Invoke-RestMethod -Uri "$baseUrl/health" `
        -Method GET
    Write-Host "⚠️  Protected endpoint should have failed but succeeded!" -ForegroundColor Red
} catch {
    Write-Host "✅ Protected endpoint correctly rejected request without token!" -ForegroundColor Green
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   Status: 401 Unauthorized" -ForegroundColor Gray
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ All tests completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan