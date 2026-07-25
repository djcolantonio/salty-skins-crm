#!/usr/bin/env python3
"""
push.py — build, commit, push, and deploy Salty Skins CRM to Vercel.

Usage:
    python3 push.py "commit message here"
    python3 push.py "commit message here" --skip-deploy   # git only, no vercel deploy
    python3 push.py --deploy-only                         # vercel deploy, no git commit

Requirements (one-time):
    - Vercel CLI installed and logged in:  npm i -g vercel && vercel login
    - Project linked once:                 vercel link
    - Env vars set in Vercel (Project Settings -> Environment Variables):
        VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_PASSCODE
    - A git remote already configured (origin)

This script assumes the same deploy pattern as SafeHavenCRM: local build check,
git push to keep history, then `vercel --prod` to ship. Adjust PROJECT_DOMAIN
below once the Vercel project is linked to your subdomain.
"""

import subprocess
import sys
import shutil

# Set this once you've added the subdomain in Vercel's Domains settings, e.g.
# "crm.ssyogaretreats.com". Used only for the friendly message at the end.
PROJECT_DOMAIN = "crm.ssyogaretreats.com"

# On Windows, npm/vercel/vercel-cli are .cmd batch files, not real .exe files,
# so subprocess can't launch them directly — they need to go through the shell.
USE_SHELL = sys.platform == "win32"


def run(cmd, check=True):
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd, shell=USE_SHELL)
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result.returncode


def require(binary):
    if shutil.which(binary) is None:
        print(f"Error: '{binary}' not found on PATH. Install it before running push.py.")
        sys.exit(1)


def main():
    args = sys.argv[1:]
    deploy_only = "--deploy-only" in args
    skip_deploy = "--skip-deploy" in args
    args = [a for a in args if not a.startswith("--")]
    commit_msg = args[0] if args else "Update"

    if not deploy_only:
        require("git")
        # Sanity build before committing so a broken build never gets pushed.
        require("npm")
        print("\n== Installing / verifying dependencies ==")
        run(["npm", "install"])
        print("\n== Building ==")
        run(["npm", "run", "build"])

        print("\n== Committing ==")
        run(["git", "add", "-A"])
        # Allow "nothing to commit" without killing the script.
        run(["git", "commit", "-m", commit_msg], check=False)

        print("\n== Pushing ==")
        run(["git", "push"])

    if not skip_deploy:
        require("vercel")
        print("\n== Deploying to Vercel (production) ==")
        run(["vercel", "--prod"])
        print(f"\nDone. If the domain is attached in Vercel, it's live at https://{PROJECT_DOMAIN}")
    else:
        print("\nSkipped deploy step (--skip-deploy).")


if __name__ == "__main__":
    main()
