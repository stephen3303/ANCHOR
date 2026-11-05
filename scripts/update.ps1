<#
.SYNOPSIS
  Pull the latest main and redeploy the running ANCHOR Docker app.

.DESCRIPTION
  1. Refuses to run if tracked files have uncommitted changes (untracked files
     such as .env and docker-compose.override.yml are fine).
  2. Fetches origin/main and stops, changing nothing, if it contains an
     .update-hold flag file (main is not ready to deploy). -Force overrides.
  3. Switches to main and fast-forwards it from origin.
  4. Runs npm ci when package-lock.json changed (or node_modules is missing).
  5. Starts PostgreSQL, waits for its health check, and applies new migrations
     (npm run db:migrate is safe to rerun; applied migrations are skipped).
  6. Optionally reruns the idempotent seed scripts (-Seed).
  7. Rebuilds and restarts the anchor container, then waits for it to answer.

  Database data is never deleted.

.EXAMPLE
  npm run app:update
  npm run app:update -- -Seed
  npm run app:update -- -Force
  powershell -ExecutionPolicy Bypass -File scripts/update.ps1 -Seed
#>
param(
  # Also run db:seed:commands, users, routing and messages (all safe to rerun).
  [switch]$Seed,
  # Deploy even when origin/main carries an .update-hold flag file.
  [switch]$Force,
  # URL used to confirm the app is up after the rebuild.
  [string]$Url = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Step([string]$Name) { Write-Host "`n==> $Name" -ForegroundColor Cyan }

# Run a native command and stop the script if it fails. PowerShell does not
# stop on a non-zero exit code by itself, so every call goes through here.
function Run([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE." }
}

try {
  Step "Checking Docker"
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker is not running. Start Docker Desktop and try again." }

  # Migrations and seeds run with host Node (see README), so check before pulling.
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed. Install Node 22 LTS (winget install OpenJS.NodeJS.LTS), open a new terminal, and rerun."
  }

  Step "Checking for uncommitted changes"
  $dirty = git status --porcelain --untracked-files=no
  if ($dirty) {
    Write-Host $dirty
    throw "Tracked files have uncommitted changes. Commit or stash them, then rerun."
  }

  Step "Checking that main is ready to deploy"
  # A developer commits .update-hold to main (its text says why) while main is
  # mid-change, and deletes it when main is ready. Check origin/main before
  # pulling so a held update leaves the running app and database untouched.
  Run git @("fetch", "origin", "main")
  # ls-tree prints the name only if the file exists and writes nothing to
  # stderr otherwise (Windows PowerShell turns redirected stderr into errors).
  if (git ls-tree --name-only origin/main -- .update-hold) {
    $reason = (git show "origin/main:.update-hold") -join "`n"
    if (-not $Force) {
      Write-Host $reason -ForegroundColor Yellow
      throw "main is on hold (.update-hold), so nothing was changed. Rerun once it is removed, or use -Force to deploy anyway."
    }
    Write-Host "Deploying despite the hold (-Force):`n$reason" -ForegroundColor Yellow
  }

  Step "Pulling main"
  # Capture the starting revision before switching branches, so lockfile
  # changes between the original checkout and the updated main trigger npm ci.
  $before = git rev-parse HEAD
  if ((git branch --show-current) -ne "main") { Run git @("switch", "main") }
  Run git @("pull", "--ff-only", "origin", "main")
  $after = git rev-parse HEAD
  $changed = @()
  if ($before -ne $after) {
    $changed = git diff --name-only $before $after
    Write-Host "Updated $($before.Substring(0, 7)) -> $($after.Substring(0, 7)) ($($changed.Count) files changed)"
  } else {
    Write-Host "Already up to date; rebuilding anyway."
  }

  if (($changed -contains "package-lock.json") -or -not (Test-Path "node_modules")) {
    Step "Installing dependencies (npm ci)"
    Run npm @("ci")
  }

  Step "Starting PostgreSQL"
  Run docker @("compose", "up", "-d", "--wait", "postgres")

  Step "Applying migrations"
  Run npm @("run", "db:migrate")

  if ($Seed) {
    foreach ($script in "db:seed:commands", "db:seed:users", "db:seed:routing", "db:seed:messages") {
      Step "Running $script"
      Run npm @("run", $script)
    }
  }

  # Migrations run before the rebuild so the new app code never starts against
  # an old schema.
  Step "Rebuilding and restarting the app"
  Run docker @("compose", "up", "-d", "--build", "anchor")

  Step "Waiting for $Url"
  $deadline = (Get-Date).AddSeconds(60)
  while ($true) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
      break
    } catch {
      if ((Get-Date) -gt $deadline) { throw "The app did not answer at $Url within 60 seconds. Check: docker compose logs --tail=50 anchor" }
      Start-Sleep -Seconds 2
    }
  }

  Write-Host "`nANCHOR is running $(git log --oneline -1) at $Url" -ForegroundColor Green
} catch {
  Write-Host "`nUpdate failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
