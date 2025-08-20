# PowerShell script to test banner creation with image upload

# Create a test image file
"Test banner image content" | Out-File -FilePath "test_banner_image.jpg" -Encoding ASCII

# Prepare form data
$uri = "http://localhost:8890/api/v1/admin/banner"
$filePath = "test_banner_image.jpg"

# Create multipart form data
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"title`"$LF",
    "Test Banner Title",
    "--$boundary",
    "Content-Disposition: form-data; name=`"description`"$LF", 
    "Test banner description",
    "--$boundary",
    "Content-Disposition: form-data; name=`"image`"; filename=`"test_banner_image.jpg`"",
    "Content-Type: image/jpeg$LF",
    [System.IO.File]::ReadAllText($filePath),
    "--$boundary--$LF"
) -join $LF

try {
    $response = Invoke-WebRequest -Uri $uri -Method POST -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary"
    Write-Host "✅ Banner creation successful!"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "❌ Banner creation failed!"
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
}

# Clean up test file
Remove-Item "test_banner_image.jpg" -ErrorAction SilentlyContinue
