#!/usr/bin/env bash
# Checks that this Mac has everything Conviction AI needs, and prints the fix for anything missing.
# Run from the repo root:  make doctor   (or: bash scripts/doctor.sh)
cd "$(dirname "$0")/.." || exit 1
ok=0; bad=0
pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; ok=$((ok+1)); }
fail() { printf "  \033[31m✗\033[0m %s\n      fix: %s\n" "$1" "$2"; bad=$((bad+1)); }
ver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

echo "Conviction AI · checking your Mac"
echo
echo "Tools"
if command -v node >/dev/null; then
  v=$(node -v | tr -d v); ver_ge "$v" 18.0.0 && pass "Node.js $v" || fail "Node.js $v is older than 18" "install the LTS version from nodejs.org"
else fail "Node.js not found" "install the LTS version from nodejs.org, then reopen Terminal"; fi
command -v npm >/dev/null && pass "npm $(npm -v)" || fail "npm not found" "it comes with Node.js; reinstall from nodejs.org"
command -v git >/dev/null && pass "$(git --version)" || fail "git not found" "run: xcode-select --install"
command -v make >/dev/null && pass "make" || fail "make not found" "run: xcode-select --install"
if command -v python3 >/dev/null; then
  v=$(python3 -c 'import sys;print("%d.%d.%d"%sys.version_info[:3])')
  ver_ge "$v" 3.9.0 && pass "Python $v" || fail "Python $v is older than 3.9" "install Python 3.12 from python.org"
  python3 -m venv --help >/dev/null 2>&1 || fail "Python venv module missing" "install Python 3.12 from python.org"
else fail "python3 not found" "run: xcode-select --install  (or install Python 3.12 from python.org)"; fi
if [ -d "$HOME/.npm" ] && [ -n "$(find "$HOME/.npm" -user 0 -print -quit 2>/dev/null)" ]; then
  fail "npm cache has files owned by root (causes EACCES errors)" "sudo chown -R $(id -u):$(id -g) \"$HOME/.npm\""
else pass "npm cache permissions"; fi

echo
echo "Postgres"
PGBIN=""
for d in /Library/PostgreSQL/*/bin /Applications/Postgres.app/Contents/Versions/latest/bin; do [ -x "$d/psql" ] && PGBIN="$d"; done
if command -v psql >/dev/null; then pass "psql on your PATH ($(psql --version | awk '{print $3}'))"
elif [ -n "$PGBIN" ]; then
  fail "psql installed at $PGBIN but not on your PATH (only needed to explore the data)" \
       "echo $PGBIN | sudo tee /etc/paths.d/postgresql   then quit and reopen Terminal"
else fail "No Postgres found" "install PostgreSQL from postgresql.org/download/macosx or Postgres.app"; fi
if (exec 3<>/dev/tcp/localhost/5432) 2>/dev/null || nc -z localhost 5432 2>/dev/null; then pass "Postgres server is running on port 5432"
else fail "Nothing is listening on port 5432" "start Postgres: open Postgres.app, or for the EDB installer run: sudo launchctl kickstart -k system/postgresql-18 (or restart your Mac)"; fi

echo
echo "Project"
if [ ! -f .env ]; then fail ".env not created yet" "run: make setup"
elif grep -Eq "^[^#]*password=CHANGE_ME" .env; then fail ".env still has the placeholder password" "open .env in a text editor and replace CHANGE_ME with your Postgres password"
else pass ".env exists"; fi
[ -x .venv/bin/python ] && pass "Python environment (.venv)" || fail "Python environment not created yet" "run: make setup"
[ -d web/node_modules ] && pass "UI packages installed" || fail "UI packages not installed yet" "run: make setup"
[ -f web/dist/index.html ] && pass "UI built (web/dist/index.html)" || fail "UI not built yet" "run: make build"
if [ -x .venv/bin/python ] && [ -f .env ] && ! grep -Eq "^[^#]*password=CHANGE_ME" .env; then
  msg=$(.venv/bin/python - <<'EOF' 2>&1
import sys; sys.path.insert(0, "backend")
import psycopg
from app.db import DATABASE_URL
try:
    with psycopg.connect(psycopg.conninfo.make_conninfo(DATABASE_URL, dbname="postgres"), connect_timeout=5):
        print("OK")
except Exception as e:
    print(str(e).strip().splitlines()[-1])
EOF
)
  if [ "$msg" = "OK" ]; then pass "Logged in to Postgres with the settings in .env"
  elif echo "$msg" | grep -qi "password"; then fail "Postgres rejected the password in .env" "fix the password in .env (the one you chose when installing PostgreSQL)"
  elif echo "$msg" | grep -qi "role"; then fail "Postgres user in .env does not exist: $msg" "use user=postgres for the EDB installer, or the Postgres.app line in .env.example"
  else fail "Could not connect to Postgres: $msg" "check that Postgres is running and .env is correct"; fi
fi

echo
if [ "$bad" -eq 0 ]; then echo "All $ok checks passed. Next: make db, then make run"; else echo "$ok passed, $bad to fix. Fix them top to bottom, then run make doctor again."; fi
