# Upload public/data to Cloudflare R2 via rclone.
#
# Prereqs (once):
#   1. winget install Rclone.Rclone  (or scoop install rclone / choco install rclone)
#   2. Create an R2 bucket + API token with Object Read & Write.
#   3. Configure an rclone remote named "r2":
#        rclone config create r2 s3 `
#          provider Cloudflare `
#          access_key_id YOUR_KEY `
#          secret_access_key YOUR_SECRET `
#          endpoint https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com `
#          acl private
#
# Usage:
#   ./scripts/upload_r2.ps1                       # full sync, bucket name = ocean-dashboard-data
#   ./scripts/upload_r2.ps1 -Bucket my-bucket     # override bucket
#   ./scripts/upload_r2.ps1 -DryRun               # preview only

param(
  [string]$Bucket = "oceanhealth-data",
  [string]$Remote = "r2",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
Set-Location $root

$commonArgs = @(
  "copy",
  "public/data",
  "${Remote}:${Bucket}/",
  "--exclude", "backup/**",
  "--exclude", "index.json",
  "--exclude", "*.log",
  "--header-upload", "Cache-Control: public, max-age=31536000, immutable",
  "--transfers", "16",
  "--checkers", "32",
  "--s3-chunk-size", "16M",
  "--progress",
  "--stats", "10s",
  "--stats-one-line"
)
if ($DryRun) { $commonArgs += "--dry-run" }

Write-Host "Uploading public/data to ${Remote}:${Bucket}/ ..." -ForegroundColor Cyan
& rclone @commonArgs
if ($LASTEXITCODE -ne 0) { throw "rclone exited with code $LASTEXITCODE" }

Write-Host "Done." -ForegroundColor Green
