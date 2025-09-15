# PowerShell script to test banner update with image upload

# Create a test image file
"Updated banner image content" | Out-File -FilePath "updated_banner_image.jpg" -Encoding ASCII

# Test updating banner with image
$uri = "https://lms-backend-724799456037.europe-west1.run.app/api/v1/admin/banner/68a4d97759b41da1acc993b9"
$filePath = "updated_banner_image.jpg"

# Create multipart form data for update
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"title`"$LF",
    "Updated Test Banner Title",
    "--$boundary", 
    "Content-Disposition: form-data; name=`"description`"$LF",
    "Updated test banner description",
    "--$boundary",
    "Content-Disposition: form-data; name=`"image`"; filename=`"updated_banner_image.jpg`"",
    "Content-Type: image/jpeg$LF",
    [System.IO.File]::ReadAllText($filePath),
    "--$boundary--$LF"
) -join $LF

try {
    $response = Invoke-WebRequest -Uri $uri -Method PUT -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary"
    Write-Host "✅ Banner update with image successful!"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "❌ Banner update failed!"
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
}

# Clean up test file
Remove-Item "updated_banner_image.jpg" -ErrorAction SilentlyContinue
