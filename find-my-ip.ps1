# PowerShell script to find your computer's IP address for React Native development

Write-Host "`n=== Finding Your Computer's IP Address ===" -ForegroundColor Cyan
Write-Host ""

# Get all network adapters with IPv4 addresses
$adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }

Write-Host "Available IP Addresses:" -ForegroundColor Yellow
Write-Host ""

foreach ($adapter in $adapters) {
    $interface = Get-NetAdapter | Where-Object { $_.InterfaceIndex -eq $adapter.InterfaceIndex }
    $status = if ($interface.Status -eq "Up") { "✓ Active" } else { "✗ Inactive" }
    
    Write-Host "  IP: $($adapter.IPAddress)" -ForegroundColor Green
    Write-Host "    Adapter: $($interface.Name)" -ForegroundColor Gray
    Write-Host "    Status: $status" -ForegroundColor $(if ($interface.Status -eq "Up") { "Green" } else { "Red" })
    Write-Host ""
}

# Find the most likely Wi-Fi IP (usually the one that's active and not a virtual adapter)
$wifiIP = $adapters | Where-Object { 
    $interface = Get-NetAdapter | Where-Object { $_.InterfaceIndex -eq $_.InterfaceIndex }
    $interface.Status -eq "Up" -and 
    ($interface.Name -like "*Wi-Fi*" -or $interface.Name -like "*Wireless*" -or $interface.Name -notlike "*Virtual*" -or $interface.Name -notlike "*VMware*" -or $interface.Name -notlike "*VirtualBox*")
} | Select-Object -First 1

if ($wifiIP) {
    Write-Host "=== Recommended IP for React Native ===" -ForegroundColor Cyan
    Write-Host "  $($wifiIP.IPAddress)" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    Write-Host "Update your config.ts with:" -ForegroundColor Yellow
    Write-Host "  export const API_BASE_URL = `"http://$($wifiIP.IPAddress):8000`";" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "=== Manual Selection Required ===" -ForegroundColor Yellow
    Write-Host "Please choose the IP address that matches your Wi-Fi network." -ForegroundColor White
    Write-Host "Look for the one that's 'Active' and not a virtual adapter." -ForegroundColor White
    Write-Host ""
}

Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

